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
	private updateListeners: Set<TaskStoreUpdateListener> = new Set();

	// 结果缓存
	private cachedTasks: GCTask[] | null = null;
	private cacheValid: boolean = false;

	// 防抖
	private updateDebounceTimer: number | null = null;
	private readonly DEBOUNCE_MS = 75;

	// 重复检查开关
	private enableDuplicateCheck: boolean = false;

	constructor(app: App) {
		this.app = app;
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
			const filePath = (data as any)?.task?.filePath;
			Logger.debug('TaskStore', `Event: task:created from ${filePath || 'unknown'}`);
			this.invalidateCache();
			this.notifyListenersDebounced(filePath);
		});
		this.eventBus.on('task:updated', (data) => {
			const filePath = (data as any)?.task?.filePath;
			Logger.debug('TaskStore', `Event: task:updated from ${filePath || 'unknown'}`);
			this.invalidateCache();
			this.notifyListenersDebounced(filePath);
		});
		this.eventBus.on('task:deleted', (data) => {
			// 从 taskId 解析 filePath (格式: "filePath:lineNumber")
			const taskId = (data as any)?.taskId;
			const filePath = taskId ? taskId.split(':')[0] : undefined;
			Logger.debug('TaskStore', `Event: task:deleted from ${filePath || 'unknown'}`);
			this.invalidateCache();
			this.notifyListenersDebounced(filePath);
		});
	}

	/**
	 * 初始化存储 - 扫描整个笔记库
	 */
	async initialize(globalTaskFilter: string, enabledFormats?: string[], retryCount: number = 0): Promise<void> {
		if (this.isInitializing) {
			Logger.debug('TaskStore', 'Already initializing, skipping...');
			return;
		}

		Logger.debug('TaskStore', '===== Starting initialization =====');
		Logger.debug('TaskStore', 'Config:', {
			globalTaskFilter,
			enabledFormats,
			retryCount
		});

		this.isInitializing = true;
		this.globalTaskFilter = (globalTaskFilter || '').trim();
		this.enabledFormats = enabledFormats || ['tasks', 'dataview'];

		// 【修复】重新初始化前，先清除旧的仓库缓存，防止任务累加
		this.repository.clear();
		this.invalidateCache();

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
			this.isInitializing = false;
			await new Promise(resolve => setTimeout(resolve, 500));
			return this.initialize(globalTaskFilter, enabledFormats, retryCount + 1);
		}

		const scanStartTime = performance.now();

		await this.markdownSource.initialize(config);

		Logger.debug('TaskStore', 'MarkdownDataSource initialized');

		this.isInitialized = true;
		this.isInitializing = false;

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
		// 销毁数据源，移除所有事件监听器
		this.markdownSource.destroy();
		this.repository.clear();
		this.isInitialized = false;
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
		if (this.updateDebounceTimer !== null) {
			clearTimeout(this.updateDebounceTimer);
		}

		this.updateDebounceTimer = window.setTimeout(() => {
			this.notifyListeners(filePath);
			this.updateDebounceTimer = null;
		}, this.DEBOUNCE_MS);
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
