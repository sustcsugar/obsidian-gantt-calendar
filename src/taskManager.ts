import { App, TFile } from 'obsidian';
import { GanttTask } from './types';
import { parseTasksFormat, parseDataviewFormat, escapeRegExp, parseTasksFromListItems } from './tasks/taskParser';
import { areTasksEqual, dateValue } from './tasks/taskUtils';

// 任务解析与搜索相关功能已迁移至 src/tasks/ 目录


export type TaskCacheUpdateListener = () => void;

/**
 * 任务缓存管理器 - 全局单例，用于提升性能
 * 
 * 核心功能：
 * 1. 初始化时扫描整个笔记库，缓存所有任务
 * 2. 监听文件变化，增量更新受影响文件的任务
 * 3. 提供快速的任务查询接口，避免重复扫描
 * 4. 当任务缓存更新时，通知所有订阅的监听器
 */
export class TaskCacheManager {
	private app: App;
	private cache: Map<string, GanttTask[]> = new Map(); // 文件路径 -> 任务列表
	private globalTaskFilter: string = '';
	private enabledFormats: string[] = ['tasks', 'dataview'];
	private isInitialized: boolean = false;
	private isInitializing: boolean = false;
	private updateListeners: Set<TaskCacheUpdateListener> = new Set();

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * 初始化缓存 - 扫描整个笔记库
	 */
	async initialize(globalTaskFilter: string, enabledFormats?: string[], retryCount: number = 0): Promise<void> {
		if (this.isInitializing) {
			console.log('[TaskCache] Already initializing, skipping...');
			return;
		}

		this.isInitializing = true;
		this.globalTaskFilter = (globalTaskFilter || '').trim();
		this.enabledFormats = enabledFormats || ['tasks', 'dataview'];

		this.cache.clear();
		let markdownFiles = this.app.vault.getMarkdownFiles();
		
		// 如果首次扫描找不到文件，可能 vault 尚未初始化，等待后重试
		if (markdownFiles.length === 0 && retryCount < 3) {
			console.log(`[TaskCache] Vault not ready (${markdownFiles.length} files found), retrying in 500ms...`);
			this.isInitializing = false;
			await new Promise(resolve => setTimeout(resolve, 500));
			return this.initialize(globalTaskFilter, enabledFormats, retryCount + 1);
		}

		// 仅在实际扫描时开始计时，避免重试时重复 console.time
		const timerLabel = retryCount === 0 ? '[TaskCache] Initial scan' : `[TaskCache] Initial scan (retry ${retryCount})`;
		console.time(timerLabel);
		console.log('[TaskCache] Starting initial scan...');
		
		// 批量处理文件，避免阻塞UI
		const batchSize = 50;
		let scannedFiles = 0;
		let filesWithTasks = 0;
		let totalTasks = 0;
		for (let i = 0; i < markdownFiles.length; i += batchSize) {
			const batch = markdownFiles.slice(i, i + batchSize);
			const batchResults = await Promise.all(batch.map(async (file) => {
				const info = await this.updateFileCache(file, true, true);
				return info;
			}));
			batchResults.forEach(info => {
				if (!info) return;
				scannedFiles += 1;
				if (info.taskCount > 0) filesWithTasks += 1;
				totalTasks += info.taskCount;
			});
			
			// 让出主线程，避免卡顿
			if (i % 200 === 0) {
				await new Promise(resolve => setTimeout(resolve, 0));
			}
		}

		this.isInitialized = true;
		this.isInitializing = false;

		// 完成批量扫描后统一通知，避免在初始化阶段触发大量视图重渲染
		this.notifyListeners();
		
		const cachedTasks = Array.from(this.cache.values()).reduce((sum, tasks) => sum + tasks.length, 0);
		console.timeEnd(timerLabel);
		console.log('[TaskCache] Init summary', {
			totalFiles: markdownFiles.length,
			scannedFiles,
			filesWithTasks,
			tasksFound: totalTasks,
			cachedTasks,
		});
	}

	/**
	 * 更新单个文件的缓存
	 */
	async updateFileCache(file: TFile, silent?: boolean, suppressNotify?: boolean): Promise<{ taskCount: number } | null> {
		try {
			const fileCache = this.app.metadataCache.getFileCache(file);
			const listItems = fileCache?.listItems;

			// 如果没有列表项，移除缓存并仅在有变动时通知
			if (!listItems || listItems.length === 0) {
				if (this.cache.has(file.path)) {
					this.cache.delete(file.path);
					if (!suppressNotify) {
						this.notifyListeners();
					}
				}
				return { taskCount: 0 };
			}

			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			const tasks = parseTasksFromListItems(file, lines, listItems, this.enabledFormats, this.globalTaskFilter);

			const prev = this.cache.get(file.path) || [];
			if (areTasksEqual(prev, tasks)) {
				// 无变化不通知
				return { taskCount: tasks.length };
			}

			if (tasks.length > 0) {
				this.cache.set(file.path, tasks);
			} else {
				this.cache.delete(file.path);
			}

			if (!silent) {
				console.log('[TaskCache] Updated file', file.path, { taskCount: tasks.length });
			}
			if (!suppressNotify) {
				this.notifyListeners();
			}
			return { taskCount: tasks.length };
		} catch (error) {
			console.error(`[TaskCache] Error updating cache for ${file.path}:`, error);
			this.cache.delete(file.path);
			return { taskCount: 0 };
		}
	}

	/**
	 * 解析单个文件的所有任务
	 */
	// areTasksEqual 已迁移至 tasks/utils.ts
	/**
	 * 移除文件的缓存
	 */
	removeFileCache(filePath: string): void {
		this.cache.delete(filePath);
	}

	/**
	 * 获取所有任务（从缓存）
	 */
	getAllTasks(): GanttTask[] {
		// 即使初始化未完成，也返回当前已解析的缓存，避免界面空白
		const allTasks: GanttTask[] = [];
		for (const tasks of this.cache.values()) {
			allTasks.push(...tasks);
		}

		return allTasks.sort((a, b) => {
			if (a.fileName !== b.fileName) {
				return a.fileName.localeCompare(b.fileName);
			}
			return a.lineNumber - b.lineNumber;
		});
	}

	/**
	 * 更新配置并重新初始化
	 */
	async updateSettings(globalTaskFilter: string, enabledFormats?: string[]): Promise<void> {
		const trimmedFilter = (globalTaskFilter || '').trim();
		const needsReinit = 
			this.globalTaskFilter !== trimmedFilter ||
			JSON.stringify(this.enabledFormats) !== JSON.stringify(enabledFormats);

		if (needsReinit) {
			console.log('[TaskCache] Settings changed, reinitializing cache...');
			await this.initialize(trimmedFilter, enabledFormats);
		}
	}

	/**
	 * 获取缓存状态
	 */
	getStatus(): { initialized: boolean; fileCount: number; taskCount: number } {
		const taskCount = Array.from(this.cache.values()).reduce((sum, tasks) => sum + tasks.length, 0);
		return {
			initialized: this.isInitialized,
			fileCount: this.cache.size,
			taskCount
		};
	}

	/**
	 * 清空缓存
	 */
	clear(): void {
		this.cache.clear();
		this.isInitialized = false;
		console.log('[TaskCache] Cache cleared');
	}

	/**
	 * 订阅缓存更新事件
	 */
	onUpdate(listener: TaskCacheUpdateListener): void {
		this.updateListeners.add(listener);
	}

	/**
	 * 取消订阅缓存更新事件
	 */
	offUpdate(listener: TaskCacheUpdateListener): void {
		this.updateListeners.delete(listener);
	}

	/**
	 * 通知所有监听器，缓存已更新
	 */
	private notifyListeners(): void {
		this.updateListeners.forEach(listener => {
			try {
				listener();
			} catch (error) {
				console.error('[TaskCache] Error in update listener:', error);
			}
		});
	}
}


/**
 * 更新任务的完成状态
 * @param app Obsidian App 实例
 * @param task 要更新的任务
 * @param completed 是否完成
 * @param enabledFormats 启用的任务格式
 */
export async function updateTaskCompletion(
	app: App,
	task: GanttTask,
	completed: boolean,
	enabledFormats: string[]
): Promise<void> {
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

	let taskLine = lines[taskLineIndex];
	
	// 更新复选框状态
	taskLine = taskLine.replace(/\[([ xX])\]/, completed ? '[x]' : '[ ]');

	// 处理完成日期
	const today = formatDate(new Date(), 'YYYY-MM-DD');
    
	// 选择写回格式：优先使用任务本身的格式；否则根据当前行判断；再否则使用设置
	let formatToUse: 'dataview' | 'tasks' | undefined = task.format;
	if (!formatToUse) {
		if (/\[(priority|created|start|scheduled|due|cancelled|completion)::\s*[^\]]+\]/.test(taskLine)) {
			formatToUse = 'dataview';
		} else if (/([➕🛫⏳📅❌✅])\s*\d{4}-\d{2}-\d{2}/.test(taskLine)) {
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

	if (completed) {
		// 添加完成日期
		if (formatToUse === 'dataview') {
			taskLine = taskLine.replace(/\[completion::\s*[^\]]+\]/g, '');
			taskLine = taskLine.trimEnd() + ` [completion:: ${today}]`;
		} else {
			taskLine = taskLine.replace(/✅\s*\d{4}-\d{2}-\d{2}/g, '');
			taskLine = taskLine.trimEnd() + ` ✅ ${today}`;
		}
	} else {
		// 移除完成日期
		taskLine = taskLine.replace(/\[completion::\s*[^\]]+\]\s*/g, '');
		taskLine = taskLine.replace(/✅\s*\d{4}-\d{2}-\d{2}\s*/g, '');
	}

	// 更新内容
	lines[taskLineIndex] = taskLine;
	const newContent = lines.join('\n');

	// 写入文件
	await app.vault.modify(file, newContent);
}

/**
 * 在任务行中修改单个日期字段（辅助函数）
 * @param taskLine 原始任务行
 * @param dateFieldName 日期字段名 (dueDate, startDate 等)
 * @param newDate 新日期值 (null 表示移除该字段)
 * @param format 格式 ('dataview' | 'tasks')
 * @returns 修改后的任务行
 */
function modifyDateInLine(
	taskLine: string,
	dateFieldName: string,
	newDate: Date | null,
	format: 'dataview' | 'tasks'
): string {
	const fieldMap: Record<string, string> = {
		dueDate: 'due',
		startDate: 'start',
		scheduledDate: 'scheduled',
		createdDate: 'created',
		cancelledDate: 'cancelled',
		completionDate: 'completion',
	};
	const emojiMap: Record<string, string> = {
		dueDate: '📅',
		startDate: '🛫',
		scheduledDate: '⏳',
		createdDate: '➕',
		cancelledDate: '❌',
		completionDate: '✅',
	};

	if (format === 'dataview') {
		const fieldKey = fieldMap[dateFieldName];
		if (!fieldKey) return taskLine;

		// 移除旧值
		const re = new RegExp(`\\[${fieldKey}::\\s*[^\\]]+\\]`, 'g');
		taskLine = taskLine.replace(re, '');

		// 添加新值（非 null）
		if (newDate !== null) {
			const dateStr = formatDate(newDate, 'YYYY-MM-DD');
			taskLine = taskLine.trimEnd() + ` [${fieldKey}:: ${dateStr}]`;
		}
	} else {
		// Tasks 格式
		const emoji = emojiMap[dateFieldName];
		if (!emoji) return taskLine;

		// 移除旧值
		const re = new RegExp(`${emoji}\\s*\\d{4}-\\d{2}-\\d{2}`, 'g');
		taskLine = taskLine.replace(re, '');

		// 添加新值（非 null）
		if (newDate !== null) {
			const dateStr = formatDate(newDate, 'YYYY-MM-DD');
			taskLine = taskLine.trimEnd() + ` ${emoji} ${dateStr}`;
		}
	}

	return taskLine;
}

/**
 * 更新任务的日期字段（由日期筛选字段指定）
 * @param app Obsidian App
 * @param task 任务对象
 * @param dateFieldName 日期字段名（dueDate, startDate, scheduledDate, createdDate, cancelledDate, completionDate）
 * @param newDate 新的日期值
 * @param enabledFormats 启用的任务格式
 */
export async function updateTaskDateField(
	app: App,
	task: GanttTask,
	dateFieldName: string,
	newDate: Date,
	enabledFormats: string[]
): Promise<void> {
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

	let taskLine = lines[taskLineIndex];

	// 选择写回格式：优先使用任务本身的格式；否则根据当前行判断；再否则使用设置
	let formatToUse: 'dataview' | 'tasks' | undefined = task.format;
	if (!formatToUse) {
		if (/\[(priority|created|start|scheduled|due|cancelled|completion)::\s*[^\]]+\]/.test(taskLine)) {
			formatToUse = 'dataview';
		} else if (/(➕🛫⏳📅❌✅)\s*\d{4}-\d{2}-\d{2}/.test(taskLine)) {
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

	// 使用辅助函数修改日期字段
	taskLine = modifyDateInLine(taskLine, dateFieldName, newDate, formatToUse);

	// 更新内容
	lines[taskLineIndex] = taskLine;
	const newContent = lines.join('\n');

	// 写入文件
	await app.vault.modify(file, newContent);
}

/**
 * 批量更新任务属性（优先级、完成状态、各日期字段）
 * 未提供的字段不做更改；传入 null 的日期字段表示清除该字段。
 */
export async function updateTaskProperties(
	app: App,
	task: GanttTask,
	updates: {
		completed?: boolean;
		priority?: 'highest' | 'high' | 'medium' | 'low' | 'lowest' | 'normal' | undefined;
		createdDate?: Date | null;
		startDate?: Date | null;
		scheduledDate?: Date | null;
		dueDate?: Date | null;
		cancelledDate?: Date | null;
		completionDate?: Date | null;
		content?: string;
		globalFilter?: string;
	},
	enabledFormats: string[]
): Promise<void> {
	const file = app.vault.getAbstractFileByPath(task.filePath);
	if (!(file instanceof TFile)) {
		throw new Error(`File not found: ${task.filePath}`);
	}

	const content = await app.vault.read(file);
	const lines = content.split('\n');

	const taskLineIndex = task.lineNumber - 1;
	if (taskLineIndex < 0 || taskLineIndex >= lines.length) {
		throw new Error(`Invalid line number: ${task.lineNumber}`);
	}

	let taskLine = lines[taskLineIndex];

	// 支持修改任务描述（content 字段）
	// 注意：修改描述时，所有元数据（优先级、日期等）会在后续循环中重新添加
	// 因此这里只需更新描述文本，移除所有元数据标记即可
	const contentModified = typeof updates.content === 'string' && updates.content.trim() !== '' && updates.content !== task.content;
	if (contentModified) {
		// 匹配任务行前缀（- [ ]/x + 可能的全局筛选）
		const m = taskLine.match(/^(\s*[-*]\s*\[[ xX]\]\s*)(.*)$/);
		if (m) {
			const prefix = m[1];
			let rest = m[2];
			// 检查并保留原有全局过滤标志
			let gfPrefix = '';
			const globalFilter = updates.globalFilter || '';
			if (globalFilter) {
				const gf = (globalFilter + '').trim();
				if (gf && rest.trim().startsWith(gf)) {
					gfPrefix = gf + ' ';
					rest = rest.trim().slice(gf.length).trim();
				}
			}
			// 移除所有元数据标记（优先级、日期emoji+日期值、dataview字段、wiki链接）
			// 这些元数据会在后续的日期/优先级处理循环中重新添加
			rest = rest.replace(/\s*(🔺|⏫|🔼|🔽|⏬)\s*/g, ' ');
			rest = rest.replace(/\s*(➕|🛫|⏳|📅|❌|✅)\s*\d{4}-\d{2}-\d{2}\s*/g, ' ');
			rest = rest.replace(/\s*\[(priority|created|start|scheduled|due|cancelled|completion)::[^\]]+\]\s*/g, ' ');
			rest = rest.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, ' ');
			rest = rest.replace(/\s{2,}/g, ' ').trim();

			// 重新拼接任务行，使用新的描述内容
			// 元数据（优先级、日期等）会在后续处理循环中重新添加
			taskLine = prefix + gfPrefix + (updates.content || '').trim();
		}
	}

	// 当修改了任务描述时，需要保留原始任务的所有日期字段
	// 将原始任务的日期值填充到 updates 中（如果该字段未被明确更新）
	if (contentModified) {
		const dateFields = ['createdDate', 'startDate', 'scheduledDate', 'dueDate', 'cancelledDate', 'completionDate'];
		for (const field of dateFields) {
			if ((updates as any)[field] === undefined && (task as any)[field] !== undefined) {
				(updates as any)[field] = (task as any)[field];
			}
		}
		// 同样保留原始优先级（如果未被明确更新）
		if (updates.priority === undefined && task.priority !== undefined) {
			// task.priority 是字符串类型，需要转换为对应的枚举值
			const priorityMap: Record<string, 'highest' | 'high' | 'medium' | 'low' | 'lowest' | 'normal'> = {
				'🔺': 'highest',
				'⏫': 'high',
				'🔼': 'medium',
				'🔽': 'low',
				'⏬': 'lowest',
				'none': 'normal',
				'normal': 'normal',
			};
			updates.priority = priorityMap[task.priority] || 'normal';
		}
	}

	// 更新复选框状态（如果提供）
	if (typeof updates.completed === 'boolean') {
		taskLine = taskLine.replace(/\[([ xX])\]/, updates.completed ? '[x]' : '[ ]');
	}

	// 决定写回格式
	let formatToUse: 'dataview' | 'tasks' | undefined = task.format;
	if (!formatToUse) {
		if (/\[(priority|created|start|scheduled|due|cancelled|completion)::\s*[^\]]+\]/.test(taskLine)) {
			formatToUse = 'dataview';
		} else if (/(➕|🛫|⏳|📅|❌|✅)\s*\d{4}-\d{2}-\d{2}/.test(taskLine)) {
			formatToUse = 'tasks';
		} else if (enabledFormats.includes('dataview') && enabledFormats.includes('tasks')) {
			formatToUse = taskLine.includes('[') ? 'dataview' : 'tasks';
		} else if (enabledFormats.includes('dataview')) {
			formatToUse = 'dataview';
		} else {
			formatToUse = 'tasks';
		}
	}

	// 更新优先级（如果提供）
	if (updates.priority !== undefined) {
		if (formatToUse === 'dataview') {
			// 移除旧的 priority 字段
			taskLine = taskLine.replace(/\[priority::\s*[^\]]+\]\s*/g, '');
			// 添加新的（normal 表示不写入字段）
			if (updates.priority && updates.priority !== 'normal') {
				taskLine = taskLine.trimEnd() + ` [priority:: ${updates.priority}]`;
			}
		} else {
			// Tasks 格式：移除旧的 emoji，再追加
			taskLine = taskLine.replace(/\s*(🔺|⏫|🔼|🔽|⏬)\s*/g, ' ');
			const emojiMap: Record<string, string> = {
				highest: '🔺',
				high: '⏫',
				medium: '🔼',
				low: '🔽',
				lowest: '⏬',
			};
			if (updates.priority && updates.priority !== 'normal') {
				const emoji = emojiMap[updates.priority];
				if (emoji) {
					taskLine = taskLine.trimEnd() + ` ${emoji}`;
				}
			}
		}
	}

	// 日期字段映射
	const dateFields = ['dueDate', 'startDate', 'scheduledDate', 'createdDate', 'cancelledDate', 'completionDate'];

	// 只处理 updates 中明确提供的日期字段
	for (const key of dateFields) {
		const updateValue = (updates as any)[key];
		// 跳过未在 updates 中提供的字段
		if (updateValue === undefined) {
			continue;
		}

		// 使用辅助函数修改日期字段
		taskLine = modifyDateInLine(taskLine, key, updateValue, formatToUse);
	}

	// 写回
	lines[taskLineIndex] = taskLine;
	const newContent = lines.join('\n');
	await app.vault.modify(file, newContent);
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date: Date, format: string): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	
	return format.replace('YYYY', String(year))
		.replace('MM', month)
		.replace('DD', day);
}
