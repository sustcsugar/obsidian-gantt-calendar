import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig } from '../types';
import { i18n } from '../../i18n/i18n';

/**
 * 日历视图构建器
 */
export class CalendarViewSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		// 使用 SettingGroup 替代 h1 标题（兼容旧版本）
		this.createSettingGroup(i18n.t('settings.calendarView.groupTitle'), (group) => {
			// 统一添加设置项的方法
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 日期筛选字段
			addSetting(setting =>
				setting.setName(i18n.t('settings.calendarView.dateFilterField.name'))
					.setDesc(i18n.t('settings.calendarView.dateFilterField.description'))
					.addDropdown(drop => drop
						.addOptions({
							'createdDate': i18n.t('common.dateFields.createdDate'),
							'startDate': i18n.t('common.dateFields.startDate'),
							'scheduledDate': i18n.t('common.dateFields.scheduledDate'),
							'dueDate': i18n.t('common.dateFields.dueDate'),
							'completionDate': i18n.t('common.dateFields.completionDate'),
							'cancelledDate': i18n.t('common.dateFields.cancelledDate'),
						})
						.setValue(this.plugin.settings.dateFilterField)
						.onChange(async (value) => {
							this.plugin.settings.dateFilterField = value as 'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'completionDate' | 'cancelledDate';
							await this.saveAndRefreshViews();
						}))
			);

			// 一周开始日
			addSetting(setting => {
				setting.setName(i18n.t('settings.calendarView.weekStart.name'))
					.setDesc(i18n.t('settings.calendarView.weekStart.description'))
					.addDropdown(drop => {
						drop.addOptions({ 'monday': i18n.t('settings.calendarView.weekStart.options.monday'), 'sunday': i18n.t('settings.calendarView.weekStart.options.sunday') });
						drop.setValue(this.plugin.settings.startOnMonday ? 'monday' : 'sunday');
						drop.onChange(async (value) => {
							this.plugin.settings.startOnMonday = (value === 'monday');
							await this.saveAndRefreshViews();
						});
					});
			});
		});

		// 农历与节日显示控制
		this.createSettingGroup(i18n.t('settings.calendarView.lunarFestival.groupTitle'), (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 显示农历日期
			addSetting(setting =>
				setting.setName(i18n.t('settings.calendarView.lunarFestival.showLunar.name'))
					.setDesc(i18n.t('settings.calendarView.lunarFestival.showLunar.description'))
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.showLunar)
						.onChange(async (value) => {
							this.plugin.settings.showLunar = value;
							await this.saveAndRefreshViews();
						}))
			);

			// 显示节日与节气
			addSetting(setting =>
				setting.setName(i18n.t('settings.calendarView.lunarFestival.showFestivals.name'))
					.setDesc(i18n.t('settings.calendarView.lunarFestival.showFestivals.description'))
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.showFestivals)
						.onChange(async (value) => {
							this.plugin.settings.showFestivals = value;
							await this.saveAndRefreshViews();
						}))
			);
		});
	}
}
