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
		// ===== 节日颜色设置 =====
		this.containerEl.createEl('h2', { text: '节日颜色设置' });

		// 创建横向容器
		const festivalColorContainer = this.containerEl.createDiv('festival-color-settings-container');

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
	}
}
