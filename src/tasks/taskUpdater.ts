import { App, TFile } from 'obsidian';
import { GCTask } from '../types';
import { serializeTask, TaskUpdates } from './taskSerializer';
import { parseSingleTaskLine } from './taskParser/main';
import { Logger } from '../utils/logger';
import { RegularExpressions } from '../utils/RegularExpressions';
import { isVirtualTask } from './virtualTaskGenerator';
import { PLUGIN_ID } from '../constants';

// ==================== 文件级写锁 ====================
// 同一文件的多次更新（如快速连续勾选、批量拖拽）必须串行执行，
// 否则后一次读取会基于前一次写入前的旧内容，整文件覆盖时丢失修改。
const fileWriteLocks = new Map<string, Promise<unknown>>();

export async function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
	const previous = fileWriteLocks.get(filePath) ?? Promise.resolve();
	const run = previous.then(fn, fn);
	const tail = run.catch(() => { });
	fileWriteLocks.set(filePath, tail);
	void tail.then(() => {
		if (fileWriteLocks.get(filePath) === tail) fileWriteLocks.delete(filePath);
	});
	return run;
}

// ==================== 未识别字段保留 ====================
// 序列化是整行重建，只输出已知字段。混合格式任务中的未知 dataview
// 内联字段与非结构化 %%注释%% 不在 GCTask 中，重建时会丢失——
// 这里从原行提取并原样追加回写。
const KNOWN_DV_FIELDS = new Set([
	'priority', 'created', 'start', 'scheduled', 'due',
	'cancelled', 'completion', 'repeat', 'guid',
]);

function extractUnrecognizedTokens(line: string): string[] {
	const tokens: string[] = [];
	let m: RegExpExecArray | null;
	// 未知 [key:: value] 内联字段（%%[key::value]%% 形式由 metadataFields 回写，跳过）
	const dvRegex = /\[([a-zA-Z_][\w-]*)::\s*[^\]]*\]/g;
	while ((m = dvRegex.exec(line))) {
		if (KNOWN_DV_FIELDS.has(m[1].toLowerCase())) continue;
		if (line.includes(`%%${m[0]}%%`)) continue;
		tokens.push(m[0]);
	}
	// 非结构化 %%注释%%（%%[key::value]%% 除外）
	const commentRegex = /%%(?!\s*\[)[^%]*%%/g;
	while ((m = commentRegex.exec(line))) {
		tokens.push(m[0]);
	}
	return tokens;
}

// ==================== 写回后即时刷新 ====================
// 文件修改事件要经过 50ms 防抖 + 75ms maxWait 才回流到视图；
// 用户主动写回（右键命令、表单保存等）完成后调用 refreshTaskView
// 立即重建该文件的 Repository 缓存并推送最新任务，消除 1~2s 的延迟感。

interface PluginTaskCache {
	refreshFile: (filePath: string) => Promise<void>;
	getAllTasks: () => GCTask[];
	getAllTasksIncludingVirtual?: () => GCTask[];
}

function getPluginTaskCache(app: App): PluginTaskCache | null {
	const appWithPlugins = app as App & {
		plugins?: { getPlugin?: (id: string) => { taskCache?: PluginTaskCache } | null };
	};
	return appWithPlugins.plugins?.getPlugin?.(PLUGIN_ID)?.taskCache ?? null;
}

/**
 * 写回任务文件后的即时刷新：跳过文件事件防抖，立即更新缓存并通知视图。
 */
export async function refreshTaskView(app: App, filePath: string): Promise<void> {
	try {
		const taskCache = getPluginTaskCache(app);
		if (!taskCache?.refreshFile) return;
		await taskCache.refreshFile(filePath);
		const { useCalendarStore } = await import('../ui/store/calendarStore');
		useCalendarStore.getState().notifyTasksUpdated(
			taskCache.getAllTasks(),
			filePath,
			taskCache.getAllTasksIncludingVirtual?.()
		);
	} catch (error) {
		Logger.error('refreshTaskView', 'Immediate refresh after write-back failed:', error);
	}
}

// ==================== 行内容校验 ====================

export function getGlobalTaskFilter(app: App): string {
	const appWithPlugins = app as App & {
		plugins?: { getPlugin?: (id: string) => { settings?: { globalTaskFilter?: string } } | null };
	};
	return appWithPlugins.plugins?.getPlugin?.(PLUGIN_ID)?.settings?.globalTaskFilter || '';
}

export type StrictLineLocateResult =
	| { status: 'found'; lineIndex: number; drifted: boolean }
	| { status: 'not_found' }
	| { status: 'ambiguous'; matchCount: number };

function stripTrailingCR(line: string): string {
	return line.endsWith('\r') ? line.slice(0, -1) : line;
}

function normalizeTaskDescription(desc: string): string {
	return desc
		.trim()
		.replace(RegularExpressions.DescriptionExtraction.collapseWhitespace, ' ');
}

/**
 * 严格任务行定位（防漂移与同名歧义误改）：
 * 1. 优先校验目标 1-based lineNumber 处行文本与期望原文完全一致（忽略行尾 \r）；
 * 2. 若行号已漂移，在全文中查找唯一与期望原文完全一致的行；
 * 3. 仍未命中时，按归一化描述在全文扫描（常规路径叠加 globalFilter 校验，虚拟父路径不校验），
 *    仅当匹配总数严格等于 1 时允许重定位；0 或 >=2（同名歧义）一律拒绝写入。
 */
export function locateTaskLineStrict(
	lines: readonly string[],
	task: GCTask,
	options: {
		globalFilter: string;
		ignoreGlobalFilter?: boolean;
		usedIndices?: ReadonlySet<number>;
	}
): StrictLineLocateResult {
	const effectiveGlobalFilter = options.ignoreGlobalFilter ? '' : options.globalFilter;
	const usedIndices = options.usedIndices;
	const expectedContent = stripTrailingCR(task.content || '');
	const expectedDesc = normalizeTaskDescription(task.description || '');

	const parseAt = (idx: number): GCTask | null => {
		const raw = lines[idx];
		if (raw === undefined) return null;
		return parseSingleTaskLine(
			stripTrailingCR(raw),
			task.filePath,
			task.fileName,
			idx + 1,
			['tasks', 'dataview'],
			effectiveGlobalFilter
		);
	};

	// 第 1 步：优先校验目标行号处的原文是否完全一致
	const rawIndex = task.lineNumber - 1;
	if (rawIndex >= 0 && rawIndex < lines.length && !usedIndices?.has(rawIndex)) {
		const parsedAtTarget = parseAt(rawIndex);
		if (parsedAtTarget && expectedContent.length > 0 && parsedAtTarget.content === expectedContent) {
			return { status: 'found', lineIndex: rawIndex, drifted: false };
		}
	}

	// 预先解析全文未占用行，避免步骤 2/3 重复解析
	const parsedCandidates: Array<{ index: number; parsed: GCTask }> = [];
	for (let i = 0; i < lines.length; i++) {
		if (usedIndices?.has(i)) continue;
		const parsed = parseAt(i);
		if (parsed) {
			parsedCandidates.push({ index: i, parsed });
		}
	}

	// 第 2 步：全文查找唯一与期望原文完全一致的行
	if (expectedContent.length > 0) {
		const exactMatches = parsedCandidates.filter((c) => c.parsed.content === expectedContent);
		if (exactMatches.length === 1) {
			return { status: 'found', lineIndex: exactMatches[0].index, drifted: true };
		}
		if (exactMatches.length >= 2) {
			return { status: 'ambiguous', matchCount: exactMatches.length };
		}
	}

	// 第 3 步：全文按归一化描述扫描，仅当匹配总数严格等于 1 时允许重定位
	if (expectedDesc.length > 0) {
		const descMatches = parsedCandidates.filter(
			(c) => normalizeTaskDescription(c.parsed.description) === expectedDesc
		);
		if (descMatches.length === 1) {
			return { status: 'found', lineIndex: descMatches[0].index, drifted: true };
		}
		if (descMatches.length >= 2) {
			return { status: 'ambiguous', matchCount: descMatches.length };
		}
	}

	return { status: 'not_found' };
}

/**
 * 在重读后的文件中定位任务行，兼容并发编辑导致的行号漂移。
 * 返回 0-based 行索引；找不到或存在同名歧义时返回 -1。
 */
export function locateTaskLine(lines: readonly string[], task: GCTask, globalFilter: string): number {
	const result = locateTaskLineStrict(lines, task, {
		globalFilter,
		ignoreGlobalFilter: Boolean(task.isVirtualContainer),
	});
	return result.status === 'found' ? result.lineIndex : -1;
}


/**
 * 确定任务使用的格式
 */
export function determineTaskFormat(
	task: GCTask,
	taskLine: string,
	enabledFormats: string[]
): 'dataview' | 'tasks' {
	// 优先使用任务本身的格式
	let formatToUse: 'dataview' | 'tasks' | undefined = task.format;
	if (!formatToUse) {
		if (/\[(priority|created|start|scheduled|due|cancelled|completion)::\s*[^\]]+\]/.test(taskLine)) {
			formatToUse = 'dataview';
		} else if (/([➕🛫⏳📅❌✅])\s*\d{4}-\d{2}-\d{2}/u.test(taskLine)) {
			formatToUse = 'tasks';
		} else if (enabledFormats.includes('dataview') && enabledFormats.includes('tasks')) {
			// 两者都支持时：如果行中已有方括号则 dataview，否则 tasks
			formatToUse = taskLine.includes('[') ? 'dataview' : 'tasks';
		} else if (enabledFormats.includes('dataview')) {
			formatToUse = 'dataview';
		} else {
			formatToUse = 'tasks';
		}
	}
	return formatToUse;
}

/**
 * 更新任务的完成状态
 *
 * **使用场景**：
 * 1. **BaseViewRenderer.ts:107** - 任务复选框点击事件
 *    - 用户点击任务前的复选框时，调用此函数切换任务完成状态
 *    - 完成时自动添加完成日期（completionDate）
 *    - 取消完成时自动移除完成日期
 *
 * @param app Obsidian App 实例
 * @param task 要更新的任务
 * @param completed 是否完成
 * @param enabledFormats 启用的任务格式
 */
export async function updateTaskCompletion(
	app: App,
	task: GCTask,
	completed: boolean,
	enabledFormats: string[]
): Promise<void> {
	// 虚拟父节点走独立无破坏分支：原地替换 [ ] <-> [x]，不触发 serializeTask 注入 globalFilter
	if (task.isVirtualContainer) {
		await updateVirtualContainerCompletion(app, task, completed);
		return;
	}

	const updates: TaskUpdates = { completed };

	// 标记为完成时添加完成日期，取消完成时移除完成日期
	if (completed) {
		updates.completionDate = new Date();
		// 同步更新状态为 done
		updates.status = 'done';
	} else {
		updates.completionDate = null;
		// 取消完成时，如果当前状态是 done，则改为 todo；其他状态保持不变
		if (task.status === 'done') {
			updates.status = 'todo';
		}
	}

	await updateTaskProperties(app, task, updates, enabledFormats);
}

/**
 * 虚拟父节点（isVirtualContainer === true）无破坏复选框回写：
 * - 复用 withFileLock() 同文件串行写锁
 * - 按 1-based 行号定位并进行无 globalFilter 依赖的严格防漂移校验与唯一重定位
 * - 仅原地替换复选框字符 [ ] <-> [x]，100% 保留原行缩进、列表标记、原始文本与内联属性
 * - 严禁调用 serializeTask() 注入 globalFilter
 */
export async function updateVirtualContainerCompletion(
	app: App,
	task: GCTask,
	completed: boolean
): Promise<void> {
	await withFileLock(task.filePath, async () => {
		const file = app.vault.getAbstractFileByPath(task.filePath);
		if (!(file instanceof TFile)) {
			throw new Error(`File not found: ${task.filePath}`);
		}

		const content = await app.vault.read(file);
		const lines = content.split('\n');

		const located = locateTaskLineStrict(lines, task, {
			globalFilter: '',
			ignoreGlobalFilter: true,
		});
		if (located.status === 'not_found') {
			throw new Error(
				`Virtual container task not found in file (line drift): ${task.filePath}:${task.lineNumber} — ` +
				`"${task.description || task.content}".`
			);
		}
		if (located.status === 'ambiguous') {
			throw new Error(
				`Virtual container task ambiguous match in file (line drift, ${located.matchCount} matches): ` +
				`${task.filePath}:${task.lineNumber} — "${task.description || task.content}".`
			);
		}
		if (located.drifted) {
			Logger.warn(
				'taskUpdater',
				`Virtual container line drift detected at ${task.filePath}:${task.lineNumber}, relocated to line ${located.lineIndex + 1}`
			);
		}
		const targetIndex = located.lineIndex;

		const originalLine = lines[targetIndex];
		const hasCR = originalLine.endsWith('\r');
		const cleanLine = hasCR ? originalLine.slice(0, -1) : originalLine;

		const match = cleanLine.match(RegularExpressions.Checkbox.checkboxPrefixRegex);
		if (!match) {
			throw new Error(`Invalid virtual task checkbox format at ${task.filePath}:${targetIndex + 1}`);
		}

		const nextChar = completed ? RegularExpressions.Checkbox.COMPLETED : RegularExpressions.Checkbox.INCOMPLETE;
		lines[targetIndex] = `${match[1]}[${nextChar}]${match[2]}${hasCR ? '\r' : ''}`;

		await app.vault.modify(file, lines.join('\n'));
	});
}

/**
 * 更新任务的日期字段（由日期筛选字段指定）
 *
 * **使用场景**：
 * 1. **WeekView.ts:89** - 拖拽任务到不同日期时，更新任务的日期字段
 * 2. **contextMenu/commands/cancelTask.ts:16** - 右键菜单取消任务时，设置取消日期
 *
 * @param app Obsidian App
 * @param task 任务对象
 * @param dateFieldName 日期字段名（dueDate, startDate, scheduledDate, createdDate, cancelledDate, completionDate）
 * @param newDate 新的日期值
 * @param enabledFormats 启用的任务格式
 */
export async function updateTaskDateField(
	app: App,
	task: GCTask,
	dateFieldName: string,
	newDate: Date,
	enabledFormats: string[]
): Promise<void> {
	const updates: TaskUpdates = {
		[dateFieldName]: newDate
	};

	await updateTaskProperties(app, task, updates, enabledFormats);
}

/**
 * 批量更新任务属性（优先级、完成状态、各日期字段）
 * 未提供的字段不做更改；传入 null 的日期字段表示清除该字段。
 */
export async function updateTaskProperties(
	app: App,
	task: GCTask,
	updates: TaskUpdates,
	enabledFormats: string[]
): Promise<void> {
	// 同文件更新串行化，消除读-改-写竞态（P0）
	await withFileLock(task.filePath, async () => {
		const startTime = performance.now();
		Logger.debug('taskUpdater', 'updateTaskProperties called:', {
			task: task.description || task.content,
			filePath: task.filePath,
			lineNumber: task.lineNumber,
			updates,
			format: task.format
		});

		const file = app.vault.getAbstractFileByPath(task.filePath);
		if (!(file instanceof TFile)) {
			throw new Error(`File not found: ${task.filePath}`);
		}

		const content = await app.vault.read(file);
		const lines = content.split('\n');

		// 严格行号漂移校验（P0）：优先校验目标行号原文一致，漂移时仅允许唯一重定位；
		// 找不到或存在同名歧义（>=2 命中）则拒绝写入，绝不盲写覆盖错行。
		const globalFilter = getGlobalTaskFilter(app);
		const located = locateTaskLineStrict(lines, task, {
			globalFilter,
			ignoreGlobalFilter: false,
		});
		if (located.status === 'not_found') {
			throw new Error(
				`Task not found in file (line drift): ${task.filePath}:${task.lineNumber} — ` +
				`"${task.description || task.content}". File changed externally; task cache will refresh.`
			);
		}
		if (located.status === 'ambiguous') {
			throw new Error(
				`Ambiguous task match in file (line drift, ${located.matchCount} matches): ${task.filePath}:${task.lineNumber} — ` +
				`"${task.description || task.content}". Refusing to overwrite.`
			);
		}
		if (located.drifted) {
			Logger.warn(
				'taskUpdater',
				`Line drift detected at ${task.filePath}:${task.lineNumber}, relocated to line ${located.lineIndex + 1}`
			);
		}
		const taskLineIndex = located.lineIndex;

		const rawTaskLine = lines[taskLineIndex];
		const hasCR = rawTaskLine.endsWith('\r');
		const taskLine = hasCR ? rawTaskLine.slice(0, -1) : rawTaskLine;

		Logger.debug('taskUpdater', 'Original task line:', taskLine);

		// 确定任务格式
		const formatToUse = determineTaskFormat(task, taskLine, enabledFormats);

		// 提取列表标记和缩进。与 step1 解析正则保持一致：
		// 支持 -/*/+/数字列表、引用块前缀（>）、自定义单字符复选框状态
		const listMatch = taskLine.match(RegularExpressions.taskRegex);
		if (!listMatch) {
			throw new Error('Invalid task format: cannot find list marker');
		}

		const indent = listMatch[1];  // 缩进（含引用前缀）
		const listMarker = listMatch[2];  // 列表标记

		// 使用新的序列化函数重建任务行（只返回任务内容部分，不包含列表标记）
		// 序列化函数会直接从插件设置中获取全局过滤器
		const taskContent = serializeTask(
			app,
			task,
			updates,
			formatToUse
		);

		Logger.debug('taskUpdater', 'Serialized task content:', taskContent);

		// 拼接完整的任务行：缩进 + 列表标记 + 空格 + 任务内容
		let finalTaskLine = `${indent}${listMarker} ${taskContent}`;

		// 保留未识别字段（P0 混合格式数据丢失）：未知的 [key:: value]
		// 内联字段与 %%注释%% 不参与序列化，从原行原样追加
		const preservedTokens = extractUnrecognizedTokens(taskLine)
			.filter(token => !finalTaskLine.includes(token));
		if (preservedTokens.length > 0) {
			finalTaskLine = `${finalTaskLine} ${preservedTokens.join(' ')}`;
		}

		Logger.debug('taskUpdater', 'Final task line:', finalTaskLine);

		// 写回文件（保留原行 CRLF 行尾，避免 Windows 笔记被写成混合换行）
		lines[taskLineIndex] = `${finalTaskLine}${hasCR ? '\r' : ''}`;
		const newContent = lines.join('\n');

		const writeStart = performance.now();
		await app.vault.modify(file, newContent);
		const writeElapsed = performance.now() - writeStart;
		Logger.debug('taskUpdater', `updateTaskProperties finished in ${(performance.now() - startTime).toFixed(2)}ms (write ${writeElapsed.toFixed(2)}ms)`);
	});
}

// ==================== T8：父任务拖拽原子批量顺延 ====================

export interface BatchTaskUpdateItem {
	task: GCTask;
	updates: TaskUpdates;
}

export interface BatchShiftLineSnapshot {
	lineIndex: number;
	originalLine: string;
	shiftedLine: string;
}

export interface BatchShiftResult {
	updatedCount: number;
	previousLines: BatchShiftLineSnapshot[];
}

/**
 * 递归收集同文件内指定父任务的所有后代任务（按 1-based 行号升序，跳过周期虚拟实例并防环路）
 */
export function collectDescendantTasks(
	parentTask: GCTask,
	allTasks: readonly GCTask[]
): GCTask[] {
	const sameFileTasks = allTasks.filter(
		(t) => t.filePath === parentTask.filePath && !isVirtualTask(t)
	);
	const childrenByParentLine = new Map<number, GCTask[]>();
	for (const t of sameFileTasks) {
		if (t.parentLineNumber !== undefined) {
			let list = childrenByParentLine.get(t.parentLineNumber);
			if (!list) {
				list = [];
				childrenByParentLine.set(t.parentLineNumber, list);
			}
			list.push(t);
		}
	}

	const descendants: GCTask[] = [];
	const visited = new Set<number>([parentTask.lineNumber]);

	const walk = (parentLine: number): void => {
		const children = childrenByParentLine.get(parentLine);
		if (!children) return;
		for (const child of children) {
			if (visited.has(child.lineNumber)) continue;
			visited.add(child.lineNumber);
			descendants.push(child);
			walk(child.lineNumber);
		}
	};

	walk(parentTask.lineNumber);
	descendants.sort((a, b) => a.lineNumber - b.lineNumber);
	return descendants;
}

/**
 * 基于 app.vault.process 的单文件多行日期原子批量回写：
 * - 在同一 withFileLock 与单次 vault.process 回调内完成全部行防漂移校验与序列化更新
 * - 任一行校验失败即抛出异常中止，避免部分写盘污染文件
 * - 返回每条被修改行的原始文本快照，供 TaskUndoService 一键撤销
 */
export async function shiftTaskDatesAtomically(
	app: App,
	filePath: string,
	items: readonly BatchTaskUpdateItem[],
	enabledFormats: string[]
): Promise<BatchShiftResult> {
	if (items.length === 0) {
		return { updatedCount: 0, previousLines: [] };
	}

	let previousLines: BatchShiftLineSnapshot[] = [];

	await withFileLock(filePath, async () => {
		const file = app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			throw new Error(`File not found: ${filePath}`);
		}

		const globalFilter = getGlobalTaskFilter(app);

		await app.vault.process(file, (content) => {
			const lines = content.split('\n');
			const usedIndices = new Set<number>();
			const snapshots: BatchShiftLineSnapshot[] = [];

			// 第一步：全量严格定位与防漂移校验（任一失败或同名歧义则抛错，保证原子性）
			const resolved: Array<{ item: BatchTaskUpdateItem; lineIndex: number }> = [];
			for (const item of items) {
				const located = locateTaskLineStrict(lines, item.task, {
					globalFilter,
					ignoreGlobalFilter: false,
					usedIndices,
				});
				if (located.status === 'not_found') {
					throw new Error(
						`Batch shift aborted (line drift): ${filePath}:${item.task.lineNumber} — ` +
						`"${item.task.description || item.task.content}".`
					);
				}
				if (located.status === 'ambiguous') {
					throw new Error(
						`Batch shift aborted (ambiguous line drift, ${located.matchCount} matches): ` +
						`${filePath}:${item.task.lineNumber} — "${item.task.description || item.task.content}".`
					);
				}
				usedIndices.add(located.lineIndex);
				resolved.push({ item, lineIndex: located.lineIndex });
			}

			// 第二步：逐行序列化替换，保留原缩进、列表标记、未识别字段及 CRLF 行尾
			for (const { item, lineIndex } of resolved) {
				const rawOriginalLine = lines[lineIndex];

				const hasCR = rawOriginalLine.endsWith('\r');
				const taskLine = hasCR ? rawOriginalLine.slice(0, -1) : rawOriginalLine;
				const formatToUse = determineTaskFormat(item.task, taskLine, enabledFormats);

				const listMatch = taskLine.match(RegularExpressions.taskRegex);
				if (!listMatch) {
					throw new Error(`Invalid task format at ${filePath}:${lineIndex + 1}`);
				}
				const indent = listMatch[1];
				const listMarker = listMatch[2];

				const taskContent = serializeTask(app, item.task, item.updates, formatToUse);
				let finalTaskLine = `${indent}${listMarker} ${taskContent}`;

				const preservedTokens = extractUnrecognizedTokens(taskLine)
					.filter(token => !finalTaskLine.includes(token));
				if (preservedTokens.length > 0) {
					finalTaskLine = `${finalTaskLine} ${preservedTokens.join(' ')}`;
				}

				const nextLine = `${finalTaskLine}${hasCR ? '\r' : ''}`;
				snapshots.push({
					lineIndex,
					originalLine: rawOriginalLine,
					shiftedLine: nextLine,
				});
				lines[lineIndex] = nextLine;
			}

			previousLines = snapshots;
			return lines.join('\n');
		});
	});

	return {
		updatedCount: previousLines.length,
		previousLines,
	};
}
