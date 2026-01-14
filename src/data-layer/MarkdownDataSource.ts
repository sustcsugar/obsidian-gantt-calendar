/**
 * MarkdownDataSource - Markdown 数据源
 *
 * 适配现有的 Markdown 文件解析功能，将其封装为数据源接口。
 *
 * 职责：
 * - 扫描 Markdown 文件并解析任务
 * - 监听文件变化（modify、delete、rename）
 * - 检测任务变化并发布事件
 * - 复用现有的 parseTasksFromListItems 函数
 * - 直接使用 GCTask 格式，无需转换
 *
 * 【内存优化】
 * - 文件缓存只存储任务 ID 引用，不存储完整 GCTask 对象
 * - 完整任务由 TaskRepository 统一存储
 */

import { App, TFile, TAbstractFile, EventRef } from 'obsidian';
import { parseTasksFromListItems } from '../tasks/taskParser/main';
import { areTasksEqual } from '../tasks/taskUtils';
import { EventBus } from './EventBus';
import type { GCTask } from '../types';
import {
	DataSourceChanges,
	DataSourceConfig,
	TaskChanges
} from './types';
import { IDataSource, ChangeEventHandler } from './IDataSource';
import { Logger } from '../utils/logger';

/**
 * 生成任务ID
 */
function generateTaskId(task: GCTask): string {
	return `${task.filePath}:${task.lineNumber}`;
}

/**
 * Markdown 文件缓存
 *
 * 【内存优化】只存储任务 ID 引用，不存储完整对象
 * 完整的 GCTask 由 TaskRepository 统一管理
 */
interface MarkdownFileCache {
	taskIds: string[];      // 任务ID列表
	lastModified: number;   // 文件修改时间
	taskCount: number;      // 任务数量（用于快速判断）
}

/**
 * Markdown 数据源
 */
export class MarkdownDataSource implements IDataSource {
	readonly sourceId = 'markdown';
	readonly sourceName = 'Markdown Files';
	readonly isReadOnly = false;

	private app: App;
	private config: DataSourceConfig;
	private cache: Map<string, MarkdownFileCache> = new Map();
	private eventBus: EventBus;
	private changeHandler?: ChangeEventHandler;

	// 性能优化：防抖处理文件修改事件
	private debounceTimers: Map<string, number> = new Map();
	private readonly DEBOUNCE_MS = 50;
	// 防止并发处理同一文件
	private processingFiles: Set<string> = new Set();
	// 待处理文件队列：当文件正在处理时，新的修改请求会被加入此队列
	// 处理完成后会重新检查这些文件，避免遗漏快速连续的修改
	private pendingFileChecks: Set<string> = new Set();
	// 防止重复注册事件监听器
	private fileWatchersRegistered: boolean = false;
	// 保存事件监听器引用，用于清理
	private vaultEventRefs: EventRef[] = [];

	constructor(app: App, eventBus: EventBus, config: DataSourceConfig) {
		this.app = app;
		this.eventBus = eventBus;
		this.config = config;
	}

	/**
	 * 初始化数据源
	 */
	async initialize(config: DataSourceConfig): Promise<void> {
		Logger.debug('MarkdownDataSource', 'initialize() started');
		const scanStartTime = performance.now();

		// 【修复】清除旧缓存，防止使用过期的筛选符配置
		this.cache.clear();

		this.config = config;

		// 【性能优化】扫描阶段返回所有任务，避免二次解析
		const allTasks = await this.scanAllFiles();

		// 【修复】只注册一次事件监听器，防止重复注册
		if (!this.fileWatchersRegistered) {
			this.setupFileWatchers();
			this.fileWatchersRegistered = true;
		}

		// 通知数据源已初始化，发送所有任务（使用扫描阶段收集的任务）
		await this.notifyInitialTasks(allTasks);

		const scanElapsed = performance.now() - scanStartTime;
		Logger.stats('MarkdownDataSource', `initialize() completed in ${scanElapsed.toFixed(2)}ms`);
	}

	/**
	 * 通知初始任务（用于初始化时）
	 * 【性能优化】直接使用扫描阶段收集的任务，避免重复解析
	 */
	private async notifyInitialTasks(allTasks: GCTask[]): Promise<void> {
		if (!this.changeHandler) {
			return;
		}

		this.changeHandler({
			sourceId: this.sourceId,
			created: allTasks,
			updated: [],
			deleted: []
		});
	}

	/**
	 * 获取所有任务
	 */
	async getTasks(): Promise<GCTask[]> {
		const tasks: GCTask[] = [];

		// 需要重新解析文件获取完整任务
		for (const [filePath] of this.cache) {
			const fileTasks = await this.parseFile(filePath);
			if (fileTasks) {
				tasks.push(...fileTasks);
			}
		}

		return tasks;
	}

	/**
	 * 监听数据变化
	 */
	onChange(handler: ChangeEventHandler): void {
		this.changeHandler = handler;
	}

	/**
	 * 创建任务（暂不实现）
	 */
	async createTask(task: GCTask): Promise<string> {
		throw new Error('Creating tasks directly in Markdown files is not yet supported');
	}

	/**
	 * 更新任务（暂不实现）
	 */
	async updateTask(taskId: string, changes: TaskChanges): Promise<void> {
		throw new Error('Updating tasks directly in Markdown files is not yet supported');
	}

	/**
	 * 删除任务（暂不实现）
	 */
	async deleteTask(taskId: string): Promise<void> {
		throw new Error('Deleting tasks directly in Markdown files is not yet supported');
	}

	/**
	 * 获取同步状态
	 */
	async getSyncStatus(): Promise<{
		lastSyncAt?: Date;
		syncDirection: 'bidirectional' | 'import-only' | 'export-only';
		conflictResolution: 'local-win' | 'remote-win' | 'manual';
	}> {
		return {
			syncDirection: 'import-only',
			conflictResolution: 'local-win'
		};
	}

	/**
	 * 处理文件修改
	 * 【修复Bug 2】将文件处理逻辑提取为独立方法，支持待处理队列机制
	 *
	 * 工作流程：
	 * 1. 标记文件为处理中
	 * 2. 获取旧任务ID列表
	 * 3. 解析新任务
	 * 4. 检测变化并通知
	 * 5. 清除处理中标记
	 * 6. 如果有待处理标记，递归重新检查（避免遗漏快速连续的修改）
	 */
	private async processFileModification(filePath: string): Promise<void> {
		this.processingFiles.add(filePath);
		Logger.debug('MarkdownDataSource', `Processing file modification: ${filePath}`);

		try {
			const oldCache = this.cache.get(filePath);
			const oldTaskIds = oldCache?.taskIds || [];

			const parseResult = await this.parseFileForScan(filePath);
			if (parseResult) {
				this.cache.set(filePath, parseResult.cache);
			} else {
				this.cache.delete(filePath);
			}

			if (this.changeHandler && oldCache) {
				const changes = this.detectChangesByIds(oldTaskIds, parseResult?.tasks || []);
				if (changes) {
					Logger.debug('MarkdownDataSource', `Changes detected for ${filePath}:`, {
						created: changes.created.length,
						updated: changes.updated.length,
						deleted: changes.deleted.length
					});
					this.changeHandler(changes);
				} else {
					Logger.debug('MarkdownDataSource', `No actual changes detected for ${filePath}`);
				}
			}
		} finally {
			this.processingFiles.delete(filePath);

			// 处理完成后，检查是否有待处理的重新检查
			// 【修复Bug 2】这是关键：快速连续的修改不会丢失
			if (this.pendingFileChecks.has(filePath)) {
				this.pendingFileChecks.delete(filePath);
				Logger.debug('MarkdownDataSource', `Rechecking pending file: ${filePath}`);
				// 重新处理该文件
				await this.processFileModification(filePath);
			}
		}
	}

	/**
	 * 销毁数据源
	 */
	destroy(): void {
		// 移除所有 vault 事件监听器
		this.vaultEventRefs.forEach((eventRef) => {
			this.app.vault.offref(eventRef);
		});
		this.vaultEventRefs = [];
		this.fileWatchersRegistered = false;

		this.debounceTimers.forEach((timer) => clearTimeout(timer));
		this.debounceTimers.clear();
		this.processingFiles.clear();
		this.pendingFileChecks.clear();  // 清理待处理队列
		this.cache.clear();
	}

	/**
	 * 扫描所有 Markdown 文件
	 * 【性能优化】返回所有任务，避免 notifyInitialTasks 时重复解析
	 */
	private async scanAllFiles(): Promise<GCTask[]> {
		const markdownFiles = this.app.vault.getMarkdownFiles();
		Logger.stats('MarkdownDataSource', `Scanning ${markdownFiles.length} markdown files`);

		const BATCH_SIZE = 50;
		const batches: TFile[][] = [];

		for (let i = 0; i < markdownFiles.length; i += BATCH_SIZE) {
			batches.push(markdownFiles.slice(i, i + BATCH_SIZE));
		}

		Logger.debug('MarkdownDataSource', `Processing in ${batches.length} batches of ${BATCH_SIZE} files`);

		// 【关键优化】在扫描阶段收集所有任务，避免二次解析
		const allTasks: GCTask[] = [];

		for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
			const batch = batches[batchIndex];

			// 并行处理批次内的文件
			const batchResults = await Promise.all(
				batch.map(file => this.parseFileForScan(file.path))
			);

			// 将结果合并到 allTasks
			for (const result of batchResults) {
				if (result) {
					allTasks.push(...result.tasks);
					this.cache.set(result.filePath, result.cache);
				}
			}

			if (batchIndex < batches.length - 1) {
				await new Promise(resolve => setTimeout(resolve, 0));
			}
		}

		Logger.debug('MarkdownDataSource', 'All files scanned');
		return allTasks;
	}

	/**
	 * 解析单个文件（用于扫描阶段，返回任务和缓存信息）
	 */
	private async parseFileForScan(filePath: string): Promise<{
		filePath: string;
		tasks: GCTask[];
		cache: MarkdownFileCache;
	} | null> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			return null;
		}

		const fileCache = this.app.metadataCache.getFileCache(file);
		const listItems = fileCache?.listItems;

		if (!listItems || listItems.length === 0) {
			return null;
		}

		const content = await this.app.vault.read(file);
		const lines = content.split('\n');

		const tasks = parseTasksFromListItems(
			file,
			lines,
			listItems,
			this.config.enabledFormats as any || ['tasks', 'dataview'],
			this.config.globalFilter
		);

		return {
			filePath,
			tasks,
			cache: {
				taskIds: tasks.map(t => generateTaskId(t)),
				lastModified: file.stat.mtime,
				taskCount: tasks.length
			}
		};
	}

	/**
	 * 设置文件监听
	 */
	private setupFileWatchers(): void {
		// 监听文件修改（使用防抖处理）
		// 【修复Bug 2】改进并发处理：使用待处理队列而非直接跳过
		const modifyRef = this.app.vault.on('modify', (file) => {
			if (file instanceof TFile && file.extension === 'md') {
				Logger.debug('MarkdownDataSource', `File modify event received: ${file.path}`);

				const existingTimer = this.debounceTimers.get(file.path);
				if (existingTimer !== undefined) {
					clearTimeout(existingTimer);
					Logger.debug('MarkdownDataSource', `Debouncing file modification: ${file.path}`);
				}

				const timer = window.setTimeout(async () => {
					// 【修复Bug 2】如果文件正在处理，标记为待处理而非跳过
					if (this.processingFiles.has(file.path)) {
						this.pendingFileChecks.add(file.path);
						Logger.debug('MarkdownDataSource', `File pending for recheck: ${file.path}`);
						return;
					}

					await this.processFileModification(file.path);
					this.debounceTimers.delete(file.path);
				}, this.DEBOUNCE_MS);

				this.debounceTimers.set(file.path, timer);
			}
		});
		this.vaultEventRefs.push(modifyRef);

		// 【修复Bug 1】监听文件创建
		// QuickAdd 等插件创建新文件时需要此监听器才能检测到新任务
		const createRef = this.app.vault.on('create', async (file) => {
			if (file instanceof TFile && file.extension === 'md') {
				Logger.debug('MarkdownDataSource', `File create event: ${file.path}`);

				const existingTimer = this.debounceTimers.get(file.path);
				if (existingTimer !== undefined) {
					clearTimeout(existingTimer);
				}

				const timer = window.setTimeout(async () => {
					const parseResult = await this.parseFileForScan(file.path);
					if (parseResult && this.changeHandler) {
						// 新文件的所有任务都是新增的
						Logger.debug('MarkdownDataSource', `New file created with ${parseResult.tasks.length} tasks: ${file.path}`);
						this.changeHandler({
							sourceId: this.sourceId,
							created: parseResult.tasks,
							updated: [],
							deleted: []
						});
						this.cache.set(file.path, parseResult.cache);
					}
					this.debounceTimers.delete(file.path);
				}, this.DEBOUNCE_MS);

				this.debounceTimers.set(file.path, timer);
			}
		});
		this.vaultEventRefs.push(createRef);

		// 监听文件删除
		const deleteRef = this.app.vault.on('delete', (file) => {
			if (file instanceof TFile && file.extension === 'md') {
				const oldCache = this.cache.get(file.path);
				this.cache.delete(file.path);

				if (this.changeHandler && oldCache) {
					// 发送文件路径，让仓库清理该文件的所有任务
					this.changeHandler({
						sourceId: this.sourceId,
						created: [],
						updated: [],
						deleted: [],
						deletedFilePaths: [file.path]
					});
				}
			}
		});
		this.vaultEventRefs.push(deleteRef);

		// 监听文件重命名
		const renameRef = this.app.vault.on('rename', (file, oldPath) => {
			if (file instanceof TFile && file.extension === 'md') {
				const oldCache = this.cache.get(oldPath);
				if (oldCache) {
					this.cache.delete(oldPath);
					this.cache.set(file.path, {
						...oldCache,
						lastModified: file.stat.mtime
					});

					// 发布变化事件（任务ID已变化，需要通知）
					if (this.changeHandler) {
						this.changeHandler({
							sourceId: this.sourceId,
							created: [],
							updated: [],
							deleted: []
						});
					}
				}
			}
		});
		this.vaultEventRefs.push(renameRef);

		// 【开发模式】监听 metadataCache 变化
		// 用于调试和验证问题，避免生产环境性能开销
		// 通过设置插件实例的 __dev_mode__ 属性为 true 来启用
		const isDev = (this.app as any).plugins?.plugins?.['obsidian-gantt-calendar']?.['__dev_mode__'] === true;

		if (isDev) {
			Logger.debug('MarkdownDataSource', 'Dev mode: Adding metadataCache listener');

			const metadataRef = this.app.metadataCache.on('changed', (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					Logger.debug('MarkdownDataSource', `[DEV] Metadata changed: ${file.path}`);

					// 使用相同的防抖机制
					const existingTimer = this.debounceTimers.get(file.path);
					if (existingTimer !== undefined) {
						clearTimeout(existingTimer);
					}

					const timer = window.setTimeout(async () => {
						// 如果文件正在处理，标记为待处理
						if (this.processingFiles.has(file.path)) {
							this.pendingFileChecks.add(file.path);
							return;
						}
						await this.processFileModification(file.path);
						this.debounceTimers.delete(file.path);
					}, this.DEBOUNCE_MS);

					this.debounceTimers.set(file.path, timer);
				}
			});
			this.vaultEventRefs.push(metadataRef);
		}
	}

	/**
	 * 解析单个文件获取任务
	 */
	private async parseFile(filePath: string): Promise<GCTask[] | null> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			return null;
		}

		const fileCache = this.app.metadataCache.getFileCache(file);
		const listItems = fileCache?.listItems;

		if (!listItems || listItems.length === 0) {
			return null;
		}

		const content = await this.app.vault.read(file);
		const lines = content.split('\n');

		const tasks = parseTasksFromListItems(
			file,
			lines,
			listItems,
			this.config.enabledFormats as any || ['tasks', 'dataview'],
			this.config.globalFilter
		);

		return tasks;
	}

	/**
	 * 更新单个文件的缓存
	 */
	private async updateFileCache(filePath: string): Promise<void> {
		const tasks = await this.parseFile(filePath);

		if (tasks && tasks.length > 0) {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				this.cache.set(filePath, {
					taskIds: tasks.map(t => generateTaskId(t)),
					lastModified: file.stat.mtime,
					taskCount: tasks.length
				});
			}
		} else {
			this.cache.delete(filePath);
		}
	}

	/**
	 * 通过任务ID检测变化
	 */
	private detectChangesByIds(oldTaskIds: string[], newTasks: GCTask[]): DataSourceChanges | null {
		const oldIdSet = new Set(oldTaskIds);
		const newIdMap = new Map(newTasks.map(t => [generateTaskId(t), t]));

		const changes: DataSourceChanges = {
			sourceId: this.sourceId,
			created: [],
			updated: [],
			deleted: []
		};

		// 检测新增
		for (const [id, task] of newIdMap) {
			if (!oldIdSet.has(id)) {
				changes.created.push(task);
			}
		}

		// 检测删除
		for (const id of oldTaskIds) {
			if (!newIdMap.has(id)) {
				// 删除的任务没有完整对象，只能返回ID
				// 这里我们需要返回一个占位任务对象
				const [filePath, lineNumber] = id.split(':');
				changes.deleted.push({
					filePath,
					lineNumber: parseInt(lineNumber),
					fileName: filePath.split('/').pop() || '',
					content: '',
					description: '',
					completed: false,
					priority: 'normal'
				} as GCTask);
			}
		}

		// 检测更新：ID 同时存在于新旧列表中的任务视为已更新
		// 这样可以确保当用户修改任务属性（日期、优先级等）后视图能正确刷新
		for (const [id, newTask] of newIdMap) {
			if (oldIdSet.has(id)) {
				// 任务 ID 存在，将其加入 updated 列表
				// 传递完整的新任务对象，让 TaskRepository 可以完全替换缓存中的旧任务
				changes.updated.push({
					id,
					changes: {},
					task: newTask
				});
			}
		}

		if (changes.created.length === 0 &&
			changes.updated.length === 0 &&
			changes.deleted.length === 0) {
			return null;
		}

		return changes;
	}

	/**
	 * 检测文件变化
	 */
	private detectChanges(
		oldTasks: GCTask[],
		newTasks: GCTask[]
	): DataSourceChanges | null {
		const oldMap = new Map(oldTasks.map(t => [generateTaskId(t), t]));
		const newMap = new Map(newTasks.map(t => [generateTaskId(t), t]));

		const changes: DataSourceChanges = {
			sourceId: this.sourceId,
			created: [],
			updated: [],
			deleted: []
		};

		// 检测新增和修改
		for (const [id, task] of newMap) {
			if (!oldMap.has(id)) {
				changes.created.push(task);
			} else if (!areTasksEqual([oldMap.get(id)!], [task])) {
				changes.updated.push({
					id,
					changes: this.diffTasks(oldMap.get(id)!, task)
				});
			}
		}

		// 检测删除
		for (const [id, task] of oldMap) {
			if (!newMap.has(id)) {
				changes.deleted.push(task);
			}
		}

		if (changes.created.length === 0 &&
			changes.updated.length === 0 &&
			changes.deleted.length === 0) {
			return null;
		}

		return changes;
	}

	/**
	 * 计算任务差异
	 */
	private diffTasks(oldTask: GCTask, newTask: GCTask): TaskChanges {
		const changes: TaskChanges = {};

		if (oldTask.description !== newTask.description) {
			changes.description = newTask.description;
		}

		if (oldTask.completed !== newTask.completed) {
			changes.completed = newTask.completed;
		}

		if (oldTask.status !== newTask.status) {
			changes.status = newTask.status;
		}

		if (oldTask.priority !== newTask.priority) {
			changes.priority = newTask.priority;
		}

		if (oldTask.dueDate !== newTask.dueDate) {
			changes.dueDate = newTask.dueDate;
		}

		return changes;
	}
}
