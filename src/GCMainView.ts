import { ItemView, WorkspaceLeaf } from 'obsidian';
import { createElement } from 'react';
import { CalendarViewType, IPluginContext } from './types';

import { getTodayInTimezone } from './dateUtils/timezone';
import { useCalendarStore } from './ui/store/calendarStore';
import { PluginContext } from './ui/pluginContext';
import { mountReact } from './ui/reactBridge';
import { App } from './ui/App';
import { Logger } from './utils/logger';

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
		// P0 启动解耦：onOpen 不再 await 全库首扫。旧行为与「首扫被钉在
		// onLayoutReady 之后」互相等待成环，会把 ~1s 的扫描放大成 ~10s 的
		// Load layout 卡顿（docs/report-startup-layout-block-2026-09-23.md §4）。
		// 现在先挂骨架（tasksReady=false）立即返回，数据就绪后由 store 驱动接管。
		useCalendarStore.setState({
			viewType: this.plugin.settings.defaultView || 'year',
			currentDate: getTodayInTimezone(),
		});

		// 骨架先行：以空任务集挂载 React，布局恢复不再被本视图拖住
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

		// 订阅先行：保证首扫完成的通知不早于订阅而丢失
		this.cacheUpdateListener = (filePath?: string) => {
			if (this.containerEl.isConnected) {
				useCalendarStore.getState().notifyTasksUpdated(
					this.plugin.taskCache.getAllTasks(),
					filePath
				);
			}
		};
		this.plugin?.taskCache?.onUpdate(this.cacheUpdateListener);

		// 数据就绪后推入（不阻塞 onOpen）；失败兜底：空任务集解除骨架，
		// 避免初始化失败时永久停留在加载态（P0''）
		const ready = this.plugin?.taskCache?.whenReady?.();
		if (ready) {
			void ready
				.then(() => {
					useCalendarStore.getState().setTasks(
						this.plugin.taskCache?.getAllTasks() || []
					);
				})
				.catch((error: unknown) => {
					Logger.error('GCMainView', 'Task cache failed to initialize:', error);
					useCalendarStore.getState().setTasks([]);
				});
		}
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
