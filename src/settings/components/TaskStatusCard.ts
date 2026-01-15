import type GanttCalendarPlugin from '../../../main';
import { TaskStatus } from '../../tasks/taskStatus';
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
 * 任务状态卡片组件
 * 紧凑的卡片式布局，一个状态一个小卡片
 */
export class TaskStatusCard {
	private config: TaskStatusCardConfig;
	private bgColorSwatch?: HTMLElement;
	private textColorSwatch?: HTMLElement;

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
		const iconDiv = header.createEl('div');
		iconDiv.style.display = 'flex';
		iconDiv.style.alignItems = 'center';
		iconDiv.style.justifyContent = 'center';
		iconDiv.style.width = '32px';
		iconDiv.style.height = '24px';
		iconDiv.style.border = '1px solid var(--background-modifier-border)';
		iconDiv.style.borderRadius = '4px';
		iconDiv.style.background = status.backgroundColor;
		iconDiv.style.color = status.textColor;
		iconDiv.style.fontSize = '10px';
		iconDiv.style.fontWeight = 'bold';
		iconDiv.textContent = `[${status.symbol}]`;

		// 状态名称（只显示名称和 key，删除描述）
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

		// 颜色设置区域（背景色和文字色平行排列）
		const colorSection = card.createDiv();
		colorSection.style.display = 'flex';
		colorSection.style.flexDirection = 'row';
		colorSection.style.gap = '16px';

		// ========== 背景色区域 ==========
		const bgSection = colorSection.createDiv();
		bgSection.style.display = 'flex';
		bgSection.style.flexDirection = 'column';
		bgSection.style.gap = '6px';
		bgSection.style.flex = '1';

		// 背景色标签行（标签 + 颜色方块 + 预设色卡在同一行）
		const bgLabelRow = bgSection.createDiv();
		bgLabelRow.style.display = 'flex';
		bgLabelRow.style.alignItems = 'center';
		bgLabelRow.style.gap = '6px';
		bgLabelRow.style.flexWrap = 'wrap';

		const bgLabel = bgLabelRow.createEl('span', {
			text: '背景色',
			cls: 'setting-item-description'
		});
		bgLabel.style.fontSize = '11px';
		bgLabel.style.fontWeight = '500';

		// 背景色小方块（可点击弹出颜色选择器）
		const bgHiddenInput = bgLabelRow.createEl('input', {
			type: 'color',
			cls: 'task-status-color-input'
		}) as HTMLInputElement;
		bgHiddenInput.value = status.backgroundColor;
		bgHiddenInput.style.position = 'absolute';
		bgHiddenInput.style.opacity = '0';
		bgHiddenInput.style.pointerEvents = 'none';

		this.bgColorSwatch = bgLabelRow.createEl('div');
		this.bgColorSwatch.style.width = '18px';
		this.bgColorSwatch.style.height = '18px';
		this.bgColorSwatch.style.borderRadius = '3px';
		this.bgColorSwatch.style.backgroundColor = status.backgroundColor;
		this.bgColorSwatch.style.border = '1px solid var(--background-modifier-border)';
		this.bgColorSwatch.style.cursor = 'pointer';
		this.bgColorSwatch.addEventListener('click', () => {
			bgHiddenInput.click();
		});
		bgHiddenInput.addEventListener('change', async () => {
			const statusIndex = plugin.settings.taskStatuses.findIndex((s: TaskStatus) => s.key === status.key);
			if (statusIndex !== -1) {
				plugin.settings.taskStatuses[statusIndex].backgroundColor = bgHiddenInput.value;
				iconDiv.style.background = bgHiddenInput.value;
				if (this.bgColorSwatch) {
					this.bgColorSwatch.style.backgroundColor = bgHiddenInput.value;
				}
				await plugin.saveSettings();
				plugin.refreshCalendarViews();
			}
		});

		// 马卡龙配色背景色（2行4列，共8个色卡）
		const bgMacaronDiv = bgLabelRow.createEl('div');
		const bgMacaronPicker = new MacaronColorPicker({
			container: bgMacaronDiv,
			currentColor: status.backgroundColor,
			limit: 8, // 限制为8个色卡
			rows: 2, // 2行排列
			onColorChange: async (color) => {
				const statusIndex = plugin.settings.taskStatuses.findIndex((s: TaskStatus) => s.key === status.key);
				if (statusIndex !== -1) {
					plugin.settings.taskStatuses[statusIndex].backgroundColor = color;
					iconDiv.style.background = color;
					if (this.bgColorSwatch) {
						this.bgColorSwatch.style.backgroundColor = color;
					}
					await plugin.saveSettings();
					plugin.refreshCalendarViews();
					const hexColor = rgbToHex(color) || color;
					bgHiddenInput.value = hexColor;
				}
			}
		});
		bgMacaronPicker.render();

		// ========== 文字色区域 ==========
		const textSection = colorSection.createDiv();
		textSection.style.display = 'flex';
		textSection.style.flexDirection = 'column';
		textSection.style.gap = '6px';
		textSection.style.flex = '1';

		// 文字色标签行（标签 + 颜色方块 + 预设色卡在同一行）
		const textLabelRow = textSection.createDiv();
		textLabelRow.style.display = 'flex';
		textLabelRow.style.alignItems = 'center';
		textLabelRow.style.gap = '6px';
		textLabelRow.style.flexWrap = 'wrap';

		const textLabel = textLabelRow.createEl('span', {
			text: '文字色',
			cls: 'setting-item-description'
		});
		textLabel.style.fontSize = '11px';
		textLabel.style.fontWeight = '500';

		// 文字色小方块（可点击弹出颜色选择器）
		const textHiddenInput = textLabelRow.createEl('input', {
			type: 'color',
			cls: 'task-status-color-input'
		}) as HTMLInputElement;
		textHiddenInput.value = status.textColor;
		textHiddenInput.style.position = 'absolute';
		textHiddenInput.style.opacity = '0';
		textHiddenInput.style.pointerEvents = 'none';

		this.textColorSwatch = textLabelRow.createEl('div');
		this.textColorSwatch.style.width = '18px';
		this.textColorSwatch.style.height = '18px';
		this.textColorSwatch.style.borderRadius = '3px';
		this.textColorSwatch.style.backgroundColor = status.textColor;
		this.textColorSwatch.style.border = '1px solid var(--background-modifier-border)';
		this.textColorSwatch.style.cursor = 'pointer';
		this.textColorSwatch.addEventListener('click', () => {
			textHiddenInput.click();
		});
		textHiddenInput.addEventListener('change', async () => {
			const statusIndex = plugin.settings.taskStatuses.findIndex((s: TaskStatus) => s.key === status.key);
			if (statusIndex !== -1) {
				plugin.settings.taskStatuses[statusIndex].textColor = textHiddenInput.value;
				iconDiv.style.color = textHiddenInput.value;
				if (this.textColorSwatch) {
					this.textColorSwatch.style.backgroundColor = textHiddenInput.value;
				}
				await plugin.saveSettings();
				plugin.refreshCalendarViews();
			}
		});

		// 马卡龙配色文字色（2行4列，共8个色卡）
		const textMacaronDiv = textLabelRow.createEl('div');
		const textMacaronPicker = new MacaronColorPicker({
			container: textMacaronDiv,
			currentColor: status.textColor,
			limit: 8, // 限制为8个色卡
			rows: 2, // 2行排列
			onColorChange: async (color) => {
				const statusIndex = plugin.settings.taskStatuses.findIndex((s: TaskStatus) => s.key === status.key);
				if (statusIndex !== -1) {
					plugin.settings.taskStatuses[statusIndex].textColor = color;
					iconDiv.style.color = color;
					if (this.textColorSwatch) {
						this.textColorSwatch.style.backgroundColor = color;
					}
					await plugin.saveSettings();
					plugin.refreshCalendarViews();
					const hexColor = rgbToHex(color) || color;
					textHiddenInput.value = hexColor;
				}
			}
		});
		textMacaronPicker.render();
	}
}
