import { App } from 'obsidian';
import { GCTask } from './types';
import { Logger } from './utils/logger';

// 任务更新相关函数已迁移至 tasks/taskUpdater.ts，此处重新导出以保持向后兼容
export {
	updateTaskCompletion,
	updateTaskDateField,
	updateTaskProperties,
} from './tasks/taskUpdater';

// 导入新的数据层架构
import { EventBus } from './data-layer/EventBus';
import { TaskRepository } from './data-layer/TaskRepository';
import { MarkdownDataSource } from './data-layer/MarkdownDataSource';
import { DataSourceConfig } from './data-layer/types';

export type TaskStoreUpdateListener = (filePath?: string) => void;

/**
 * TaskStore - 任务数据存储
 *
 * 任务数据的统一访问点，采用门面模式协调数据层组件。
 *
 * 职责：
 * - 初始化数据源，扫描和加载任务
 * - 提供统一的任务查询接口
 * - 管理缓存和失效
 * - 防抖变更通知，避免频繁重渲染
 *
 * 【性能优化】
 * - 直接使用 GCTask 作为内部格式，无格式转换
 * - 内置结果缓存，避免重复查询
 * - 防抖通知机制，合并连续更新
 * - 不在存储层排序，视图层按需排序即可
 */
export class TaskStore {
	private app: App;
	private eventBus: EventBus;
	private repository: TaskRepository;
	private markdownSource: MarkdownDataSource;
	private globalTaskFilter: string = '';
	private enabledFormats: string[] = ['tasks', 'dataview'];
	private isInitialized: boolean = false;
	private isInitializing: boolean = false;
	/** 初始化完成门闩：whenReady() 等待此 Promise（initPromise 实现） */
	private initResolve: (() => void) | null = null;
	private initPromise: Promise<void> | null = null;
	private updateListeners: Set<TaskStoreUpdateListener> = new Set();

	// 结果缓存
	private cachedTasks: GCTask[] | null = null;
	private cacheValid: boolean = false;

	// 防抖
	private updateDebounceTimer: number | null = null;
	/** 防抖窗口内首次事件的时间戳（maxWait 用） */
	private updateDebounceFirstAt: number | null = null;
	private readonly DEBOUNCE_MS = 75;
	/** 防抖最大等待：连续事件下最迟刷新间隔 */
	private readonly MAX_WAIT_MS = 500;

	// 重复检查开关
	private enableDuplicateCheck: boolean = false;

	constructor(app: App) {
		this.app = app;
		this.createInitGate();
		this.eventBus = new EventBus();
		this.repository = new TaskRepository(this.eventBus);

		// 创建 Markdown 数据源配置
		const config: DataSourceConfig = {
			enabled: true,
			syncDirection: 'import-only',
			autoSync: true,
			conflictResolution: 'local-win',
			globalFilter: '',
			enabledFormats: ['tasks', 'dataview']
		};

		this.markdownSource = new MarkdownDataSource(app, this.eventBus, config);

		// 注册数据源
		this.repository.registerDataSource(this.markdownSource);

		// 监听数据层事件
		this.setupEventForwarding();
	}

	/**
	 * 设置事件转发
	 * 传递文件路径以便甘特图等组件进行增量更新
	 */
	private setupEventForwarding(): void {
		this.eventBus.on('task:created', (data) => {
			const taskData = data as { task?: { filePath?: string } } | undefined;
			const filePath = taskData?.task?.filePath;
			Logger.debug('TaskStore', `Event: task:created from ${filePath || 'unknown'}`);
			this.invalidateCache();
			this.notifyListenersDebounced(filePath);
		});
		this.eventBus.on('task:updated', (data) => {
			const taskData = data as { task?: { filePath?: string } } | undefined;
			const filePath = taskData?.task?.filePath;
			Logger.debug('TaskStore', `Event: task:updated from ${filePath || 'unknown'}`);
			this.invalidateCache();
			this.notifyListenersDebounced(filePath);
		});
		this.eventBus.on('task:deleted', (data) => {
			// 从 taskId 解析 filePath (格式: "filePath:lineNumber")
			const deleteData = data as { taskId?: string } | undefined;
			const taskId = deleteData?.taskId;
			const filePath = taskId ? String(taskId).split(':')[0] : undefined;
			Logger.debug('TaskStore', `Event: task:deleted from ${filePath || 'unknown'}`);
			this.invalidateCache();
			this.notifyListenersDebounced(filePath);
		});
	}

	/**
	 * 等待任务缓存初始化完成。视图 onOpen 时 await 此方法，
	 * 保证首屏渲染时任务数据已就绪（实现 types.ts 声明的接口契约）。
	 * 已完成初始化时立即返回；失败时随 initialize 的失败而 reject。
	 */
	async whenReady(): Promise<void> {
		await this.initPromise;
	}

	/** 创建新的初始化门闩（constructor 与每次重新 initialize 时调用） */
	private createInitGate(): void {
		this.initPromise = new Promise<void>((resolve) => {
			this.initResolve = resolve;
		});
	}

	/**
	 * 初始化存储 - 扫描整个笔记库
	 *
	 * isInitializing 标志覆盖整个初始化周期（含重试等待），防止设置保存
	 * 等外部调用在重试窗口内并发触发第二次全量扫描。
	 */
	async initialize(globalTaskFilter: string, enabledFormats?: string[], retryCount: number = 0): Promise<void> {
		if (this.isInitializing) {
			Logger.debug('TaskStore', 'Already initializing, skipping...');
			// 并发调用者等待同一个门闩，而非直接返回——
			// 保证调用方 await 后数据已就绪
			return this.whenReady();
		}
		this.isInitializing = true;
		try {
			await this.initializeInternal(globalTaskFilter, enabledFormats, retryCount);
		} finally {
			this.isInitializing = false;
		}
	}

	/**
	 * 实际初始化流程（含 vault 未就绪重试）。仅由 initialize() 调用，
	 * 重试走内部递归，不经过外层的并发防护。
	 */
	private async initializeInternal(globalTaskFilter: string, enabledFormats?: string[], retryCount: number = 0): Promise<void> {
		Logger.debug('TaskStore', '===== Starting initialization =====');
		Logger.debug('TaskStore', 'Config:', {
			globalTaskFilter,
			enabledFormats,
			retryCount
		});

		const newFilter = (globalTaskFilter || '').trim();
		const newFormats = (enabledFormats || ['tasks', 'dataview']).join(',');
		// 配置未变时保留仓库缓存：数据源会按 mtime 跳过未变更文件，
		// 其任务已在仓库中；清空反而强制全量重扫
		const configChanged =
			this.globalTaskFilter !== newFilter || this.enabledFormats.join(',') !== newFormats;

		this.globalTaskFilter = newFilter;
		this.enabledFormats = enabledFormats || ['tasks', 'dataview'];

		if (configChanged || !this.isInitialized) {
			this.repository.clear();
			this.invalidateCache();
		}

		const config: DataSourceConfig = {
			enabled: true,
			syncDirection: 'import-only',
			autoSync: true,
			conflictResolution: 'local-win',
			globalFilter: this.globalTaskFilter,
			enabledFormats: this.enabledFormats
		};

		const markdownFiles = this.app.vault.getMarkdownFiles();
		Logger.stats('TaskStore', `Vault has ${markdownFiles.length} markdown files`);

		if (markdownFiles.length === 0 && retryCount < 3) {
			Logger.debug('TaskStore', 'Vault not ready, retrying in 500ms...');
			await new Promise(resolve => window.setTimeout(resolve, 500));
			// 重试保持内部递归：外层 initialize 的 isInitializing 标志持续生效，
			// 期间任何并发 initialize() 都会被防护挡下
			return this.initializeInternal(globalTaskFilter, enabledFormats, retryCount + 1);
		}

		const scanStartTime = performance.now();

		await this.markdownSource.initialize(config);

		Logger.debug('TaskStore', 'MarkdownDataSource initialized');

		this.isInitialized = true;
		// 结算门闩：唤醒所有 whenReady 等待者
		this.initResolve?.();
		this.initResolve = null;

		this.notifyListeners();

		const stats = this.repository.getStats();
		const scanElapsed = performance.now() - scanStartTime;
		Logger.stats('TaskStore', `Initial scan completed in ${scanElapsed.toFixed(2)}ms`, {
			totalFiles: markdownFiles.length,
			tasksFound: stats.totalTasks,
			dataSources: stats.dataSources
		});
		Logger.debug('TaskStore', '===== Initialization complete =====');
	}

	/**
	 * 获取所有任务（带缓存）
	 */
	getAllTasks(): GCTask[] {
		if (this.cacheValid && this.cachedTasks) {
			Logger.debug('TaskStore', 'Returning cached tasks', this.cachedTasks.length);
			return this.cachedTasks;
		}

		const startTime = performance.now();
		Logger.debug('TaskStore', 'Cache miss, rebuilding...');

		const allTasks = this.repository.getAllTasks();
		Logger.debug('TaskStore', `Got ${allTasks.length} tasks from repository`);

		if (this.enableDuplicateCheck) {
			this.checkDuplicates(allTasks);
		}

		this.cachedTasks = allTasks;
		this.cacheValid = true;

		const elapsed = performance.now() - startTime;
		Logger.debug('TaskStore', `Cache rebuilt in ${elapsed.toFixed(2)}ms (${allTasks.length} tasks)`);

		return allTasks;
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
			Logger.debug('TaskStore', 'Settings changed, reinitializing...');
			await this.initialize(trimmedFilter, enabledFormats);
		}
	}

	/**
	 * 获取存储状态
	 */
	getStatus(): { initialized: boolean; fileCount: number; taskCount: number } {
		const stats = this.repository.getStats();
		return {
			initialized: this.isInitialized,
			fileCount: stats.totalFiles,
			taskCount: stats.totalTasks
		};
	}

	/**
	 * 清空存储
	 */
	clear(): void {
		if (this.updateDebounceTimer !== null) {
			window.clearTimeout(this.updateDebounceTimer);
			this.updateDebounceTimer = null;
		}
		this.updateDebounceFirstAt = null;
		// 销毁数据源，移除所有事件监听器
		this.markdownSource.destroy();
		this.repository.clear();
		this.isInitialized = false;
		// 重开门闩：下一次 initialize 完成前 whenReady 应继续等待
		this.createInitGate();
		Logger.debug('TaskStore', 'Cache cleared');
	}

	/**
	 * 订阅更新事件
	 */
	onUpdate(listener: TaskStoreUpdateListener): void {
		this.updateListeners.add(listener);
	}

	/**
	 * 取消订阅
	 */
	offUpdate(listener: TaskStoreUpdateListener): void {
		this.updateListeners.delete(listener);
	}

	/**
	 * 立即刷新指定文件的 Repository 缓存（跳过文件事件的 50ms 防抖）。
	 * 写回完成后立即调用此方法，确保 getAllTasks() 返回最新数据。
	 */
	async refreshFile(filePath: string): Promise<void> {
		await (this.markdownSource as unknown as { processFileModification: (p: string) => Promise<void> }).processFileModification(filePath);
		// 立即通知视图（跳过 75ms 防抖），确保返回最新数据
		this.invalidateCache();
		this.notifyListeners();
	}

	/**
	 * 立即通知所有监听器（跳过防抖）。
	 * 用于写回完成后立即刷新视图，避免等待文件修改事件的间接回流。
	 * 第二次调用时（文件修改事件到达）数组引用相同，zustand 跳过。
	 */
	notifyNow(): void {
		// 确保缓存最新
		this.invalidateCache();
		this.notifyListeners();
	}

	/**
	 * 使缓存失效
	 */
	private invalidateCache(): void {
		this.cachedTasks = null;
		this.cacheValid = false;
	}

	/**
	 * 防抖通知监听器
	 * @param filePath - 变更的文件路径（可选），用于增量更新
	 */
	private notifyListenersDebounced(filePath?: string): void {
		const now = Date.now();
		// maxWait：纯 trailing 防抖在连续事件下会无限期推迟刷新，
		// 首次事件后最多 MAX_WAIT_MS 必须冲刷一次
		if (this.updateDebounceFirstAt === null) {
			this.updateDebounceFirstAt = now;
		}
		const remaining = Math.max(
			this.DEBOUNCE_MS,
			this.MAX_WAIT_MS - (now - this.updateDebounceFirstAt)
		);

		if (this.updateDebounceTimer !== null) {
			window.clearTimeout(this.updateDebounceTimer);
		}
		this.updateDebounceTimer = window.setTimeout(() => {
			this.updateDebounceTimer = null;
			this.updateDebounceFirstAt = null;
			this.notifyListeners(filePath);
		}, remaining);
	}

	/**
	 * 通知所有监听器
	 * @param filePath - 变更的文件路径（可选），用于增量更新
	 */
	private notifyListeners(filePath?: string): void {
		this.updateListeners.forEach(listener => {
			try {
				listener(filePath);
			} catch (error) {
				Logger.error('TaskStore', 'Error in update listener:', error);
			}
		});
	}

	/**
	 * 设置重复检查开关
	 */
	public setDuplicateCheckEnabled(enabled: boolean): void {
		this.enableDuplicateCheck = enabled;
		if (enabled) {
			this.invalidateCache();
		}
	}

	/**
	 * 检查重复任务
	 */
	private checkDuplicates(allTasks: GCTask[]): void {
		const taskKeyMap = new Map<string, number>();
		const duplicates: Array<{ key: string; count: number }> = [];

		allTasks.forEach(task => {
			const key = `${task.filePath}:${task.lineNumber}`;
			const count = taskKeyMap.get(key) || 0;
			taskKeyMap.set(key, count + 1);
		});

		taskKeyMap.forEach((count, key) => {
			if (count > 1) {
				duplicates.push({ key, count });
			}
		});

		if (duplicates.length > 0) {
			Logger.warn('TaskStore', 'Duplicate tasks found:', duplicates);
		}
	}
}
