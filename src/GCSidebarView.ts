import { ItemView, WorkspaceLeaf } from 'obsidian';
import { createElement } from 'react';
import type { IPluginContext } from './types';
import { getTodayInTimezone } from './dateUtils/timezone';
import { useCalendarStore } from './ui/store/calendarStore';
import { PluginContext } from './ui/pluginContext';
import { mountReact } from './ui/reactBridge';
import { SidebarApp } from './ui/sidebar/SidebarApp';
import { TooltipProvider } from './ui/components/TooltipProvider';
import { ModalProvider } from './ui/components/ModalProvider';
import { Logger } from './utils/logger';

export const GC_SIDEBAR_VIEW_ID = 'gantt-calendar-sidebar-view';

/**
 * 侧边栏视图（React 渲染）
 *
 * Tab 切换/筛选/时间线全部由 React 组件（SidebarApp）完成，
 * 本类仅负责生命周期、插件上下文与数据桥接。
 */
export class GCSidebarView extends ItemView {
	private plugin: IPluginContext;
	private cacheUpdateListener: ((filePath?: string) => void) | null = null;
	private unmountReact: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: IPluginContext) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return GC_SIDEBAR_VIEW_ID;
	}

	getDisplayText(): string {
		return 'Gantt calendar';
	}

	getIcon(): string {
		return 'goal';
	}

	async onOpen(): Promise<void> {
		// P0 启动解耦：onOpen 不再 await 全库首扫（与 GCMainView 同源修复，
		// 打断 layout 恢复 ↔ onOpen ↔ onLayoutReady 的循环等待），先挂骨架。
		useCalendarStore.setState({
			currentDate: getTodayInTimezone(),
		});

		// 骨架先行：以空任务集挂载 React，布局恢复不再被本视图拖住
		if (!this.unmountReact) {
			this.unmountReact = mountReact(
				this.contentEl,
				createElement(
					PluginContext.Provider,
					{ value: this.plugin },
					createElement(
						ModalProvider,
						null,
						createElement(TooltipProvider, null, createElement(SidebarApp))
					)
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

		// 数据就绪后推入（不阻塞 onOpen）；失败兜底：空任务集解除骨架（P0''）
		const ready = this.plugin?.taskCache?.whenReady?.();
		if (ready) {
			void ready
				.then(() => {
					useCalendarStore.getState().setTasks(
						this.plugin.taskCache?.getAllTasks() || []
					);
				})
				.catch((error: unknown) => {
					Logger.error('GCSidebarView', 'Task cache failed to initialize:', error);
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
		if (this.cacheUpdateListener) {
			this.plugin?.taskCache?.offUpdate(this.cacheUpdateListener);
			this.cacheUpdateListener = null;
		}

		if (this.unmountReact) {
			this.unmountReact();
			this.unmountReact = null;
		}
	}
}
