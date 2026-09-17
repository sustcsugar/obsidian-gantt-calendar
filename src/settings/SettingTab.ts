import { App, PluginSettingTab, type IconName, type SettingDefinitionItem, SettingPage } from 'obsidian';
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
import { i18n } from '../i18n/i18n';

/**
 * 命令式 builder 内容包成声明式子页。
 *
 * minAppVersion=1.13.0 起 SettingPage 必然存在，可直接静态继承，
 * 不再需要 1.11/1.12 的运行时解析与延迟 extends 兼容层。
 * refresh 语义保持整页重渲染。
 */
class BuilderTabSettingPage extends SettingPage {
	constructor(
		title: string,
		private readonly renderContent: (containerEl: HTMLElement, refresh: () => void) => void,
	) {
		super();
		this.title = title;
	}

	display(): void {
		this.containerEl.empty();
		this.renderContent(this.containerEl, () => this.display());
	}
}

/**
 * Gantt Calendar 插件设置页
 *
 * Obsidian 1.13+ 声明式设置：五个 Tab（通用 | 日历 | 视图 | 任务 | 同步）
 * 建模为五个可导航子页，使设置页可被 Obsidian 全局设置搜索索引。
 * 每个 Tab 内使用构建器模式组织设置区域。
 */
export class GanttCalendarSettingTab extends PluginSettingTab {
	plugin: GanttCalendarPlugin;

	constructor(app: App, plugin: GanttCalendarPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	override icon: IconName = 'calendar-days';

	/**
	 * 声明式设置入口：返回非空定义后框架使用声明式渲染，
	 * 生成五个可导航子页（设置搜索索引的数据来源）。
	 */
	override getSettingDefinitions(): SettingDefinitionItem[] {
		const page = (
			nameKey: string,
			descKey: string,
			render: (el: HTMLElement, refresh: () => void) => void,
		): SettingDefinitionItem => {
			const name = i18n.t(nameKey);
			return {
				type: 'page',
				name,
				desc: i18n.t(descKey),
				page: () => new BuilderTabSettingPage(name, render),
			};
		};
		return [
			page('settings.tabs.general', 'settings.tabs.generalDesc', (el, refresh) => this.renderGeneralTab(el, refresh)),
			page('settings.tabs.calendar', 'settings.tabs.calendarDesc', (el, refresh) => this.renderCalendarTab(el, refresh)),
			page('settings.tabs.views', 'settings.tabs.viewsDesc', (el, refresh) => this.renderViewsTab(el, refresh)),
			page('settings.tabs.tasks', 'settings.tabs.tasksDesc', (el, refresh) => this.renderTasksTab(el, refresh)),
			page('settings.tabs.sync', 'settings.tabs.syncDesc', (el, refresh) => this.renderSyncTab(el, refresh)),
		];
	}

	private cfg(containerEl: HTMLElement, refresh: () => void): BuilderConfig {
		return { containerEl, plugin: this.plugin, onRefreshSettings: refresh };
	}

	// 子页 0: 通用
	private renderGeneralTab(el: HTMLElement, refresh: () => void): void {
		new GeneralSettingsBuilder(this.cfg(el, refresh)).render();
	}

	// 子页 1: 日历 (Daily Notes + 日历视图 + 节日颜色)
	private renderCalendarTab(el: HTMLElement, refresh: () => void): void {
		new CalendarSettingsBuilder(this.cfg(el, refresh)).render();
		new CalendarViewSettingsBuilder(this.cfg(el, refresh)).render();
		new FestivalColorBuilder(this.cfg(el, refresh)).render();
	}

	// 子页 2: 视图 (日/周/月/年/甘特图/侧边栏)
	private renderViewsTab(el: HTMLElement, refresh: () => void): void {
		new CardDisplaySettingsBuilder(this.cfg(el, refresh)).render();
		new DayViewSettingsBuilder(this.cfg(el, refresh)).render();
		new MonthViewSettingsBuilder(this.cfg(el, refresh)).render();
		new YearViewSettingsBuilder(this.cfg(el, refresh)).render();
		new GanttViewSettingsBuilder(this.cfg(el, refresh)).render();
	}

	// 子页 3: 任务
	private renderTasksTab(el: HTMLElement, refresh: () => void): void {
		new TaskSettingsBuilder(this.cfg(el, refresh)).render();
		new TaskStatusSettingsBuilder(this.cfg(el, refresh)).render();
	}

	// 子页 4: 同步
	private renderSyncTab(el: HTMLElement, refresh: () => void): void {
		new SyncSettingsBuilder(this.cfg(el, refresh)).render();
	}
}
