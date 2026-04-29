import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig } from '../types';

/**
 * 日历视图构建器
 */
export class CalendarViewSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		// 使用 SettingGroup 替代 h1 标题（兼容旧版本）
		this.createSettingGroup('日历视图', (group) => {
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
				setting.setName('日期筛选字段')
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
							await this.saveAndRefreshViews();
						}))
			);

			// 一周开始于
			addSetting(setting => {
				setting.setName('一周开始于:')
					.setDesc('选择一周的起始日')
					.addDropdown(drop => {
						drop.addOptions({ 'monday': '周一', 'sunday': '周日' });
						drop.setValue(this.plugin.settings.startOnMonday ? 'monday' : 'sunday');
						drop.onChange(async (value) => {
							this.plugin.settings.startOnMonday = (value === 'monday');
							await this.saveAndRefreshViews();
						});
					});
			});
		});

		// 农历与节日显示控制
		this.createSettingGroup('农历与节日', (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 显示农历日期
			addSetting(setting =>
				setting.setName('显示农历')
					.setDesc('在年视图、月视图、周视图中显示农历日期文本')
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.showLunar)
						.onChange(async (value) => {
							this.plugin.settings.showLunar = value;
							await this.saveAndRefreshViews();
						}))
			);

			// 显示节日与节气
			addSetting(setting =>
				setting.setName('显示节日与节气')
					.setDesc('在农历文本上显示节日、节气的高亮颜色标记')
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.showFestivals)
						.onChange(async (value) => {
							this.plugin.settings.showFestivals = value;
							await this.saveAndRefreshViews();
						}))
			);

			// 年视图农历字号
			addSetting(setting =>
				setting.setName('年视图农历字号')
					.setDesc('设置年视图中农历文字的大小（8-18px）')
					.addSlider(slider => slider
						.setLimits(8, 18, 1)
						.setValue(this.plugin.settings.yearLunarFontSize)
						.setDynamicTooltip()
						.onChange(async (value) => {
							this.plugin.settings.yearLunarFontSize = value;
							await this.saveAndRefreshViews();
						}))
			);

			// 月视图农历字号
			addSetting(setting =>
				setting.setName('月视图农历字号')
					.setDesc('设置月视图中农历文字的大小（8-18px）')
					.addSlider(slider => slider
						.setLimits(8, 18, 1)
						.setValue(this.plugin.settings.monthLunarFontSize)
						.setDynamicTooltip()
						.onChange(async (value) => {
							this.plugin.settings.monthLunarFontSize = value;
							await this.saveAndRefreshViews();
						}))
			);
		});
	}
}
