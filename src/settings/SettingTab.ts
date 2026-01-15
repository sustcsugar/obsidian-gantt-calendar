import { App, PluginSettingTab, type IconName } from 'obsidian';
import type GanttCalendarPlugin from '../../main';
import { GeneralSettingsBuilder } from './builders/GeneralSettingsBuilder';
import { TaskSettingsBuilder } from './builders/TaskSettingsBuilder';
import { TaskViewSettingsBuilder } from './builders/TaskViewSettingsBuilder';
import { CalendarViewSettingsBuilder } from './builders/CalendarViewSettingsBuilder';
import { DayViewSettingsBuilder } from './builders/DayViewSettingsBuilder';
import { MonthViewSettingsBuilder } from './builders/MonthViewSettingsBuilder';
import { YearViewSettingsBuilder } from './builders/YearViewSettingsBuilder';
import type { BuilderConfig } from './types';

/**
 * Gantt Calendar Plugin Settings Tab
 *
 * 重构后的设置标签类，使用构建器模式管理各个设置区域
 */
export class GanttCalendarSettingTab extends PluginSettingTab {
	plugin: GanttCalendarPlugin;

	constructor(app: App, plugin: GanttCalendarPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * 设置标签页图标（Obsidian 1.11+）
	 */
	override icon: IconName = 'calendar-days';

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// 创建刷新回调
		const refreshCallback = () => {
			this.display();
		};

		// ===== 通用设置 =====
		const generalBuilder = new GeneralSettingsBuilder({
			containerEl,
			plugin: this.plugin,
			onRefreshSettings: refreshCallback
		});
		generalBuilder.render();

		// ===== 任务设置 =====
		const taskSettingsBuilder = new TaskSettingsBuilder({
			containerEl,
			plugin: this.plugin,
			onRefreshSettings: refreshCallback
		});
		taskSettingsBuilder.render();

		// // ===== 任务视图设置 =====
		// const taskViewBuilder = new TaskViewSettingsBuilder({
		// 	containerEl,
		// 	plugin: this.plugin,
		// 	onRefreshSettings: refreshCallback
		// });
		// taskViewBuilder.render();

		// ===== 日历视图设置 =====
		const calendarViewBuilder = new CalendarViewSettingsBuilder({
			containerEl,
			plugin: this.plugin,
			onRefreshSettings: refreshCallback
		});
		calendarViewBuilder.render();

		// ===== 日视图设置 =====
		const dayViewBuilder = new DayViewSettingsBuilder({
			containerEl,
			plugin: this.plugin,
			onRefreshSettings: refreshCallback
		});
		dayViewBuilder.render();

		// ===== 月视图设置 =====
		const monthViewBuilder = new MonthViewSettingsBuilder({
			containerEl,
			plugin: this.plugin,
			onRefreshSettings: refreshCallback
		});
		monthViewBuilder.render();

		// ===== 年视图设置 =====
		const yearViewBuilder = new YearViewSettingsBuilder({
			containerEl,
			plugin: this.plugin,
			onRefreshSettings: refreshCallback
		});
		yearViewBuilder.render();
	}
}
