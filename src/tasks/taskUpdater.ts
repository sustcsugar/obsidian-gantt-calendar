import { App, TFile } from 'obsidian';
import { GCTask } from '../types';
import { serializeTask, TaskUpdates } from './taskSerializer';
import { parseSingleTaskLine } from './taskParser/main';
import { Logger } from '../utils/logger';

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

// ==================== 行内容校验 ====================

function getGlobalTaskFilter(app: App): string {
	const appWithPlugins = app as App & {
		plugins?: { getPlugin?: (id: string) => { settings?: { globalTaskFilter?: string } } | null };
	};
	return appWithPlugins.plugins?.getPlugin?.('gantt-calendar')?.settings?.globalTaskFilter || '';
}

function lineMatchesTask(line: string, task: GCTask, globalFilter: string): boolean {
	const parsed = parseSingleTaskLine(line, task.filePath, task.fileName, 1, ['tasks', 'dataview'], globalFilter);
	if (!parsed) return false;
	return parsed.content === task.content || parsed.description === task.description;
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
 * 读取任务行并返回文件内容和行索引
 */
async function readTaskLine(app: App, task: GCTask): Promise<{ file: TFile; content: string; lines: string[]; taskLineIndex: number }> {
	const file = app.vault.getAbstractFileByPath(task.filePath);
	if (!(file instanceof TFile)) {
		throw new Error(`File not found: ${task.filePath}`);
	}

	const content = await app.vault.read(file);
	const lines = content.split('\n');

	// 获取任务行的索引（lineNumber 是 1-based）
	const taskLineIndex = task.lineNumber - 1;
	if (taskLineIndex < 0 || taskLineIndex >= lines.length) {
		throw new Error(`Invalid line number: ${task.lineNumber}`);
	}

	return { file, content, lines, taskLineIndex };
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

		const { file, lines, taskLineIndex: rawIndex } = await readTaskLine(app, task);

		// 行号漂移校验（P0）：文件被并发编辑后 lineNumber 可能指向别的行。
		// 校验失败时在文件内重定位；找不到则报错刷新缓存，绝不盲写。
		const globalFilter = getGlobalTaskFilter(app);
		let taskLineIndex = rawIndex;
		if (!lineMatchesTask(lines[taskLineIndex], task, globalFilter)) {
			Logger.warn('taskUpdater', `Line drift detected at ${task.filePath}:${task.lineNumber}, relocating...`);
			const found = lines.findIndex(line => lineMatchesTask(line, task, globalFilter));
			if (found === -1) {
				throw new Error(
					`Task not found in file (line drift): ${task.filePath}:${task.lineNumber} — ` +
					`"${task.description || task.content}". File changed externally; task cache will refresh.`
				);
			}
			taskLineIndex = found;
		}

		const taskLine = lines[taskLineIndex];

		Logger.debug('taskUpdater', 'Original task line:', taskLine);

		// 确定任务格式
		const formatToUse = determineTaskFormat(task, taskLine, enabledFormats);

		// 提取列表标记和缩进。与 step1 解析正则保持一致：
		// 支持 -/*/+/数字列表、引用块前缀（>）、自定义单字符复选框状态
		const listMatch = taskLine.match(/^([\s\t>]*)([-*+]|\d+[.)])\s+\[.\]\s*/);
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

		// 写回文件
		lines[taskLineIndex] = finalTaskLine;
		const newContent = lines.join('\n');

		const writeStart = performance.now();
		await app.vault.modify(file, newContent);
		const writeElapsed = performance.now() - writeStart;

		const totalElapsed = performance.now() - startTime;
		Logger.debug('taskUpdater', `Task updated in ${totalElapsed.toFixed(2)}ms (write: ${writeElapsed.toFixed(2)}ms)`);
	});
}
