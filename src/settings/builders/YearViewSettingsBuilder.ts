import { Setting, SettingGroup } from 'obsidian';
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
		this.createSettingGroup('年视图', (group) => {
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
							await this.saveAndRefreshViews();
						}))
			);

			// 年视图农历字号
			addSetting(setting =>
				setting.setName('农历字号')
					.setDesc('调整年视图月卡片内农历文字大小（8-18px）')
					.addSlider(slider => slider
						.setLimits(8, 18, 1)
						.setValue(this.plugin.settings.yearLunarFontSize)
						.setDynamicTooltip()
						.onChange(async (value) => {
							this.plugin.settings.yearLunarFontSize = value;
							await this.saveAndRefreshViews();
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
							await this.saveAndRefreshViews();
						}))
			);

			// 热力图色卡选择（平铺单选色卡）
			if (this.plugin.settings.yearHeatmapEnabled) {
				addSetting(setting => {
					setting.nameEl.remove();
					setting.descEl.remove();
					setting.controlEl.remove();
					setting.infoEl.addClass('gc-settings-info-compact');

					const heatmapPicker = new HeatmapPalettePicker({
						container: setting.settingEl,
						currentPalette: this.plugin.settings.yearHeatmapPalette,
						onPaletteChange: async (paletteKey) => {
							this.plugin.settings.yearHeatmapPalette = paletteKey;
							await this.saveAndRefreshViews();
						}
					});
					heatmapPicker.render();
				});

				// 热力图3D效果选择
				addSetting(setting =>
					setting.setName('热力图3D效果')
						.setDesc('为热力图颜色格子添加玻璃水珠质感效果')
						.addDropdown(dropdown => dropdown
							.addOption('0', '关闭')
							.addOption('1', '轻微突起')
							.addOption('2', '明显突起')
							.setValue(String(this.plugin.settings.yearHeatmap3DEnabled ?? 0))
							.onChange(async (value) => {
								this.plugin.settings.yearHeatmap3DEnabled = parseInt(value) as 0 | 1 | 2;
								await this.saveAndRefreshViews();
							}))
				);
			}
		});
	}

}
