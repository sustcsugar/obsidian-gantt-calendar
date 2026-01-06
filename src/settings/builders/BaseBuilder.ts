import { Setting } from 'obsidian';
import type GanttCalendarPlugin from '../../../main';
import type { BuilderConfig } from '../types';

/**
 * 设置构建器基类
 * 提供所有构建器的通用接口和公共方法
 */
export abstract class BaseBuilder {
	protected containerEl: HTMLElement;
	protected plugin: GanttCalendarPlugin;

	constructor(config: BuilderConfig) {
		this.containerEl = config.containerEl;
		this.plugin = config.plugin;
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
}
