import { App, PluginSettingTab, type IconName, type SettingDefinitionItem, type SettingPage } from 'obsidian';
import * as ObsidianModule from 'obsidian';
import { SettingsClasses } from '../utils/bem';
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

/** SettingPage 的构造器形状（类型仅在编译期存在，见 resolveSettingPageCtor） */
type SettingPageCtor = new () => SettingPage;

/**
 * 运行时解析 SettingPage 构造器（1.13.0+ API）。
 *
 * 经 computed 成员访问获取：no-unsupported-api 要求源码中对 Obsidian API
 * 的静态引用不高于 minAppVersion（1.11.0），而 SettingPage 仅在 1.13+
 * 才会调用 getSettingDefinitions() 的路径上使用。1.11/1.12 上解析为
 * undefined，调用方回退 display()；配合把子类定义延迟到方法体内，
 * 模块加载期永远不会对 undefined 执行 extends。
 */
function resolveSettingPageCtor(): SettingPageCtor | undefined {
	const ctor = (ObsidianModule as unknown as Record<string, unknown>)['SettingPage'];
	return typeof ctor === 'function' ? (ctor as SettingPageCtor) : undefined;
}

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

	// minAppVersion=1.11.0：display() 是 1.13 以下唯一的渲染入口，
	// 官方文档认定的 fallback 用法（1.13+ 走 getSettingDefinitions；
	// no-deprecated 为受保护规则，本文件的豁免在 eslint.config.mjs 配置层）
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// —— Tab 导航栏 ——
		const tabNav = containerEl.createDiv(SettingsClasses.elements.tabNav);
		const tabs = [i18n.t('settings.tabs.general'), i18n.t('settings.tabs.calendar'), i18n.t('settings.tabs.views'), i18n.t('settings.tabs.tasks'), i18n.t('settings.tabs.sync')];
		const contentContainers: HTMLElement[] = [];

		tabs.forEach((name, i) => {
			const btn = tabNav.createEl('button', {
				text: name,
				cls: SettingsClasses.elements.tabButton,
			});
			if (i === this.activeTabIndex) {
				btn.addClass(`${SettingsClasses.elements.tabButton}--active`);
			}
			btn.addEventListener('click', () => {
				this.activeTabIndex = i;
				this.display();
			});

			const content = containerEl.createDiv(SettingsClasses.elements.tabContent);
			if (i === this.activeTabIndex) {
				content.addClass(`${SettingsClasses.elements.tabContent}--active`);
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

	/**
	 * Obsidian 1.13+ 声明式设置入口：五个 Tab 建模为五个可导航子页，
	 * 使设置页可被 Obsidian 全局设置搜索索引。
	 *
	 * manifest 的 minAppVersion=1.11.0，1.13 以下版本仍走 display()
	 * fallback（官方文档认定的旧版本兼容用法）；1.13+ 返回非空定义后
	 * 框架改用声明式渲染，display() 不再被调用。
	 *
	 * 子类定义放在方法体内：仅在 1.13+ 的调用路径上对 SettingPage
	 * 求值 extends，1.11/1.12 模块加载期不会触碰。
	 */
	override getSettingDefinitions(): SettingDefinitionItem[] {
		const settingPageCtor = resolveSettingPageCtor();
		if (!settingPageCtor) return [];

		/** 命令式 builder 内容包成声明式子页（refresh 语义与 display() 一致：整页重渲染） */
		class BuilderTabSettingPage extends settingPageCtor {
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
