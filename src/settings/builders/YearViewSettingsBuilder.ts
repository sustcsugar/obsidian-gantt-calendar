import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import { HeatmapPalettePicker, ColorPicker } from '../components';
import { PRESET_FESTIVAL_COLORS } from '../constants';
import type { BuilderConfig, ColorPickerConfig } from '../types';

/**
 * 年视图设置构建器
 */
export class YearViewSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		// 使用 SettingGroup 替代 h2 标题（兼容旧版本）
		this.createSettingGroup('年视图设置', (group) => {
			// 统一添加设置项的方法
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 年视图每日任务数量显示
			addSetting(setting =>
				setting.setName('显示每日任务数量')
					.setDesc('在年视图每个日期下方显示当天任务总数（已完成+未完成）')
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.yearShowTaskCount)
						.onChange(async (value) => {
							this.plugin.settings.yearShowTaskCount = value;
							await this.saveAndRefresh();
						}))
			);

			// 年视图任务热力图开关
			addSetting(setting =>
				setting.setName('启用任务热力图')
					.setDesc('根据当天任务数量深浅显示日期背景颜色')
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.yearHeatmapEnabled)
						.onChange(async (value) => {
							this.plugin.settings.yearHeatmapEnabled = value;
							await this.saveAndRefresh();
							// 切换显示色卡设置
							this.plugin.refreshCalendarViews();
						}))
			);

			// 热力图色卡选择（平铺单选色卡）
			if (this.plugin.settings.yearHeatmapEnabled) {
				addSetting(setting => {
					setting.nameEl.remove();
					setting.descEl.remove();
					setting.controlEl.remove();
					// 让 infoEl 不占据空间
					setting.infoEl.style.flex = '0';
					setting.infoEl.style.minWidth = '0';
					setting.infoEl.style.padding = '0';

					const heatmapPicker = new HeatmapPalettePicker({
						container: setting.settingEl,
						currentPalette: this.plugin.settings.yearHeatmapPalette,
						onPaletteChange: async (paletteKey) => {
							this.plugin.settings.yearHeatmapPalette = paletteKey;
							await this.saveAndRefresh();
						}
					});
					heatmapPicker.render();
				});
			}

			// ===== 节日颜色设置 =====
			addSetting(setting => {
				setting.nameEl.remove();
				setting.descEl.remove();
				setting.controlEl.remove();
				// 让 infoEl 不占据空间
				setting.infoEl.style.flex = '0';
				setting.infoEl.style.minWidth = '0';
				setting.infoEl.style.padding = '0';

				// 创建横向容器
				const festivalColorContainer = setting.settingEl.createDiv('festival-color-settings-container');

				// 阳历节日颜色
				const solarFestivalConfig: ColorPickerConfig = {
					container: festivalColorContainer,
					name: '阳历节日颜色',
					description: '自定义阳历节日显示颜色',
					currentColor: this.plugin.settings.solarFestivalColor,
					presetColors: PRESET_FESTIVAL_COLORS,
					onColorChange: async (color) => {
						this.plugin.settings.solarFestivalColor = color;
						await this.saveAndRefresh();
					}
				};
				const solarFestivalPicker = new ColorPicker(solarFestivalConfig);
				solarFestivalPicker.render();

				// 农历节日颜色
				const lunarFestivalConfig: ColorPickerConfig = {
					container: festivalColorContainer,
					name: '农历节日颜色',
					description: '自定义农历节日显示颜色',
					currentColor: this.plugin.settings.lunarFestivalColor,
					presetColors: PRESET_FESTIVAL_COLORS,
					onColorChange: async (color) => {
						this.plugin.settings.lunarFestivalColor = color;
						await this.saveAndRefresh();
					}
				};
				const lunarFestivalPicker = new ColorPicker(lunarFestivalConfig);
				lunarFestivalPicker.render();

				// 节气颜色
				const solarTermConfig: ColorPickerConfig = {
					container: festivalColorContainer,
					name: '节气颜色',
					description: '自定义节气显示颜色',
					currentColor: this.plugin.settings.solarTermColor,
					presetColors: PRESET_FESTIVAL_COLORS,
					onColorChange: async (color) => {
						this.plugin.settings.solarTermColor = color;
						await this.saveAndRefresh();
					}
				};
				const solarTermPicker = new ColorPicker(solarTermConfig);
				solarTermPicker.render();
			});
		});
	}

}
