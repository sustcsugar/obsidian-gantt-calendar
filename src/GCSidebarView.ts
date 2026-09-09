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
		// 等待任务缓存准备完成
		if (this.plugin?.taskCache?.whenReady) {
			await this.plugin.taskCache.whenReady();
		}

		// 初始化 store：时区感知的"今天" + 当前任务（SetTasks 触发幽灵标签剔除）
		useCalendarStore.setState({
			currentDate: getTodayInTimezone(),
		});
		useCalendarStore.getState().setTasks(this.plugin.taskCache?.getAllTasks() || []);

		// 挂载 React 应用（需 TooltipProvider/ModalProvider 包裹，TaskCard 依赖其 context）
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