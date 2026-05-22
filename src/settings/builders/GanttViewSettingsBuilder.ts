import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig, DateFieldType } from '../types';
import { i18n } from '../../i18n/i18n';

/**
 * 甘特图构建器
 */
export class GanttViewSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		this.createSettingGroup(i18n.t('settings.ganttView.groupTitle'), (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 起始字段
			addSetting(setting =>
				setting.setName(i18n.t('settings.ganttView.startField.name'))
					.setDesc(i18n.t('settings.ganttView.startField.description'))
					.addDropdown(drop => drop
						.addOptions({
						'createdDate': i18n.t('settings.ganttView.dateFieldOptions.createdDate'),
						'startDate': i18n.t('settings.ganttView.dateFieldOptions.startDate'),
						'scheduledDate': i18n.t('settings.ganttView.dateFieldOptions.scheduledDate'),
						'dueDate': i18n.t('settings.ganttView.dateFieldOptions.dueDate'),
						'completionDate': i18n.t('settings.ganttView.dateFieldOptions.completionDate'),
						'cancelledDate': i18n.t('settings.ganttView.dateFieldOptions.cancelledDate'),
						})
						.setValue(this.plugin.settings.ganttStartField)
						.onChange(async (value) => {
							this.plugin.settings.ganttStartField = value as DateFieldType;
							await this.saveAndRefreshViews();
						}))
			);

			// 结束字段
			addSetting(setting =>
				setting.setName(i18n.t('settings.ganttView.endField.name'))
					.setDesc(i18n.t('settings.ganttView.endField.description'))
					.addDropdown(drop => drop
						.addOptions({
						'createdDate': i18n.t('settings.ganttView.dateFieldOptions.createdDate'),
						'startDate': i18n.t('settings.ganttView.dateFieldOptions.startDate'),
						'scheduledDate': i18n.t('settings.ganttView.dateFieldOptions.scheduledDate'),
						'dueDate': i18n.t('settings.ganttView.dateFieldOptions.dueDate'),
						'completionDate': i18n.t('settings.ganttView.dateFieldOptions.completionDate'),
						'cancelledDate': i18n.t('settings.ganttView.dateFieldOptions.cancelledDate'),
						})
						.setValue(this.plugin.settings.ganttEndField)
						.onChange(async (value) => {
							this.plugin.settings.ganttEndField = value as DateFieldType;
							await this.saveAndRefreshViews();
						}))
			);
		});
	}
}
