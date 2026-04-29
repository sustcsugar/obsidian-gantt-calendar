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
		this.createSettingGroup('月视图', (group) => {
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
							await this.saveAndRefreshViews();
						}))
			);

			// 月视图农历字号
			addSetting(setting =>
				setting.setName('月视图农历字号')
					.setDesc('设置月视图中农历文字的大小（8-18px）')
					.addSlider(slider => slider
						.setLimits(8, 18, 1)
						.setValue(this.plugin.settings.monthLunarFontSize)
						.setDynamicTooltip()
						.onChange(async (value) => {
							this.plugin.settings.monthLunarFontSize = value;
							await this.saveAndRefreshViews();
						}))
			);
		});
	}
}
