import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import { ColorPicker } from '../components';
import { PRESET_FESTIVAL_COLORS } from '../constants';
import type { BuilderConfig, ColorPickerConfig } from '../types';

/**
 * 节日颜色设置构建器
 */
export class FestivalColorBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		this.createSettingGroup('节日颜色', (group) => {
			const container = group instanceof HTMLElement ? group : this.containerEl;

			const festivalColorContainer = container.createDiv('festival-color-settings-container');

			// 阳历节日颜色
			const solarFestivalConfig: ColorPickerConfig = {
				container: festivalColorContainer,
				name: '阳历节日颜色',
				description: '自定义阳历节日显示颜色',
				currentColor: this.plugin.settings.solarFestivalColor,
				presetColors: PRESET_FESTIVAL_COLORS,
				onColorChange: async (color) => {
					this.plugin.settings.solarFestivalColor = color;
					await this.saveAndRefreshViews();
				}
			};
			new ColorPicker(solarFestivalConfig).render();

			// 农历节日颜色
			const lunarFestivalConfig: ColorPickerConfig = {
				container: festivalColorContainer,
				name: '农历节日颜色',
				description: '自定义农历节日显示颜色',
				currentColor: this.plugin.settings.lunarFestivalColor,
				presetColors: PRESET_FESTIVAL_COLORS,
				onColorChange: async (color) => {
					this.plugin.settings.lunarFestivalColor = color;
					await this.saveAndRefreshViews();
				}
			};
			new ColorPicker(lunarFestivalConfig).render();

			// 节气颜色
			const solarTermConfig: ColorPickerConfig = {
				container: festivalColorContainer,
				name: '节气颜色',
				description: '自定义节气显示颜色',
				currentColor: this.plugin.settings.solarTermColor,
				presetColors: PRESET_FESTIVAL_COLORS,
				onColorChange: async (color) => {
					this.plugin.settings.solarTermColor = color;
					await this.saveAndRefreshViews();
				}
			};
			new ColorPicker(solarTermConfig).render();
		});
	}
}
