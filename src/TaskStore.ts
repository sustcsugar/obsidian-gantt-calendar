import { App } from 'obsidian';
import { GCTask } from './types';

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

export type TaskStoreUpdateListener = () => void;

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
 * - 内置结果缓存，避免重复排序
 * - 防抖通知机制，合并连续更新
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
	 */
	private setupEventForwarding(): void {
		this.eventBus.on('task:created', () => {
			console.log('[TaskStore] Event: task:created');
			this.invalidateCache();
			this.notifyListenersDebounced();
		});
		this.eventBus.on('task:updated', () => {
			console.log('[TaskStore] Event: task:updated');
			this.invalidateCache();
			this.notifyListenersDebounced();
		});
		this.eventBus.on('task:deleted', () => {
			console.log('[TaskStore] Event: task:deleted');
			this.invalidateCache();
			this.notifyListenersDebounced();
		});
	}

	/**
	 * 初始化存储 - 扫描整个笔记库
	 */
	async initialize(globalTaskFilter: string, enabledFormats?: string[], retryCount: number = 0): Promise<void> {
		if (this.isInitializing) {
			console.log('[TaskStore] Already initializing, skipping...');
			return;
		}

		console.log('[TaskStore] ===== Starting initialization =====');
		console.log('[TaskStore] Config:', {
			globalTaskFilter,
			enabledFormats,
			retryCount
		});

		this.isInitializing = true;
		this.globalTaskFilter = (globalTaskFilter || '').trim();
		this.enabledFormats = enabledFormats || ['tasks', 'dataview'];

		const config: DataSourceConfig = {
			enabled: true,
			syncDirection: 'import-only',
			autoSync: true,
			conflictResolution: 'local-win',
			globalFilter: this.globalTaskFilter,
			enabledFormats: this.enabledFormats
		};

		const markdownFiles = this.app.vault.getMarkdownFiles();
		console.log('[TaskStore] Vault has', markdownFiles.length, 'markdown files');

		if (markdownFiles.length === 0 && retryCount < 3) {
			console.log(`[TaskStore] Vault not ready, retrying in 500ms...`);
			this.isInitializing = false;
			await new Promise(resolve => setTimeout(resolve, 500));
			return this.initialize(globalTaskFilter, enabledFormats, retryCount + 1);
		}

		const timerLabel = retryCount === 0 ? '[TaskStore] Initial scan' : `[TaskStore] Initial scan (retry ${retryCount})`;
		console.time(timerLabel);

		await this.markdownSource.initialize(config);

		console.log('[TaskStore] MarkdownDataSource initialized');

		this.isInitialized = true;
		this.isInitializing = false;

		this.notifyListeners();

		const stats = this.repository.getStats();
		console.timeEnd(timerLabel);
		console.log('[TaskStore] Init summary', {
			totalFiles: markdownFiles.length,
			tasksFound: stats.totalTasks,
			dataSources: stats.dataSources
		});
		console.log('[TaskStore] ===== Initialization complete =====');
	}

	/**
	 * 获取所有任务（带缓存）
	 */
	getAllTasks(): GCTask[] {
		if (this.cacheValid && this.cachedTasks) {
			console.log('[TaskStore] Returning cached tasks', this.cachedTasks.length);
			return this.cachedTasks;
		}

		const startTime = performance.now();
		console.log('[TaskStore] Cache miss, rebuilding...');

		const allTasks = this.repository.getAllTasks();
		console.log(`[TaskStore] Got ${allTasks.length} tasks from repository`);

		if (this.enableDuplicateCheck) {
			this.checkDuplicates(allTasks);
		}

		const sorted = allTasks.sort((a, b) => {
			if (a.fileName !== b.fileName) {
				return a.fileName.localeCompare(b.fileName);
			}
			return a.lineNumber - b.lineNumber;
		});

		this.cachedTasks = sorted;
		this.cacheValid = true;

		const elapsed = performance.now() - startTime;
		console.log(`[TaskStore] Cache rebuilt in ${elapsed.toFixed(2)}ms (${sorted.length} tasks)`);

		return sorted;
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
			console.log('[TaskStore] Settings changed, reinitializing...');
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
		this.repository.clear();
		this.isInitialized = false;
		console.log('[TaskStore] Cache cleared');
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
	 */
	private notifyListenersDebounced(): void {
		if (this.updateDebounceTimer !== null) {
			clearTimeout(this.updateDebounceTimer);
		}

		this.updateDebounceTimer = window.setTimeout(() => {
			this.notifyListeners();
			this.updateDebounceTimer = null;
		}, this.DEBOUNCE_MS);
	}

	/**
	 * 通知所有监听器
	 */
	private notifyListeners(): void {
		this.updateListeners.forEach(listener => {
			try {
				listener();
			} catch (error) {
				console.error('[TaskStore] Error in update listener:', error);
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
			console.warn('[TaskStore] Duplicate tasks found:', duplicates);
		}
	}
}
