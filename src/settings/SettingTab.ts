import { App, PluginSettingTab } from 'obsidian';
import type GanttCalendarPlugin from '../../main';
import { TaskViewSettingsBuilder } from './builders/TaskViewSettingsBuilder';
import { TaskStatusSettingsBuilder } from './builders/TaskStatusSettingsBuilder';
import { CalendarViewSettingsBuilder } from './builders/CalendarViewSettingsBuilder';
import { DayViewSettingsBuilder } from './builders/DayViewSettingsBuilder';
import { MonthViewSettingsBuilder } from './builders/MonthViewSettingsBuilder';
import { YearViewSettingsBuilder } from './builders/YearViewSettingsBuilder';
import { FestivalColorBuilder } from './builders/FestivalColorBuilder';
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

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ===== 任务视图设置 =====
		const taskViewBuilder = new TaskViewSettingsBuilder({
			containerEl,
			plugin: this.plugin
		});
		taskViewBuilder.render();

		// ===== 任务状态设置 =====
		const taskStatusBuilder = new TaskStatusSettingsBuilder({
			containerEl,
			plugin: this.plugin
		});
		taskStatusBuilder.render();

		// ===== 日历视图设置 =====
		const calendarViewBuilder = new CalendarViewSettingsBuilder({
			containerEl,
			plugin: this.plugin
		});
		calendarViewBuilder.render();

		// ===== 节日颜色设置 =====
		const festivalColorBuilder = new FestivalColorBuilder({
			containerEl,
			plugin: this.plugin
		});
		festivalColorBuilder.render();

		// ===== 日视图设置 =====
		const dayViewBuilder = new DayViewSettingsBuilder({
			containerEl,
			plugin: this.plugin
		});
		dayViewBuilder.render();

		// ===== 月视图设置 =====
		const monthViewBuilder = new MonthViewSettingsBuilder({
			containerEl,
			plugin: this.plugin
		});
		monthViewBuilder.render();

		// ===== 年视图设置 =====
		const yearViewBuilder = new YearViewSettingsBuilder({
			containerEl,
			plugin: this.plugin
		});
		yearViewBuilder.render();
	}
}
