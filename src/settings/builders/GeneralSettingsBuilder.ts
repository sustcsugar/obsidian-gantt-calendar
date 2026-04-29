import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig } from '../types';
import { TIMEZONE_OPTIONS } from '../../dateUtils/timezone';

/**
 * 通用设置构建器
 */
export class GeneralSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		// ===== 通用 =====
		this.createSettingGroup('通用', (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 默认视图
			addSetting(setting =>
				setting.setName('默认视图')
					.setDesc('打开插件时默认显示的视图')
					.addDropdown(drop => drop
						.addOptions({
							'day': '日视图',
							'week': '周视图',
							'month': '月视图',
							'year': '年视图',
							'task': '任务视图',
							'gantt': '甘特图'
						})
						.setValue(this.plugin.settings.defaultView)
						.onChange(async (value) => {
							this.plugin.settings.defaultView = value as 'day' | 'week' | 'month' | 'year' | 'task' | 'gantt';
							await this.saveAndRefreshViews();
						}))
			);

			// 开发者模式
			addSetting(setting =>
				setting.setName('开发者模式')
					.setDesc('启用后将输出详细的调试日志，关闭后仅显示统计信息和错误')
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.enableDebugMode)
						.onChange(async (value) => {
							this.plugin.settings.enableDebugMode = value;
							await this.saveAndRefreshViews();
						}))
			);

			// 视图导航按钮显示文本
			addSetting(setting =>
				setting.setName('视图导航按钮显示文本')
					.setDesc('工具栏左侧的视图导航按钮是否显示文字标签。关闭后仅显示图标')
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.showViewNavButtonText)
						.onChange(async (value) => {
							this.plugin.settings.showViewNavButtonText = value;
							await this.saveAndRefreshViews();
						}))
			);
		});

		// ===== 时区与格式 =====
		this.createSettingGroup('时区与格式', (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 时区设置
			addSetting(setting =>
				setting.setName('时区')
					.setDesc('选择日历视图使用的时区。影响"今天"的判定和日历高亮')
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
				setting.setName('时间格式')
					.setDesc('任务时间的显示格式，影响弹窗和视图中时间的展示方式')
					.addDropdown(drop => drop
						.addOption('24h', '24 小时制 (14:30)')
						.addOption('12h', '12 小时制 (2:30 PM)')
						.setValue(this.plugin.settings.timeFormat || '24h')
						.onChange(async (value) => {
							this.plugin.settings.timeFormat = value as '24h' | '12h';
							await this.saveAndRefreshViews();
						}))
			);
		});
	}
}
