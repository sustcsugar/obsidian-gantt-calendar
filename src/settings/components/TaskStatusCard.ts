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
 * 显示单个任务状态的完整配置界面
 */
export class TaskStatusCard {
	private config: TaskStatusCardConfig;

	constructor(config: TaskStatusCardConfig) {
		this.config = config;
	}

	/**
	 * 渲染状态卡片
	 */
	render(): void {
		const { container, plugin, status, onDelete } = this.config;
		const isCustom = !status.isDefault;

		const statusDiv = container.createDiv();
		statusDiv.addClass('task-status-setting-item');
		statusDiv.style.display = 'flex';
		statusDiv.style.flexWrap = 'wrap';
		statusDiv.style.alignItems = 'center';
		statusDiv.style.gap = '12px';
		statusDiv.style.padding = '12px';
		statusDiv.style.marginBottom = '8px';
		statusDiv.style.background = 'var(--background-secondary)';
		statusDiv.style.borderRadius = '6px';

		// 状态图标（复选框示例）
		const iconDiv = statusDiv.createEl('div');
		iconDiv.style.display = 'flex';
		iconDiv.style.alignItems = 'center';
		iconDiv.style.justifyContent = 'center';
		iconDiv.style.width = '40px';
		iconDiv.style.height = '28px';
		iconDiv.style.border = '2px solid var(--background-modifier-border)';
		iconDiv.style.borderRadius = '4px';
		iconDiv.style.background = status.backgroundColor;
		iconDiv.style.color = status.textColor;
		iconDiv.style.fontSize = '10px';
		iconDiv.style.fontWeight = 'bold';
		iconDiv.textContent = `[${status.symbol}]`;

		// 状态信息
		const infoDiv = statusDiv.createEl('div');
		infoDiv.style.flex = '1';
		infoDiv.style.minWidth = '120px';
		infoDiv.createEl('div', {
			text: `${status.name} (${status.key})`,
			cls: 'task-status-name'
		});
		infoDiv.createEl('div', {
			text: status.description,
			cls: 'setting-item-description'
		}).style.fontSize = '12px';

		// 卡片颜色选择区域
		const cardColorDiv = statusDiv.createEl('div');
		cardColorDiv.style.display = 'flex';
		cardColorDiv.style.alignItems = 'center';
		cardColorDiv.style.gap = '8px';
		cardColorDiv.style.paddingRight = '12px';
		cardColorDiv.style.borderRight = '1px solid var(--background-modifier-border)';

		// 背景色选择
		const bgLabel = cardColorDiv.createEl('span', {
			text: '背景',
			cls: 'setting-item-description'
		});
		bgLabel.style.fontSize = '11px';

		const bgColorPicker = cardColorDiv.createEl('input', {
			type: 'color',
			cls: 'task-status-color-input'
		}) as HTMLInputElement;
		bgColorPicker.value = status.backgroundColor;
		bgColorPicker.style.width = '32px';
		bgColorPicker.style.height = '28px';
		bgColorPicker.style.border = 'none';
		bgColorPicker.style.padding = '0';
		bgColorPicker.style.cursor = 'pointer';
		bgColorPicker.addEventListener('change', async () => {
			const statusIndex = plugin.settings.taskStatuses.findIndex((s: TaskStatus) => s.key === status.key);
			if (statusIndex !== -1) {
				plugin.settings.taskStatuses[statusIndex].backgroundColor = bgColorPicker.value;
				iconDiv.style.background = bgColorPicker.value;
				await plugin.saveSettings();
				plugin.refreshCalendarViews();
			}
		});

		// 马卡龙配色背景色
		const bgMacaronDiv = cardColorDiv.createEl('div');
		const macaronPicker = new MacaronColorPicker({
			container: bgMacaronDiv,
			currentColor: status.backgroundColor,
			limit: 10,
			onColorChange: async (color) => {
				const statusIndex = plugin.settings.taskStatuses.findIndex((s: TaskStatus) => s.key === status.key);
				if (statusIndex !== -1) {
					plugin.settings.taskStatuses[statusIndex].backgroundColor = color;
					iconDiv.style.background = color;
					await plugin.saveSettings();
					plugin.refreshCalendarViews();
					bgColorPicker.value = rgbToHex(color) || color;
				}
			}
		});
		macaronPicker.render();

		// 文字色选择
		const textLabel = cardColorDiv.createEl('span', {
			text: '文字',
			cls: 'setting-item-description'
		});
		textLabel.style.fontSize = '11px';
		textLabel.style.marginLeft = '8px';

		const textColorPicker = cardColorDiv.createEl('input', {
			type: 'color',
			cls: 'task-status-color-input'
		}) as HTMLInputElement;
		textColorPicker.value = status.textColor;
		textColorPicker.style.width = '32px';
		textColorPicker.style.height = '28px';
		textColorPicker.style.border = 'none';
		textColorPicker.style.padding = '0';
		textColorPicker.style.cursor = 'pointer';
		textColorPicker.addEventListener('change', async () => {
			const statusIndex = plugin.settings.taskStatuses.findIndex((s: TaskStatus) => s.key === status.key);
			if (statusIndex !== -1) {
				plugin.settings.taskStatuses[statusIndex].textColor = textColorPicker.value;
				iconDiv.style.color = textColorPicker.value;
				await plugin.saveSettings();
				plugin.refreshCalendarViews();
			}
		});

		// 删除按钮（仅自定义状态）
		if (isCustom && onDelete) {
			const deleteButton = statusDiv.createEl('button');
			deleteButton.textContent = '删除';
			deleteButton.style.marginLeft = 'auto';
			deleteButton.style.padding = '4px 12px';
			deleteButton.style.fontSize = '12px';
			deleteButton.style.borderRadius = '4px';
			deleteButton.style.border = '1px solid var(--background-modifier-border)';
			deleteButton.style.background = 'transparent';
			deleteButton.style.color = 'var(--text-muted)';
			deleteButton.style.cursor = 'pointer';
			deleteButton.addEventListener('click', onDelete);
			deleteButton.addEventListener('mouseenter', () => {
				deleteButton.style.background = 'var(--interactive-accent)';
				deleteButton.style.color = 'var(--text-on-accent)';
			});
			deleteButton.addEventListener('mouseleave', () => {
				deleteButton.style.background = 'transparent';
				deleteButton.style.color = 'var(--text-muted)';
			});
		}
	}
}
