import { App, PluginSettingTab, type IconName } from 'obsidian';
import type GanttCalendarPlugin from '../../main';
import { GeneralSettingsBuilder } from './builders/GeneralSettingsBuilder';
import { CalendarSettingsBuilder } from './builders/CalendarSettingsBuilder';
import { CardDisplaySettingsBuilder } from './builders/CardDisplaySettingsBuilder';
import { CalendarViewSettingsBuilder } from './builders/CalendarViewSettingsBuilder';
import { DayViewSettingsBuilder } from './builders/DayViewSettingsBuilder';
import { MonthViewSettingsBuilder } from './builders/MonthViewSettingsBuilder';
import { YearViewSettingsBuilder } from './builders/YearViewSettingsBuilder';
import { GanttViewSettingsBuilder } from './builders/GanttViewSettingsBuilder';
import { TaskSettingsBuilder } from './builders/TaskSettingsBuilder';
import { TaskStatusSettingsBuilder } from './builders/TaskStatusSettingsBuilder';
import { FestivalColorBuilder } from './builders/FestivalColorBuilder';
import { SyncSettingsBuilder } from './builders/SyncSettingsBuilder';
import type { BuilderConfig } from './types';

/**
 * Gantt Calendar Plugin Settings Tab
 *
 * 5 个水平 Tab 页签：通用 | 日历 | 视图 | 任务 | 同步
 * 每个 Tab 内使用构建器模式组织设置区域
 */
export class GanttCalendarSettingTab extends PluginSettingTab {
	plugin: GanttCalendarPlugin;
	private activeTabIndex = 0;

	constructor(app: App, plugin: GanttCalendarPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	override icon: IconName = 'calendar-days';

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// —— Tab 导航栏 ——
		const tabNav = containerEl.createDiv('gc-settings-tab-nav');
		const tabs = ['通用', '日历', '视图', '任务', '同步'];
		const contentContainers: HTMLElement[] = [];

		tabs.forEach((name, i) => {
			const btn = tabNav.createEl('button', {
				text: name,
				cls: 'gc-settings-tab-button',
			});
			if (i === this.activeTabIndex) {
				btn.addClass('gc-settings-tab-button--active');
			}
			btn.addEventListener('click', () => {
				this.activeTabIndex = i;
				this.display();
			});

			const content = containerEl.createDiv('gc-settings-tab-content');
			if (i === this.activeTabIndex) {
				content.addClass('gc-settings-tab-content--active');
			}
			contentContainers.push(content);
		});

		const refresh = () => this.display();

		// —— 各 Tab 渲染 ——
		this.renderGeneralTab(contentContainers[0], refresh);
		this.renderCalendarTab(contentContainers[1], refresh);
		this.renderViewsTab(contentContainers[2], refresh);
		this.renderTasksTab(contentContainers[3], refresh);
		this.renderSyncTab(contentContainers[4], refresh);
	}

	private cfg(containerEl: HTMLElement, refresh: () => void): BuilderConfig {
		return { containerEl, plugin: this.plugin, onRefreshSettings: refresh };
	}

	// Tab 0: 通用
	private renderGeneralTab(el: HTMLElement, refresh: () => void): void {
		new GeneralSettingsBuilder(this.cfg(el, refresh)).render();
	}

	// Tab 1: 日历 (Daily Notes + 日历视图 + 节日颜色)
	private renderCalendarTab(el: HTMLElement, refresh: () => void): void {
		new CalendarSettingsBuilder(this.cfg(el, refresh)).render();
		new CalendarViewSettingsBuilder(this.cfg(el, refresh)).render();
		new FestivalColorBuilder(this.cfg(el, refresh)).render();
	}

	// Tab 2: 视图 (日/周/月/年/甘特图/侧边栏)
	private renderViewsTab(el: HTMLElement, refresh: () => void): void {
		new CardDisplaySettingsBuilder(this.cfg(el, refresh)).render();
		new DayViewSettingsBuilder(this.cfg(el, refresh)).render();
		new MonthViewSettingsBuilder(this.cfg(el, refresh)).render();
		new YearViewSettingsBuilder(this.cfg(el, refresh)).render();
		new GanttViewSettingsBuilder(this.cfg(el, refresh)).render();
	}

	// Tab 3: 任务
	private renderTasksTab(el: HTMLElement, refresh: () => void): void {
		new TaskSettingsBuilder(this.cfg(el, refresh)).render();
		new TaskStatusSettingsBuilder(this.cfg(el, refresh)).render();
	}

	// Tab 4: 同步
	private renderSyncTab(el: HTMLElement, refresh: () => void): void {
		new SyncSettingsBuilder(this.cfg(el, refresh)).render();
	}
}
