import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import { HeatmapPalettePicker } from '../components';
import type { BuilderConfig } from '../types';
import { i18n } from '../../i18n/i18n';

/**
 * 年视图设置构建器
 */
export class YearViewSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		this.createSettingGroup(i18n.t('settings.yearView.groupTitle'), (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 年视图每日任务数量显示
			addSetting(setting => {
				setting.setName(i18n.t('settings.yearView.showTaskCount.name'))
					.setDesc(i18n.t('settings.yearView.showTaskCount.description'))
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.yearShowTaskCount)
						.onChange((value) => {
							this.plugin.settings.yearShowTaskCount = value;
							void this.saveAndRefreshViews();
						}));
			});

			// 年视图农历字号
			addSetting(setting => {
				setting.setName(i18n.t('settings.yearView.lunarFontSize.name'))
					.setDesc(i18n.t('settings.yearView.lunarFontSize.description'))
					.addSlider(slider => slider
						.setLimits(8, 18, 1)
						.setValue(this.plugin.settings.yearLunarFontSize)
						.setDynamicTooltip()
						.onChange((value) => {
							this.plugin.settings.yearLunarFontSize = value;
							void this.saveAndRefreshViews();
						}));
			});

			// 年视图任务热力图开关
			addSetting(setting => {
				setting.setName(i18n.t('settings.yearView.heatmapEnabled.name'))
					.setDesc(i18n.t('settings.yearView.heatmapEnabled.description'))
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.yearHeatmapEnabled)
						.onChange((value) => {
							this.plugin.settings.yearHeatmapEnabled = value;
							void this.saveAndRefreshViews();
						}));
			});

			// 热力图色卡选择
			if (this.plugin.settings.yearHeatmapEnabled) {
				addSetting(setting => {
					setting.setName(i18n.t('settings.yearView.heatmapPalette.name'))
						.setDesc(i18n.t('settings.yearView.heatmapPalette.description'));
					setting.controlEl.empty();
					new HeatmapPalettePicker({
						container: setting.controlEl,
						currentPalette: this.plugin.settings.yearHeatmapPalette,
						onPaletteChange: (paletteKey) => {
							this.plugin.settings.yearHeatmapPalette = paletteKey;
							void this.saveAndRefreshViews();
						},
					}).render();
				});

				// 热力图3D效果选择
				addSetting(setting => {
					setting.setName(i18n.t('settings.yearView.heatmap3D.name'))
						.setDesc(i18n.t('settings.yearView.heatmap3D.description'))
						.addDropdown(dropdown => dropdown
							.addOption('0', i18n.t('settings.yearView.heatmap3D.options.off'))
							.addOption('1', i18n.t('settings.yearView.heatmap3D.options.slight'))
							.addOption('2', i18n.t('settings.yearView.heatmap3D.options.obvious'))
							.setValue(String(this.plugin.settings.yearHeatmap3DEnabled ?? 0))
							.onChange((value) => {
								this.plugin.settings.yearHeatmap3DEnabled = parseInt(value) as 0 | 1 | 2;
								void this.saveAndRefreshViews();
							}));
				});
			}
		});
	}

}
