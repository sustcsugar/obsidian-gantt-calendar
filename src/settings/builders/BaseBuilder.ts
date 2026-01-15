import { Setting, SettingGroup } from 'obsidian';
import type GanttCalendarPlugin from '../../../main';
import type { BuilderConfig } from '../types';

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
			// 使用新 API (Obsidian 1.11+)
			const group = new SettingGroup(this.containerEl);
			group.setHeading(heading);
			callback(group);
		} else {
			// 旧版本：使用 h2 标题
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
	 * 保存设置并刷新视图的便捷方法
	 */
	protected async saveAndRefresh(): Promise<void> {
		await this.plugin.saveSettings();
		this.plugin.refreshCalendarViews();
	}

	/**
	 * 刷新设置面板（用于状态变更后重新渲染）
	 */
	protected refreshSettingsPanel(): void {
		if (this.onRefreshSettings) {
			this.onRefreshSettings();
		}
	}
}
