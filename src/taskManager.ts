import { App, TFile } from 'obsidian';

export interface GanttTask {
	filePath: string;
	fileName: string;
	lineNumber: number;
	content: string;
	completed: boolean;
	priority?: string; // highest, high, medium, low, lowest
	createdDate?: Date;
	startDate?: Date;
	scheduledDate?: Date;
	dueDate?: Date;
	cancelledDate?: Date;
	completionDate?: Date;
}

/**
 * 从笔记库中搜索所有符合全局筛选条件的任务
 */
export async function searchTasks(app: App, globalTaskFilter: string, enabledFormats?: string[]): Promise<GanttTask[]> {
	const tasks: GanttTask[] = [];
	const markdownFiles = app.vault.getMarkdownFiles();
	const formats = enabledFormats || ['tasks', 'dataview'];

	for (const file of markdownFiles) {
		const content = await app.vault.read(file);
		const lines = content.split('\n');

		lines.forEach((line, index) => {
			// 检查是否是任务行（以 [ ] 或 [x] 开头）
			const taskMatch = line.match(/^\s*[-*]\s*\[([ xX])\]\s*(.*)/);
			if (!taskMatch) return;

			const [, checkedStatus, taskContent] = taskMatch;
			const isCompleted = checkedStatus.toLowerCase() === 'x';

			// 检查任务头部是否包含全局筛选标记（仅检查头部）
			if (globalTaskFilter) {
				const trimmedContent = taskContent.trim();
				if (!trimmedContent.startsWith(globalTaskFilter)) {
					return;
				}
			}

			// 移除头部筛选标记
			const contentWithoutFilter = globalTaskFilter
				? taskContent.replace(new RegExp(`^\\s*${escapeRegExp(globalTaskFilter)}\\s*`), '')
				: taskContent;

			// 提取日期和其他属性
			const task: GanttTask = {
				filePath: file.path,
				fileName: file.basename,
				lineNumber: index + 1,
				content: contentWithoutFilter,
				completed: isCompleted,
			};

			// 根据启用的格式解析日期
			if (formats.includes('tasks')) {
				parseTasksFormat(contentWithoutFilter, task);
			}
			if (formats.includes('dataview')) {
				parseDataviewFormat(contentWithoutFilter, task);
			}

			tasks.push(task);
		});
	}

	return tasks.sort((a, b) => {
		// 按文件名排序，然后按行号排序
		if (a.fileName !== b.fileName) {
			return a.fileName.localeCompare(b.fileName);
		}
		return a.lineNumber - b.lineNumber;
	});
}

/**
 * 解析 Tasks 插件格式日期和优先级（使用emoji表示）
 * 优先级: 🔺 highest, ⏫ high, 🔼 medium, 🔽 low, ⏬ lowest
 * 日期: ➕ 创建日期, 🛫 开始日期, ⏳ 计划日期, 📅 due日期, ❌ 取消日期, ✅ 完成日期
 */
function parseTasksFormat(content: string, task: GanttTask): void {
	// 解析优先级（使用emoji）
	if (content.includes('🔺')) {
		task.priority = 'highest';
	} else if (content.includes('⏫')) {
		task.priority = 'high';
	} else if (content.includes('🔼')) {
		task.priority = 'medium';
	} else if (content.includes('🔽')) {
		task.priority = 'low';
	} else if (content.includes('⏬')) {
		task.priority = 'lowest';
	}
	// 如果没有优先级emoji，则为 normal（不设置priority字段）

	// 解析日期
	const dateRegex = /(➕|🛫|⏳|📅|❌|✅)\s*(\d{4}-\d{2}-\d{2})/g;
	let match;

	while ((match = dateRegex.exec(content)) !== null) {
		const [, emoji, dateStr] = match;
		const date = new Date(dateStr);

		switch (emoji) {
			case '➕':
				task.createdDate = date;
				break;
			case '🛫':
				task.startDate = date;
				break;
			case '⏳':
				task.scheduledDate = date;
				break;
			case '📅':
				task.dueDate = date;
				break;
			case '❌':
				task.cancelledDate = date;
				break;
			case '✅':
				task.completionDate = date;
				break;
		}
	}
}

/**
 * 解析 Dataview 插件格式日期和优先级（使用字段表示）
 * [priority:: ...], [created:: ...], [start:: ...], [scheduled:: ...], [due:: ...], [cancelled:: ...], [completion:: ...]
 */
function parseDataviewFormat(content: string, task: GanttTask): void {
	const fieldRegex = /\[(priority|created|start|scheduled|due|cancelled|completion)::\s*([^\]]+)\]/g;
	let match;

	while ((match = fieldRegex.exec(content)) !== null) {
		const [, field, value] = match;
		const trimmedValue = value.trim();

		switch (field) {
			case 'priority':
				// 解析优先级
				const priorityValue = trimmedValue.toLowerCase();
				if (['highest', 'high', 'medium', 'low', 'lowest'].includes(priorityValue)) {
					task.priority = priorityValue;
				}
				break;
			case 'created':
			case 'start':
			case 'scheduled':
			case 'due':
			case 'cancelled':
			case 'completion':
				// 尝试解析日期
				const date = new Date(trimmedValue);
				if (isNaN(date.getTime())) continue;

				if (field === 'created') task.createdDate = date;
				else if (field === 'start') task.startDate = date;
				else if (field === 'scheduled') task.scheduledDate = date;
				else if (field === 'due') task.dueDate = date;
				else if (field === 'cancelled') task.cancelledDate = date;
				else if (field === 'completion') task.completionDate = date;
				break;
		}
	}
}

/**
 * 转义正则表达式中的特殊字符
 */
function escapeRegExp(string: string): string {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 任务缓存管理器 - 全局单例，用于提升性能
 * 
 * 核心功能：
 * 1. 初始化时扫描整个笔记库，缓存所有任务
 * 2. 监听文件变化，增量更新受影响文件的任务
 * 3. 提供快速的任务查询接口，避免重复扫描
 */
export class TaskCacheManager {
	private app: App;
	private cache: Map<string, GanttTask[]> = new Map(); // 文件路径 -> 任务列表
	private globalTaskFilter: string = '';
	private enabledFormats: string[] = ['tasks', 'dataview'];
	private isInitialized: boolean = false;
	private isInitializing: boolean = false;

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

		console.time('[TaskCache] Initial scan');
		console.log('[TaskCache] Starting initial scan...');

		this.cache.clear();
		let markdownFiles = this.app.vault.getMarkdownFiles();
		
		// 如果首次扫描找不到文件，可能 vault 尚未初始化，等待后重试
		if (markdownFiles.length === 0 && retryCount < 3) {
			console.log(`[TaskCache] Vault not ready (${markdownFiles.length} files found), retrying in 500ms...`);
			this.isInitializing = false;
			await new Promise(resolve => setTimeout(resolve, 500));
			return this.initialize(globalTaskFilter, enabledFormats, retryCount + 1);
		}
		
		// 批量处理文件，避免阻塞UI
		const batchSize = 50;
		for (let i = 0; i < markdownFiles.length; i += batchSize) {
			const batch = markdownFiles.slice(i, i + batchSize);
			await Promise.all(batch.map(file => this.updateFileCache(file)));
			
			// 让出主线程，避免卡顿
			if (i % 200 === 0) {
				await new Promise(resolve => setTimeout(resolve, 0));
			}
		}

		this.isInitialized = true;
		this.isInitializing = false;
		
		const totalTasks = Array.from(this.cache.values()).reduce((sum, tasks) => sum + tasks.length, 0);
		console.timeEnd('[TaskCache] Initial scan');
		console.log(`[TaskCache] Initialized with ${totalTasks} tasks from ${markdownFiles.length} files`);
	}

	/**
	 * 更新单个文件的缓存
	 */
	async updateFileCache(file: TFile): Promise<void> {
		try {
			const content = await this.app.vault.read(file);
			const tasks = this.parseFileTasks(file, content);
			
			if (tasks.length > 0) {
				this.cache.set(file.path, tasks);
			} else {
				this.cache.delete(file.path);
			}
		} catch (error) {
			console.error(`[TaskCache] Error updating cache for ${file.path}:`, error);
			this.cache.delete(file.path);
		}
	}

	/**
	 * 解析单个文件的所有任务
	 */
	private parseFileTasks(file: TFile, content: string): GanttTask[] {
		const tasks: GanttTask[] = [];
		const lines = content.split('\n');

		lines.forEach((line, index) => {
			const taskMatch = line.match(/^\s*[-*]\s*\[([ xX])\]\s*(.*)/);
			if (!taskMatch) return;

			const [, checkedStatus, taskContent] = taskMatch;
			const isCompleted = checkedStatus.toLowerCase() === 'x';

			// 检查全局筛选标记
			if (this.globalTaskFilter) {
				const trimmedContent = taskContent.trim();
				if (!trimmedContent.startsWith(this.globalTaskFilter)) {
					return;
				}
			}

			// 移除头部筛选标记
			const contentWithoutFilter = this.globalTaskFilter
				? taskContent.replace(new RegExp(`^\\s*${escapeRegExp(this.globalTaskFilter)}\\s*`), '')
				: taskContent;

			const task: GanttTask = {
				filePath: file.path,
				fileName: file.basename,
				lineNumber: index + 1,
				content: contentWithoutFilter,
				completed: isCompleted,
			};

			// 根据启用的格式解析日期
			if (this.enabledFormats.includes('tasks')) {
				parseTasksFormat(contentWithoutFilter, task);
			}
			if (this.enabledFormats.includes('dataview')) {
				parseDataviewFormat(contentWithoutFilter, task);
			}

			tasks.push(task);
		});

		return tasks;
	}

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
}
