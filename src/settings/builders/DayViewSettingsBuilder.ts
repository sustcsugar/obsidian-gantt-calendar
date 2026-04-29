import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig } from '../types';

/**
 * 日视图构建器
 */
export class DayViewSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		this.createSettingGroup('日视图', (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 显示 Daily Note 开关
			addSetting(setting =>
				setting.setName('显示 Daily Note')
					.setDesc('在日视图中显示当天的 Daily Note 内容')
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.enableDailyNote)
						.onChange(async (value) => {
							this.plugin.settings.enableDailyNote = value;
							await this.saveAndRefreshViews();
						}))
			);

			// 日视图布局（仅在启用 Daily Note 时显示）
			if (this.plugin.settings.enableDailyNote) {
				addSetting(setting =>
					setting.setName('日视图布局')
						.setDesc('选择 Daily Note 和任务列表的布局方式')
						.addDropdown(drop => drop
							.addOptions({
								'horizontal': '左右分屏（任务在左，笔记在右）',
								'vertical': '上下分屏（任务在上，笔记在下）',
							})
							.setValue(this.plugin.settings.dayViewLayout)
							.onChange(async (value) => {
								this.plugin.settings.dayViewLayout = value as 'horizontal' | 'vertical';
								await this.saveAndRefreshViews();
							}))
				);
			}
		});
	}
}
