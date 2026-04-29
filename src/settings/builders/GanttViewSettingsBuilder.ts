import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig, DateFieldType } from '../types';

/**
 * 甘特图构建器
 */
export class GanttViewSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		this.createSettingGroup('甘特图', (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 开始时间字段
			addSetting(setting =>
				setting.setName('甘特条开始时间字段')
					.setDesc('选择用于确定甘特条开始位置的任务时间字段')
					.addDropdown(drop => drop
						.addOptions({
							'createdDate': '创建日期',
							'startDate': '开始日期',
							'scheduledDate': '计划日期',
							'dueDate': '截止日期',
							'completionDate': '完成日期',
							'cancelledDate': '取消日期',
						})
						.setValue(this.plugin.settings.ganttStartField)
						.onChange(async (value) => {
							this.plugin.settings.ganttStartField = value as DateFieldType;
							await this.saveAndRefreshViews();
						}))
			);

			// 结束时间字段
			addSetting(setting =>
				setting.setName('甘特条结束时间字段')
					.setDesc('选择用于确定甘特条结束位置的任务时间字段')
					.addDropdown(drop => drop
						.addOptions({
							'createdDate': '创建日期',
							'startDate': '开始日期',
							'scheduledDate': '计划日期',
							'dueDate': '截止日期',
							'completionDate': '完成日期',
							'cancelledDate': '取消日期',
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
