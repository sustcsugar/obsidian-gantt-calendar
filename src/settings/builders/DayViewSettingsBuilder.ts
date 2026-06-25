import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig } from '../types';
import { i18n } from '../../i18n/i18n';

/**
 * 日视图构建器
 */
export class DayViewSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		this.createSettingGroup(i18n.t('settings.dayView.groupTitle'), (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 显示 Daily Note 开关
			addSetting(setting => {
				setting.setName(i18n.t('settings.dayView.showDailyNote.name'))
					.setDesc(i18n.t('settings.dayView.showDailyNote.description'))
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.enableDailyNote)
						.onChange((value) => {
							void (async () => {
								this.plugin.settings.enableDailyNote = value;
								await this.saveAndRefreshViews();
							})();
						}));
			});

			// 日视图布局（仅在启用 Daily Note 时显示）
			if (this.plugin.settings.enableDailyNote) {
				addSetting(setting => {
					setting.setName(i18n.t('settings.dayView.layout.name'))
						.setDesc(i18n.t('settings.dayView.layout.description'))
						.addDropdown(drop => drop
							.addOptions({
								'horizontal': i18n.t('settings.dayView.layout.options.horizontal'),
								'vertical': i18n.t('settings.dayView.layout.options.vertical'),
							})
							.setValue(this.plugin.settings.dayViewLayout)
							.onChange((value) => {
								void (async () => {
									this.plugin.settings.dayViewLayout = value as 'horizontal' | 'vertical';
									await this.saveAndRefreshViews();
								})();
							}));
				});
			}
		});
	}
}
