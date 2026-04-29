import { Setting, SettingGroup } from 'obsidian';
import type GanttCalendarPlugin from '../../../main';
import type { BuilderConfig, GanttCalendarSettings } from '../types';

/**
 * 视图类型（用于卡片显示控制 toggle）
 */
type ViewType = 'week' | 'month' | 'sidebar';

/**
 * 设置构建器基类
 * 提供所有构建器的通用接口和公共方法
 */
export abstract class BaseBuilder {
	protected containerEl: HTMLElement;
	protected plugin: GanttCalendarPlugin;
	protected onRefreshSettings?: () => void;

	constructor(config: BuilderConfig) {
		this.containerEl = config.containerEl;
		this.plugin = config.plugin;
		this.onRefreshSettings = config.onRefreshSettings;
	}

	/**
	 * 检测 SettingGroup API 是否可用（Obsidian 1.11+）
	 */
	protected isSettingGroupAvailable(): boolean {
		try {
			return typeof SettingGroup === 'function';
		} catch {
			return false;
		}
	}

	/**
	 * 创建设置分组（兼容旧版本）
	 * @param heading 分组标题
	 * @param callback 设置项回调
	 */
	protected createSettingGroup(
		heading: string,
		callback: (group: SettingGroup | HTMLElement) => void
	): void {
		if (this.isSettingGroupAvailable()) {
			const group = new SettingGroup(this.containerEl);
			group.setHeading(heading);
			callback(group);
		} else {
			this.containerEl.createEl('h2', { text: heading, cls: 'setting-item-heading' });
			callback(this.containerEl);
		}
	}

	/**
	 * 渲染设置区域
	 * 子类必须实现此方法
	 */
	abstract render(): void;

	/**
	 * 创建 Setting 实例的便捷方法
	 */
	protected createSetting(name: string, desc: string): Setting {
		return new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc);
	}

	/**
	 * 保存并刷新插件视图（年/月/周/日/任务/甘特图/侧边栏）
	 * 绝大多数设置项应使用此方法
	 */
	protected async saveAndRefreshViews(): Promise<void> {
		await this.plugin.saveSettings();
		this.plugin.refreshCalendarViews();
	}

	/**
	 * 保存 + 刷新视图 + 重建设置页 DOM
	 * 仅当设置页结构变化时使用（增删状态、OAuth 状态变更、清单选择）
	 */
	protected async saveAndRefreshAll(): Promise<void> {
		await this.plugin.saveSettings();
		this.plugin.refreshCalendarViews();
		if (this.onRefreshSettings) {
			this.onRefreshSettings();
		}
	}

	/**
	 * 批量添加卡片显示控制 toggle（复选框/标签/优先级/Ticktick）
	 * 用于 WeekView、MonthView、SidebarView 消除重复代码
	 */
	protected addCardDisplayToggles(
		addSetting: (cb: (setting: Setting) => void) => void,
		viewType: ViewType
	): void {
		const viewLabels: Record<ViewType, string> = {
			week: '周视图', month: '月视图', sidebar: '侧边栏'
		};
		const label = viewLabels[viewType];

		const settingKeyMap: Record<ViewType, Record<string, keyof GanttCalendarSettings>> = {
			week: {
				checkbox: 'weekViewShowCheckbox',
				tags: 'weekViewShowTags',
				priority: 'weekViewShowPriority',
				ticktick: 'weekViewShowTicktick',
			},
			month: {
				checkbox: 'monthViewShowCheckbox',
				tags: 'monthViewShowTags',
				priority: 'monthViewShowPriority',
				ticktick: 'monthViewShowTicktick',
			},
			sidebar: {
				checkbox: 'sidebarShowCheckbox',
				tags: 'sidebarShowTags',
				priority: 'sidebarShowPriority',
				ticktick: 'sidebarShowTicktick',
			},
		};
		const keys = settingKeyMap[viewType];

		const toggles = [
			{ key: keys.checkbox, name: '显示复选框', desc: `在${label}任务卡片中显示任务复选框` },
			{ key: keys.tags, name: '显示任务标签', desc: `在${label}任务卡片中显示任务标签` },
			{ key: keys.priority, name: '显示任务优先级', desc: `在${label}任务卡片中显示任务优先级图标` },
			{ key: keys.ticktick, name: '显示 Ticktick', desc: `在${label}任务卡片中显示 %%content%% ticktick 文本` },
		];

		for (const toggle of toggles) {
			addSetting(setting =>
				setting.setName(toggle.name)
					.setDesc(toggle.desc)
					.addToggle(t => t
						.setValue(!!(this.plugin.settings as unknown as Record<string, unknown>)[toggle.key])
						.onChange(async (value) => {
							(this.plugin.settings as unknown as Record<string, unknown>)[toggle.key] = value;
							await this.saveAndRefreshViews();
						}))
			);
		}
	}
}
