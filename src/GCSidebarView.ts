import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import { SidebarClasses, withModifiers } from './utils/bem';
import { TaskListTab } from './sidebar/TaskListTab';
import { DailyTimelineTab } from './sidebar/DailyTimelineTab';
import { Logger } from './utils/logger';
import { i18n } from './i18n/i18n';
import type { IPluginContext } from './types';

export const GC_SIDEBAR_VIEW_ID = 'gantt-calendar-sidebar-view';

type SidebarTab = 'taskList' | 'dailyTimeline';

export class GCSidebarView extends ItemView {
	private plugin: IPluginContext;
	private currentTab: SidebarTab = 'dailyTimeline';
	private taskListTab: TaskListTab;
	private dailyTimelineTab: DailyTimelineTab;
	private contentContainer: HTMLElement | null = null;
	private cacheUpdateListener: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: IPluginContext) {
		super(leaf);
		this.plugin = plugin;
		this.taskListTab = new TaskListTab(this.app, plugin);
		this.dailyTimelineTab = new DailyTimelineTab(this.app, plugin);
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

		this.render();

		// 订阅缓存更新事件
		this.cacheUpdateListener = () => {
			if (this.containerEl.isConnected) {
				this.refreshCurrentTab();
			}
		};
		this.plugin?.taskCache?.onUpdate(this.cacheUpdateListener);
	}

	async onClose(): Promise<void> {
		if (this.cacheUpdateListener) {
			this.plugin?.taskCache?.offUpdate(this.cacheUpdateListener);
			this.cacheUpdateListener = null;
		}
		this.taskListTab.cleanup();
		this.dailyTimelineTab.cleanup();
	}

	private render(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass(SidebarClasses.block);

		// Tab 切换栏
		const tabBar = container.createDiv(SidebarClasses.elements.tabBar);
		this.renderTabBar(tabBar);

		// 内容区域
		this.contentContainer = container.createDiv(SidebarClasses.elements.content);
		this.renderCurrentTab();
	}

	private renderTabBar(tabBar: HTMLElement): void {
		const taskListBtn = tabBar.createDiv(
			withModifiers(
				SidebarClasses.elements.tabBtn,
				this.currentTab === 'taskList' ? SidebarClasses.elements.tabBtnActive : undefined
			)
		);
		const taskListIcon = taskListBtn.createSpan();
		setIcon(taskListIcon, 'list');
		taskListBtn.createSpan({ text: ' ' + i18n.t('sidebar.tabTitles.taskList') });
		taskListBtn.addEventListener('click', () => {
			this.switchTab('taskList');
		});

		const timelineBtn = tabBar.createDiv(
			withModifiers(
				SidebarClasses.elements.tabBtn,
				this.currentTab === 'dailyTimeline' ? SidebarClasses.elements.tabBtnActive : undefined
			)
		);
		const timelineIcon = timelineBtn.createSpan();
		setIcon(timelineIcon, 'clock');
		timelineBtn.createSpan({ text: ' ' + i18n.t('sidebar.tabTitles.dailyTimeline') });
		timelineBtn.addEventListener('click', () => {
			this.switchTab('dailyTimeline');
		});
	}

	private switchTab(tab: SidebarTab): void {
		if (this.currentTab === tab) return;
		this.currentTab = tab;
		this.render();
	}

	/**
	 * 刷新侧边栏（供 ViewManager 调用）
	 */
	public refreshSettings(): void {
		this.render();
	}

	private renderCurrentTab(): void {
		if (!this.contentContainer) return;
		this.contentContainer.empty();

		switch (this.currentTab) {
			case 'taskList':
				this.taskListTab.render(this.contentContainer);
				break;
			case 'dailyTimeline':
				this.dailyTimelineTab.render(this.contentContainer);
				break;
		}
	}

	private refreshCurrentTab(): void {
		if (!this.contentContainer) return;

		switch (this.currentTab) {
			case 'taskList':
				this.taskListTab.refresh(this.contentContainer);
				break;
			case 'dailyTimeline':
				this.dailyTimelineTab.refresh(this.contentContainer);
				break;
		}
	}
}
