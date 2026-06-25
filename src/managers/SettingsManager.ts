/**
 * 设置管理器
 *
 * 负责设置的加载、保存、迁移和 CSS 变量更新
 */

import type GanttCalendarPlugin from '../../main';
import { DEFAULT_SETTINGS } from '../settings/constants';
import type { GanttCalendarSettings } from '../settings/types';
import { ThemeColors } from '../tasks/taskStatus';
import { setTimezoneOffset } from '../dateUtils/timezone';

/**
 * 设置管理器
 */
export class SettingsManager {
	private plugin: GanttCalendarPlugin;

	constructor(plugin: GanttCalendarPlugin) {
		this.plugin = plugin;
	}

	/**
	 * 加载设置（包含迁移逻辑）
	 */
	async loadSettings(): Promise<GanttCalendarSettings> {
		const settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.plugin.loadData()
		) as GanttCalendarSettings;

		// 迁移旧的颜色格式到新的主题分离格式
		await this.migrateTaskStatusColors(settings);

		// 迁移 Templater 设置到新的模板文件路径
		await this.migrateTemplaterSettings(settings);

		// 迁移：将非核心默认状态降级为自定义状态
		await this.migratePresetStatuses(settings);

		// 更新 CSS 变量
		this.updateCSSVariables(settings);

		return settings;
	}

	/**
	 * 保存设置
	 */
	async saveSettings(settings: GanttCalendarSettings): Promise<void> {
		await this.plugin.saveData(settings);
		this.updateCSSVariables(settings);
		// 同步时区设置到时区模块
		setTimezoneOffset(settings.timezoneOffset);
	}

	/**
	 * 更新 CSS 变量
	 */
	updateCSSVariables(settings: GanttCalendarSettings): void {
		activeDocument.documentElement.style.setProperty('--festival-solar-color', settings.solarFestivalColor);
		activeDocument.documentElement.style.setProperty('--festival-lunar-color', settings.lunarFestivalColor);
		activeDocument.documentElement.style.setProperty('--festival-solar-term-color', settings.solarTermColor);
	}

	/**
	 * 迁移 Templater 设置到新的模板文件路径
	 */
	private async migrateTemplaterSettings(settings: GanttCalendarSettings): Promise<void> {
		const data = await this.plugin.loadData() as Record<string, unknown> || {};
		if ('templaterTemplatePath' in data && !('dailyNoteTemplatePath' in data)) {
			settings.dailyNoteTemplatePath = (data as Record<string, string>).templaterTemplatePath || '';
			await this.plugin.saveData(settings);
		}
	}

	/**
	 * 迁移非核心默认状态为自定义状态
	 * 将 important、canceled、in_progress、question、start 从 isDefault:true 改为 isDefault:false
	 */
	private async migratePresetStatuses(settings: GanttCalendarSettings): Promise<void> {
		const presetKeys = ['important', 'canceled', 'in_progress', 'question', 'start'];
		let needsSave = false;

		for (const status of settings.taskStatuses) {
			if (presetKeys.includes(status.key) && status.isDefault) {
				status.isDefault = false;
				needsSave = true;
			}
		}

		if (needsSave) {
			await this.plugin.saveData(settings);
		}
	}

	/**
	 * 迁移任务状态颜色格式
	 * 将旧的 backgroundColor/textColor 迁移到 lightColors/darkColors
	 * 确保所有状态都有完整的主题颜色配置
	 */
	private async migrateTaskStatusColors(settings: GanttCalendarSettings): Promise<void> {
		let needsSave = false;

		for (const status of settings.taskStatuses) {
			// 检查是否需要迁移（存在旧的已弃用属性）
			const hasOldColors = 'backgroundColor' in status || 'textColor' in status;
			const needsInitialization = !status.lightColors || !status.darkColors;

			if (hasOldColors && needsInitialization) {
				// 将旧颜色作为亮色主题的默认值
				if (!status.lightColors) {
					status.lightColors = {
						backgroundColor: '#FFFFFF',
						textColor: '#333333'
					};
				}

				// 为暗色主题生成默认值
				if (!status.darkColors) {
					status.darkColors = this.generateDarkThemeColors(
						status.lightColors.backgroundColor,
						status.lightColors.textColor
					);
				}

				// 清理已弃用的属性
				// @ts-ignore - 迁移代码，有意删除已弃用属性
				// eslint-disable-next-line @typescript-eslint/no-deprecated -- 迁移代码:清理已弃用的旧颜色字段
				delete status.backgroundColor;
				// @ts-ignore - 迁移代码，有意删除已弃用属性
				// eslint-disable-next-line @typescript-eslint/no-deprecated -- 迁移代码:清理已弃用的旧颜色字段
				delete status.textColor;

				needsSave = true;
			} else if (needsInitialization) {
				// 对于没有颜色配置的状态，初始化为默认值
				if (!status.lightColors) {
					status.lightColors = {
						backgroundColor: '#FFFFFF',
						textColor: '#333333'
					};
				}

				if (!status.darkColors) {
					status.darkColors = {
						backgroundColor: '#2d333b',
						textColor: '#adbac7'
					};
				}

				needsSave = true;
			} else if (hasOldColors) {
				// 即使已有新格式，也清理已弃用的属性
				// @ts-ignore - 迁移代码，有意删除已弃用属性
				// eslint-disable-next-line @typescript-eslint/no-deprecated -- 迁移代码:清理已弃用的旧颜色字段
				delete status.backgroundColor;
				// @ts-ignore - 迁移代码，有意删除已弃用属性
				// eslint-disable-next-line @typescript-eslint/no-deprecated -- 迁移代码:清理已弃用的旧颜色字段
				delete status.textColor;
				needsSave = true;
			}
		}

		if (needsSave) {
			await this.plugin.saveData(settings);
		}
	}

	/**
	 * 根据亮色主题颜色生成暗色主题颜色
	 */
	private generateDarkThemeColors(lightBg: string, lightText: string): ThemeColors {
		// 简单的颜色反转逻辑
		// 对于大多数情况，使用预设的暗色主题默认值
		return {
			backgroundColor: '#2d333b',
			textColor: '#adbac7'
		};
	}
}
