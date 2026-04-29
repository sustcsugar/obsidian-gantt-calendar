import type GanttCalendarPlugin from '../../../main';
import { TaskStatus, ThemeColors, getCurrentThemeMode } from '../../tasks/taskStatus';
import { rgbToHex } from '../utils/color';
import { MacaronColorPicker } from './MacaronColorPicker';

/**
 * 任务状态卡片配置接口
 */
export interface TaskStatusCardConfig {
	container: HTMLElement;
	plugin: GanttCalendarPlugin;
	status: TaskStatus;
	onDelete?: () => Promise<void> | void;
	onColorChange?: () => Promise<void> | void;
}

/**
 * 主题颜色设置配置
 */
interface ThemeSectionConfig {
	themeMode: 'light' | 'dark';
	icon: string;
	label: string;
}

/**
 * 任务状态卡片组件
 * 支持亮色/暗色主题分离的颜色设置
 */
export class TaskStatusCard {
	private config: TaskStatusCardConfig;
	private iconDiv?: HTMLElement;

	constructor(config: TaskStatusCardConfig) {
		this.config = config;
	}

	/**
	 * 渲染状态卡片
	 */
	render(): void {
		const { container, plugin, status, onDelete } = this.config;
		const isCustom = !status.isDefault;

		// 卡片容器
		const card = container.createDiv('task-status-card');

		// 顶部：状态图标和名称
		const header = card.createDiv('gc-tsc-header');

		// 状态图标（复选框示例）
		this.iconDiv = header.createEl('div', 'gc-tsc-icon');
		this.updateIconPreview();

		// 状态名称
		const nameDiv = header.createEl('div', {
			text: `${status.name} (${status.key})`,
			cls: 'task-status-name gc-tsc-name'
		});

		// 删除按钮（仅自定义状态）
		if (isCustom && onDelete) {
			const deleteButton = header.createEl('button', 'gc-tsc-delete');
			deleteButton.setText('×');
			deleteButton.addEventListener('click', onDelete);
		}

		// ========== 主题分离的颜色设置区域 ==========
		const themeSection = card.createDiv('gc-tsc-theme');

		// 亮色主题区域
		this.renderThemeSection({
			container: themeSection,
			plugin: plugin,
			status: status,
			themeMode: 'light',
			icon: '☀️',
			label: '亮色主题'
		});

		// 分隔线
		const divider = themeSection.createEl('hr', 'gc-tsc-divider');

		// 暗色主题区域
		this.renderThemeSection({
			container: themeSection,
			plugin: plugin,
			status: status,
			themeMode: 'dark',
			icon: '🌙',
			label: '暗色主题'
		});
	}

	/**
	 * 更新图标预览颜色
	 */
	private updateIconPreview(): void {
		if (!this.iconDiv) return;

		const { status } = this.config;
		const themeMode = getCurrentThemeMode();
		const colors = this.getThemeColors(status, themeMode);
		if (colors) {
			this.iconDiv.style.background = colors.backgroundColor;
			this.iconDiv.style.color = colors.textColor;
		}
		this.iconDiv.textContent = `[${status.symbol}]`;
	}

	/**
	 * 获取指定主题的颜色配置
	 */
	private getThemeColors(status: TaskStatus, themeMode: 'light' | 'dark'): ThemeColors | null {
		this.ensureThemeColors(status);

		if (status.lightColors && status.darkColors) {
			return themeMode === 'dark' ? status.darkColors : status.lightColors;
		} else if (status.backgroundColor && status.textColor) {
			return { backgroundColor: status.backgroundColor, textColor: status.textColor };
		}
		return null;
	}

	/**
	 * 渲染单个主题的颜色设置区域
	 */
	private renderThemeSection(options: {
		container: HTMLElement;
		plugin: GanttCalendarPlugin;
		status: TaskStatus;
		themeMode: 'light' | 'dark';
		icon: string;
		label: string;
	}): void {
		const { container, plugin, status, themeMode, icon, label } = options;

		const themeDiv = container.createDiv('gc-tsc-theme-section');

		// 主题标题（图标 + 标签）
		const themeHeader = themeDiv.createDiv('gc-tsc-theme-header');
		themeHeader.createEl('span', { text: icon, cls: 'theme-icon' });
		themeHeader.createEl('span', {
			text: label,
			cls: 'theme-label setting-item-description gc-tsc-theme-label'
		});

		// 颜色设置行（背景色 + 文字色平行排列）
		const colorRow = themeDiv.createDiv('gc-tsc-color-row');

		// 获取当前主题的颜色
		const colors = this.getThemeColors(status, themeMode);

		// 背景色区域
		this.renderColorPicker({
			container: colorRow,
			plugin: plugin,
			status: status,
			themeMode: themeMode,
			colorType: 'backgroundColor',
			label: '背景色',
			currentColor: colors?.backgroundColor || (themeMode === 'dark' ? '#2d333b' : '#FFFFFF')
		});

		// 文字色区域
		this.renderColorPicker({
			container: colorRow,
			plugin: plugin,
			status: status,
			themeMode: themeMode,
			colorType: 'textColor',
			label: '文字色',
			currentColor: colors?.textColor || (themeMode === 'dark' ? '#adbac7' : '#333333')
		});
	}

	/**
	 * 渲染单个颜色选择器
	 */
	private renderColorPicker(options: {
		container: HTMLElement;
		plugin: GanttCalendarPlugin;
		status: TaskStatus;
		themeMode: 'light' | 'dark';
		colorType: 'backgroundColor' | 'textColor';
		label: string;
		currentColor: string;
	}): void {
		const { container, plugin, status, themeMode, colorType, label, currentColor } = options;

		const colorSection = container.createDiv('gc-tsc-color-section');

		// 标签行
		const labelRow = colorSection.createDiv('gc-tsc-label-row');

		const labelEl = labelRow.createEl('span', {
			text: label,
			cls: 'setting-item-description gc-tsc-label-text'
		});

		// 创建一个包装容器来放置颜色输入和方块
		const swatchWrapper = labelRow.createEl('div', 'gc-tsc-swatch-wrapper');

		// 隐藏的颜色输入
		const hiddenInput = swatchWrapper.createEl('input', {
			type: 'color',
			cls: 'task-status-color-input gc-tsc-hidden-input'
		}) as HTMLInputElement;
		hiddenInput.value = currentColor;

		// 颜色方块（视觉显示）
		const swatch = swatchWrapper.createEl('div', 'gc-tsc-swatch');
		swatch.style.backgroundColor = currentColor;

		// 颜色变化处理
		hiddenInput.addEventListener('change', async () => {
			await this.updateStatusColor(
				plugin,
				status,
				themeMode,
				colorType,
				hiddenInput.value,
				swatch
			);
		});

		// 马卡龙色卡
		const macaronDiv = labelRow.createEl('div');
		const macaronPicker = new MacaronColorPicker({
			container: macaronDiv,
			currentColor: currentColor,
			limit: 8,
			rows: 2,
			onColorChange: async (color) => {
				await this.updateStatusColor(
					plugin,
					status,
					themeMode,
					colorType,
					color,
					swatch
				);
				hiddenInput.value = rgbToHex(color) || color;
			}
		});
		macaronPicker.render();
	}

	/**
	 * 更新状态颜色
	 */
	private async updateStatusColor(
		plugin: GanttCalendarPlugin,
		status: TaskStatus,
		themeMode: 'light' | 'dark',
		colorType: 'backgroundColor' | 'textColor',
		color: string,
		swatch?: HTMLElement
	): Promise<void> {
		const statusIndex = plugin.settings.taskStatuses.findIndex(
			(s: TaskStatus) => s.key === status.key
		);

		if (statusIndex !== -1) {
			const targetStatus = plugin.settings.taskStatuses[statusIndex];

			this.ensureThemeColors(targetStatus);

			const colorKey = themeMode === 'dark' ? 'darkColors' : 'lightColors';
			(targetStatus[colorKey] as ThemeColors)[colorType] = color;

			if (swatch) {
				swatch.style.backgroundColor = color;
			}

			this.updateIconPreview();

			if (this.config.onColorChange) {
				await this.config.onColorChange();
			} else {
				await plugin.saveSettings();
				plugin.refreshCalendarViews();
			}
		}
	}

	/**
	 * 确保状态配置有主题颜色对象
	 */
	private ensureThemeColors(status: TaskStatus): void {
		if (status.lightColors && status.darkColors) {
			return;
		}

		if (status.backgroundColor && status.textColor) {
			if (!status.lightColors) {
				status.lightColors = {
					backgroundColor: status.backgroundColor,
					textColor: status.textColor
				};
			}
			if (!status.darkColors) {
				status.darkColors = this.generateDarkColors(status.lightColors);
			}
			return;
		}

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
	}

	/**
	 * 根据亮色主题颜色生成暗色主题颜色
	 */
	private generateDarkColors(lightColors: ThemeColors): ThemeColors {
		return {
			backgroundColor: '#2d333b',
			textColor: '#adbac7'
		};
	}
}
