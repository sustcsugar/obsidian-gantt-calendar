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
		const card = container.createDiv();
		card.addClass('task-status-card');
		card.style.display = 'flex';
		card.style.flexDirection = 'column';
		card.style.gap = '12px';
		card.style.padding = '16px';
		card.style.background = 'var(--background-secondary)';
		card.style.borderRadius = '8px';
		card.style.border = '1px solid var(--background-modifier-border)';
		card.style.minWidth = '200px';
		card.style.flex = '1';
		card.style.maxWidth = 'none';

		// 顶部：状态图标和名称
		const header = card.createDiv();
		header.style.display = 'flex';
		header.style.alignItems = 'center';
		header.style.gap = '10px';
		header.style.marginBottom = '4px';

		// 状态图标（复选框示例）
		this.iconDiv = header.createEl('div');
		this.iconDiv.style.display = 'flex';
		this.iconDiv.style.alignItems = 'center';
		this.iconDiv.style.justifyContent = 'center';
		this.iconDiv.style.width = '32px';
		this.iconDiv.style.height = '24px';
		this.iconDiv.style.border = '1px solid var(--background-modifier-border)';
		this.iconDiv.style.borderRadius = '4px';
		this.updateIconPreview();

		// 状态名称
		const nameDiv = header.createEl('div', {
			text: `${status.name} (${status.key})`,
			cls: 'task-status-name'
		});
		nameDiv.style.fontWeight = '500';
		nameDiv.style.fontSize = '14px';

		// 删除按钮（仅自定义状态）
		if (isCustom && onDelete) {
			const deleteButton = header.createEl('button');
			deleteButton.innerHTML = '&times;';
			deleteButton.style.marginLeft = 'auto';
			deleteButton.style.width = '24px';
			deleteButton.style.height = '24px';
			deleteButton.style.padding = '0';
			deleteButton.style.fontSize = '18px';
			deleteButton.style.lineHeight = '1';
			deleteButton.style.borderRadius = '4px';
			deleteButton.style.border = 'none';
			deleteButton.style.background = 'transparent';
			deleteButton.style.color = 'var(--text-muted)';
			deleteButton.style.cursor = 'pointer';
			deleteButton.style.display = 'flex';
			deleteButton.style.alignItems = 'center';
			deleteButton.style.justifyContent = 'center';
			deleteButton.addEventListener('click', onDelete);
			deleteButton.addEventListener('mouseenter', () => {
				deleteButton.style.background = 'var(--interactive-accent-hover)';
				deleteButton.style.color = 'var(--text-on-accent)';
			});
			deleteButton.addEventListener('mouseleave', () => {
				deleteButton.style.background = 'transparent';
				deleteButton.style.color = 'var(--text-muted)';
			});
		}

		// ========== 主题分离的颜色设置区域 ==========
		const themeSection = card.createDiv();
		themeSection.style.display = 'flex';
		themeSection.style.flexDirection = 'column';
		themeSection.style.gap = '12px';

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
		const divider = themeSection.createEl('hr');
		divider.style.border = 'none';
		divider.style.borderTop = '1px solid var(--background-modifier-border)';
		divider.style.margin = '0';

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
		this.iconDiv.style.fontSize = '10px';
		this.iconDiv.style.fontWeight = 'bold';
		this.iconDiv.textContent = `[${status.symbol}]`;
	}

	/**
	 * 获取指定主题的颜色配置
	 */
	private getThemeColors(status: TaskStatus, themeMode: 'light' | 'dark'): ThemeColors | null {
		// 处理新旧数据格式兼容
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

		// 主题区域容器
		const themeDiv = container.createDiv();
		themeDiv.style.display = 'flex';
		themeDiv.style.flexDirection = 'column';
		themeDiv.style.gap = '8px';

		// 主题标题（图标 + 标签）
		const themeHeader = themeDiv.createDiv();
		themeHeader.style.display = 'flex';
		themeHeader.style.alignItems = 'center';
		themeHeader.style.gap = '6px';
		themeHeader.style.marginBottom = '2px';

		themeHeader.createEl('span', { text: icon, cls: 'theme-icon' });
		themeHeader.createEl('span', {
			text: label,
			cls: 'theme-label setting-item-description'
		}).style.fontWeight = '500';

		// 颜色设置行（背景色 + 文字色平行排列）
		const colorRow = themeDiv.createDiv();
		colorRow.style.display = 'flex';
		colorRow.style.flexDirection = 'row';
		colorRow.style.gap = '16px';

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

		const colorSection = container.createDiv();
		colorSection.style.display = 'flex';
		colorSection.style.flexDirection = 'column';
		colorSection.style.gap = '6px';
		colorSection.style.flex = '1';

		// 标签行
		const labelRow = colorSection.createDiv();
		labelRow.style.display = 'flex';
		labelRow.style.alignItems = 'center';
		labelRow.style.gap = '6px';
		labelRow.style.flexWrap = 'wrap';

		const labelEl = labelRow.createEl('span', {
			text: label,
			cls: 'setting-item-description'
		});
		labelEl.style.fontSize = '11px';
		labelEl.style.fontWeight = '500';

		// 隐藏的颜色输入
		const hiddenInput = labelRow.createEl('input', {
			type: 'color',
			cls: 'task-status-color-input'
		}) as HTMLInputElement;
		hiddenInput.value = currentColor;
		hiddenInput.style.position = 'absolute';
		hiddenInput.style.opacity = '0';
		hiddenInput.style.pointerEvents = 'none';

		// 颜色方块
		const swatch = labelRow.createEl('div');
		swatch.style.width = '18px';
		swatch.style.height = '18px';
		swatch.style.borderRadius = '3px';
		swatch.style.backgroundColor = currentColor;
		swatch.style.border = '1px solid var(--background-modifier-border)';
		swatch.style.cursor = 'pointer';
		swatch.addEventListener('click', () => hiddenInput.click());

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

			// 确保新格式颜色对象存在
			this.ensureThemeColors(targetStatus);

			// 更新颜色
			const colorKey = themeMode === 'dark' ? 'darkColors' : 'lightColors';
			(targetStatus[colorKey] as ThemeColors)[colorType] = color;

			// 更新色卡显示
			if (swatch) {
				swatch.style.backgroundColor = color;
			}

			// 更新图标预览
			this.updateIconPreview();

			await plugin.saveSettings();
			plugin.refreshCalendarViews();
		}
	}

	/**
	 * 确保状态配置有主题颜色对象
	 */
	private ensureThemeColors(status: TaskStatus): void {
		// 如果使用旧格式，迁移到新格式
		if (status.backgroundColor && status.textColor) {
			if (!status.lightColors) {
				status.lightColors = {
					backgroundColor: status.backgroundColor,
					textColor: status.textColor
				};
			}
			if (!status.darkColors) {
				// 生成暗色主题默认值
				status.darkColors = this.generateDarkColors(status.lightColors);
			}
		}

		// 确保至少有默认值
		if (!status.lightColors) {
			status.lightColors = { backgroundColor: '#FFFFFF', textColor: '#333333' };
		}
		if (!status.darkColors) {
			status.darkColors = { backgroundColor: '#2d333b', textColor: '#adbac7' };
		}
	}

	/**
	 * 根据亮色主题颜色生成暗色主题颜色
	 */
	private generateDarkColors(lightColors: ThemeColors): ThemeColors {
		// 简单的颜色转换：使用预设的暗色主题配色
		// 这里可以根据亮色颜色智能生成暗色版本
		return {
			backgroundColor: '#2d333b',
			textColor: '#adbac7'
		};
	}
}
