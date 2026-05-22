import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig } from '../types';
import { TIMEZONE_OPTIONS } from '../../dateUtils/timezone';
import { i18n } from '../../i18n/i18n';

/**
 * 通用设置构建器
 */
export class GeneralSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		// ===== 通用 =====
		this.createSettingGroup(i18n.t('settings.general.groupTitle'), (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 默认视图
			addSetting(setting =>
				setting.setName(i18n.t('settings.general.defaultView.name'))
					.setDesc(i18n.t('settings.general.defaultView.description'))
					.addDropdown(drop => drop
						.addOptions({
							'day': i18n.t('settings.general.defaultView.options.day'),
							'week': i18n.t('settings.general.defaultView.options.week'),
							'month': i18n.t('settings.general.defaultView.options.month'),
							'year': i18n.t('settings.general.defaultView.options.year'),
							'task': i18n.t('settings.general.defaultView.options.task'),
							'gantt': i18n.t('settings.general.defaultView.options.gantt')
						})
						.setValue(this.plugin.settings.defaultView)
						.onChange(async (value) => {
							this.plugin.settings.defaultView = value as 'day' | 'week' | 'month' | 'year' | 'task' | 'gantt';
							await this.saveAndRefreshViews();
						}))
			);

			// 开发者模式
			addSetting(setting =>
				setting.setName(i18n.t('settings.general.debugMode.name'))
					.setDesc(i18n.t('settings.general.debugMode.description'))
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.enableDebugMode)
						.onChange(async (value) => {
							this.plugin.settings.enableDebugMode = value;
							await this.saveAndRefreshViews();
						}))
			);

			// 视图导航按钮显示文本
			addSetting(setting =>
				setting.setName(i18n.t('settings.general.showNavButtonText.name'))
					.setDesc(i18n.t('settings.general.showNavButtonText.description'))
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.showViewNavButtonText)
						.onChange(async (value) => {
							this.plugin.settings.showViewNavButtonText = value;
							await this.saveAndRefreshViews();
						}))
			);
		});

		// ===== 时区与格式 =====
		this.createSettingGroup(i18n.t('settings.general.timezoneFormat.groupTitle'), (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 时区设置
			addSetting(setting =>
				setting.setName(i18n.t('settings.general.timezoneFormat.timezone.name'))
					.setDesc(i18n.t('settings.general.timezoneFormat.timezone.description'))
					.addDropdown(drop => {
						for (const [key, label] of Object.entries(TIMEZONE_OPTIONS)) {
							drop.addOption(key, label);
						}
						const currentValue = this.plugin.settings.timezoneOffset;
						drop.setValue(currentValue === null ? 'null' : String(currentValue));
						drop.onChange(async (value) => {
							this.plugin.settings.timezoneOffset = value === 'null' ? null : parseInt(value, 10);
							await this.saveAndRefreshViews();
						});
					})
			);

			// 时间格式
			addSetting(setting =>
				setting.setName(i18n.t('settings.general.timezoneFormat.timeFormat.name'))
					.setDesc(i18n.t('settings.general.timezoneFormat.timeFormat.description'))
					.addDropdown(drop => drop
						.addOption('24h', i18n.t('settings.general.timezoneFormat.timeFormat.24h'))
						.addOption('12h', i18n.t('settings.general.timezoneFormat.timeFormat.12h'))
						.setValue(this.plugin.settings.timeFormat || '24h')
						.onChange(async (value) => {
							this.plugin.settings.timeFormat = value as '24h' | '12h';
							await this.saveAndRefreshViews();
						}))
			);
		});
	}
}
