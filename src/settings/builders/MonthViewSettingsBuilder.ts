import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig } from '../types';
import { i18n } from '../../i18n/i18n';

/**
 * 月视图设置构建器
 */
export class MonthViewSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		this.createSettingGroup(i18n.t('settings.monthView.groupTitle'), (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 月视图每天显示的任务数量
			addSetting(setting => {
				setting.setName(i18n.t('settings.monthView.taskLimit.name'))
					.setDesc(i18n.t('settings.monthView.taskLimit.description'))
					.addSlider(slider => slider
						.setLimits(1, 10, 1)
						.setValue(this.plugin.settings.monthViewTaskLimit)
						.setDynamicTooltip()
						.onChange((value) => {
							void (async () => {
								this.plugin.settings.monthViewTaskLimit = value;
								await this.saveAndRefreshViews();
							})();
						}));
			});

			// 月视图农历字号
			addSetting(setting => {
				setting.setName(i18n.t('settings.monthView.lunarFontSize.name'))
					.setDesc(i18n.t('settings.monthView.lunarFontSize.description'))
					.addSlider(slider => slider
						.setLimits(8, 18, 1)
						.setValue(this.plugin.settings.monthLunarFontSize)
						.setDynamicTooltip()
						.onChange((value) => {
							void (async () => {
								this.plugin.settings.monthLunarFontSize = value;
								await this.saveAndRefreshViews();
							})();
						}));
			});
		});
	}
}
