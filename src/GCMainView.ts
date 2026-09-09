import { ItemView, WorkspaceLeaf } from 'obsidian';
import { createElement } from 'react';
import { CalendarViewType, IPluginContext } from './types';

import { getTodayInTimezone } from './dateUtils/timezone';
import { useCalendarStore } from './ui/store/calendarStore';
import { PluginContext } from './ui/pluginContext';
import { mountReact } from './ui/reactBridge';
import { App } from './ui/App';

export const GC_VIEW_ID = 'gantt-calendar-view';

/**
 * 主日历视图（React 渲染）
 *
 * React 根组件作为数据入口：视图切换/日期导航/筛选排序全部通过
 * useCalendarStore 完成，本类仅负责生命周期、插件上下文与数据桥接。
 */
export class GCMainView extends ItemView {
	private plugin: IPluginContext;
	private cacheUpdateListener: ((filePath?: string) => void) | null = null;
	private unmountReact: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: IPluginContext) {
		super(leaf);
		this.plugin = plugin;
		// 存储 calendarView 引用到 plugin,供子渲染器访问
		this.plugin.calendarView = this;
	}

	getViewType(): string {
		return GC_VIEW_ID;
	}

	getDisplayText(): string {
		return 'Gantt calendar';
	}

	getIcon(): string {
		return 'calendar-days';
	}

	async onOpen(): Promise<void> {
		// 等待任务缓存准备完成
		if (this.plugin?.taskCache?.whenReady) {
			await this.plugin.taskCache.whenReady();
		}

		// 初始化 store：使用设置中的默认视图 + 时区感知的"今天"；
		// 任务经 setTasks 写入以便触发幽灵标签剔除（见 calendarStore.pruneTagFilters）
		useCalendarStore.setState({
			viewType: this.plugin.settings.defaultView || 'year',
			currentDate: getTodayInTimezone(),
		});
		useCalendarStore.getState().setTasks(this.plugin.taskCache?.getAllTasks() || []);

		// 挂载 React 应用
		if (!this.unmountReact) {
			this.unmountReact = mountReact(
				this.contentEl,
				createElement(
					PluginContext.Provider,
					{ value: this.plugin },
					createElement(App)
				)
			);
		}

		// 订阅缓存更新事件 → 通知 store（视图自动重渲染）
		this.cacheUpdateListener = (filePath?: string) => {
			if (this.containerEl.isConnected) {
				useCalendarStore.getState().notifyTasksUpdated(
					this.plugin.taskCache.getAllTasks(),
					filePath
				);
			}
		};
		this.plugin?.taskCache?.onUpdate(this.cacheUpdateListener);
	}

	/**
	 * 设置变更后触发 React 整体重挂载（重新读取设置）
	 */
	public refreshSettings(): void {
		useCalendarStore.getState().bumpSettings();
	}

	async onClose(): Promise<void> {
		// Unsubscribe from cache updates
		if (this.cacheUpdateListener) {
			this.plugin?.taskCache?.offUpdate(this.cacheUpdateListener);
			this.cacheUpdateListener = null;
		}

		// Unmount React
		if (this.unmountReact) {
			this.unmountReact();
			this.unmountReact = null;
		}
	}

	// ===== 公共方法供外部调用（命令/侧栏等） =====

	public selectDate(date: Date, viewType?: CalendarViewType): void {
		useCalendarStore.setState({
			currentDate: new Date(date),
			viewType: viewType ?? 'day',
		});
	}

	public getCurrentDate(): Date {
		return useCalendarStore.getState().currentDate;
	}

	public switchView(type: CalendarViewType): void {
		useCalendarStore.getState().setViewType(type);
	}

	/**
	 * 保留旧 API：触发一次全量重渲染（等价 refreshSettings）
	 */
	public render(): void {
		this.refreshSettings();
	}
}