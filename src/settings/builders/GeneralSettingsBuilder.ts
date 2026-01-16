import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig } from '../types';

/**
 * 通用设置构建器
 * 包含默认视图设置
 */
export class GeneralSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		// 使用 SettingGroup 替代 h1 标题（兼容旧版本）
		this.createSettingGroup('通用设置', (group) => {
			// 统一添加设置项的方法
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 默认视图
			addSetting(setting =>
				setting.setName('默认视图')
					.setDesc('打开插件时默认显示的视图')
					.addDropdown(drop => drop
						.addOptions({
							'day': '日视图',
							'week': '周视图',
							'month': '月视图',
							'year': '年视图',
							'task': '任务视图',
							'gantt': '甘特图'
						})
						.setValue(this.plugin.settings.defaultView)
						.onChange(async (value) => {
							this.plugin.settings.defaultView = value as 'day' | 'week' | 'month' | 'year' | 'task' | 'gantt';
							await this.saveAndRefresh();
						}))
			);

			// 开发者模式
			addSetting(setting =>
				setting.setName('开发者模式')
					.setDesc('启用后将输出详细的调试日志，关闭后仅显示统计信息和错误')
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.enableDebugMode)
						.onChange(async (value) => {
							this.plugin.settings.enableDebugMode = value;
							await this.saveAndRefresh();
						}))
			);

			// 视图导航按钮显示文本
			addSetting(setting =>
				setting.setName('视图导航按钮显示文本')
					.setDesc('工具栏左侧的视图导航按钮是否显示文字标签。关闭后仅显示图标')
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.showViewNavButtonText)
						.onChange(async (value) => {
							this.plugin.settings.showViewNavButtonText = value;
							await this.saveAndRefresh();
						}))
			);
		});
	}
}
