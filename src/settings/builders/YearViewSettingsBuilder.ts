import { Setting } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import { HeatmapPalettePicker } from '../components';
import type { BuilderConfig } from '../types';

/**
 * 年视图设置构建器
 */
export class YearViewSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		// ===== 年视图设置 =====
		this.containerEl.createEl('h2', { text: '年视图设置' });

		// 年视图每日任务数量显示
		new Setting(this.containerEl)
			.setName('显示每日任务数量')
			.setDesc('在年视图每个日期下方显示当天任务总数（已完成+未完成）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.yearShowTaskCount)
				.onChange(async (value) => {
					this.plugin.settings.yearShowTaskCount = value;
					await this.saveAndRefresh();
				}));

		// 年视图任务热力图开关
		new Setting(this.containerEl)
			.setName('启用任务热力图')
			.setDesc('根据当天任务数量深浅显示日期背景颜色')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.yearHeatmapEnabled)
				.onChange(async (value) => {
					this.plugin.settings.yearHeatmapEnabled = value;
					await this.saveAndRefresh();
					// 切换显示色卡设置
					// 注意：这里需要调用 SettingTab 的 display() 方法来重新渲染
					this.plugin.refreshCalendarViews();
				}));

		// 热力图色卡选择（平铺单选色卡）
		if (this.plugin.settings.yearHeatmapEnabled) {
			const heatmapPicker = new HeatmapPalettePicker({
				container: this.containerEl,
				currentPalette: this.plugin.settings.yearHeatmapPalette,
				onPaletteChange: async (paletteKey) => {
					this.plugin.settings.yearHeatmapPalette = paletteKey;
					await this.saveAndRefresh();
				}
			});
			heatmapPicker.render();
		}
	}
}
