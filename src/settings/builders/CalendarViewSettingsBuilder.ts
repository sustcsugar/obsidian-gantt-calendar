import { Setting } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig } from '../types';

/**
 * 日历视图设置构建器
 */
export class CalendarViewSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		// ===== 日历视图设置 =====
		this.containerEl.createEl('h1', { text: '日历视图设置' });

		// 日期筛选字段
		new Setting(this.containerEl)
			.setName('日期筛选字段')
			.setDesc('日历视图始终使用此字段筛选任务；任务视图可在工具栏灵活切换')
			.addDropdown(drop => drop
				.addOptions({
					'createdDate': '➕ 创建日期',
					'startDate': '🛫 开始日期',
					'scheduledDate': '⏳ 计划日期',
					'dueDate': '📅 截止日期',
					'completionDate': '✅ 完成日期',
					'cancelledDate': '❌ 取消日期',
				})
				.setValue(this.plugin.settings.dateFilterField)
				.onChange(async (value) => {
					this.plugin.settings.dateFilterField = value as 'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'completionDate' | 'cancelledDate';
					await this.saveAndRefresh();
				}));

		// 年视图农历字号
		new Setting(this.containerEl)
			.setName('年视图农历字号')
			.setDesc('调整年视图月卡片内农历文字大小（8-18px）')
			.addSlider(slider => slider
				.setLimits(8, 18, 1)
				.setValue(this.plugin.settings.yearLunarFontSize)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.yearLunarFontSize = value;
					await this.saveAndRefresh();
				}));

		// 一周开始于
		new Setting(this.containerEl)
			.setName('一周开始于:')
			.setDesc('选择一周的起始日')
			.addDropdown(drop => {
				drop.addOptions({ 'monday': '周一', 'sunday': '周日' });
				drop.setValue(this.plugin.settings.startOnMonday ? 'monday' : 'sunday');
				drop.onChange(async (value) => {
					this.plugin.settings.startOnMonday = (value === 'monday');
					await this.saveAndRefresh();
				});
			});
	}
}
