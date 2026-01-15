import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig } from '../types';

/**
 * 月视图设置构建器
 */
export class MonthViewSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		// 使用 SettingGroup 替代 h2 标题（兼容旧版本）
		this.createSettingGroup('月视图设置', (group) => {
			// 统一添加设置项的方法
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 月视图每天显示的任务数量
			addSetting(setting =>
				setting.setName('每天显示的任务数量')
					.setDesc('设置月视图中每个日期卡片最多显示多少个任务（1-10）')
					.addSlider(slider => slider
						.setLimits(1, 10, 1)
						.setValue(this.plugin.settings.monthViewTaskLimit)
						.setDynamicTooltip()
						.onChange(async (value) => {
							this.plugin.settings.monthViewTaskLimit = value;
							await this.saveAndRefresh();
						}))
			);
		});
	}
}
