import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import { MacaronColorPicker } from '../components';
import { PRESET_FESTIVAL_COLORS } from '../constants';
import type { BuilderConfig } from '../types';
import { i18n } from '../../i18n/i18n';

/**
 * 节日颜色设置构建器
 */
export class FestivalColorBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		this.createSettingGroup(i18n.t('settings.festivalColor.groupTitle'), (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 阳历节日颜色
			addSetting(setting => {
				setting.setName(i18n.t('settings.festivalColor.solarFestival.name'))
					.setDesc(i18n.t('settings.festivalColor.solarFestival.description'));
				setting.controlEl.empty();
				new MacaronColorPicker({
					container: setting.controlEl,
					currentColor: this.plugin.settings.solarFestivalColor,
					colors: PRESET_FESTIVAL_COLORS,
					columns: 7,
					onColorChange: async (color) => {
						this.plugin.settings.solarFestivalColor = color;
						await this.saveAndRefreshViews();
					},
				}).render();
			});

			// 农历节日颜色
			addSetting(setting => {
				setting.setName(i18n.t('settings.festivalColor.lunarFestival.name'))
					.setDesc(i18n.t('settings.festivalColor.lunarFestival.description'));
				setting.controlEl.empty();
				new MacaronColorPicker({
					container: setting.controlEl,
					currentColor: this.plugin.settings.lunarFestivalColor,
					colors: PRESET_FESTIVAL_COLORS,
					columns: 7,
					onColorChange: async (color) => {
						this.plugin.settings.lunarFestivalColor = color;
						await this.saveAndRefreshViews();
					},
				}).render();
			});

			// 节气颜色
			addSetting(setting => {
				setting.setName(i18n.t('settings.festivalColor.solarTerm.name'))
					.setDesc(i18n.t('settings.festivalColor.solarTerm.description'));
				setting.controlEl.empty();
				new MacaronColorPicker({
					container: setting.controlEl,
					currentColor: this.plugin.settings.solarTermColor,
					colors: PRESET_FESTIVAL_COLORS,
					columns: 7,
					onColorChange: async (color) => {
						this.plugin.settings.solarTermColor = color;
						await this.saveAndRefreshViews();
					},
				}).render();
			});
		});
	}
}
