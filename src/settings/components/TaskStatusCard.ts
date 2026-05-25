import type GanttCalendarPlugin from '../../../main';
import { TaskStatus, ThemeColors, getCurrentThemeMode } from '../../tasks/taskStatus';
import { SettingsStatusCardClasses } from '../../utils/bem';
import { rgbToHex } from '../utils/color';
import { MacaronColorPicker } from './MacaronColorPicker';
import { i18n } from '../../i18n/i18n';

export interface TaskStatusCardConfig {
	container: HTMLElement;
	plugin: GanttCalendarPlugin;
	status: TaskStatus;
	onDelete?: () => Promise<void> | void;
	onEdit?: () => void;
	onColorChange?: () => Promise<void> | void;
}

export class TaskStatusCard {
	private config: TaskStatusCardConfig;
	private previewEl?: HTMLElement;

	constructor(config: TaskStatusCardConfig) {
		this.config = config;
	}

	render(): void {
		const { container, plugin, status, onDelete, onEdit } = this.config;
		const isCustom = !status.isDefault;
		const cls = SettingsStatusCardClasses.elements;

		const card = container.createDiv(cls.card);

		// ── Header: preview pill + button group (edit + delete) ──
		const header = card.createDiv(cls.header);

		// Live preview pill: shows [symbol] name with actual status colors
		const symbol = status.symbol === ' ' ? ' ' : status.symbol;
		this.previewEl = header.createDiv(cls.dot);
		this.previewEl.setText(`[${symbol}]  ${status.name}`);
		this.updatePreview();

		if (isCustom) {
			const btnGroup = header.createDiv(cls.btnGroup);

			if (onEdit) {
				const editBtn = btnGroup.createEl('button', cls.editBtn);
				editBtn.setText('✎');
				editBtn.addEventListener('click', onEdit);
			}

			if (onDelete) {
				const deleteBtn = btnGroup.createEl('button', cls.deleteBtn);
				deleteBtn.setText('×');
				deleteBtn.addEventListener('click', onDelete);
			}
		}

		// ── Body: light/dark theme sections ──
		const body = card.createDiv(cls.body);

		this.renderThemeSection(body, plugin, status, 'light');
		body.createEl('hr', cls.divider);
		this.renderThemeSection(body, plugin, status, 'dark');
	}

	private renderThemeSection(
		parent: HTMLElement,
		plugin: GanttCalendarPlugin,
		status: TaskStatus,
		themeMode: 'light' | 'dark'
	): void {
		const cls = SettingsStatusCardClasses.elements;
		const section = parent.createDiv(cls.themeSection);

		section.createEl('span', {
			text: themeMode === 'light' ? i18n.t('settings.taskStatus.colors.lightTheme') : i18n.t('settings.taskStatus.colors.darkTheme'),
			cls: cls.themeLabel,
		});

		const colors = this.getThemeColors(status, themeMode);
		const defaultBg = themeMode === 'dark' ? '#2d333b' : '#FFFFFF';
		const defaultText = themeMode === 'dark' ? '#adbac7' : '#333333';

		const row = section.createDiv(cls.colorRow);

		this.renderColorField(row, plugin, status, themeMode, 'backgroundColor', i18n.t('settings.taskStatus.colors.background'), colors?.backgroundColor || defaultBg);
		this.renderColorField(row, plugin, status, themeMode, 'textColor', i18n.t('settings.taskStatus.colors.text'), colors?.textColor || defaultText);
	}

	private renderColorField(
		parent: HTMLElement,
		plugin: GanttCalendarPlugin,
		status: TaskStatus,
		themeMode: 'light' | 'dark',
		colorType: 'backgroundColor' | 'textColor',
		label: string,
		currentColor: string
	): void {
		const cls = SettingsStatusCardClasses.elements;
		const field = parent.createDiv(cls.colorField);

		const labelRow = field.createDiv(cls.colorLabel);
		labelRow.createEl('span', { text: label, cls: cls.colorLabelText });

		const swatchWrapper = labelRow.createDiv(cls.swatchWrapper);
		const hiddenInput = swatchWrapper.createEl('input', {
			type: 'color',
			cls: cls.hiddenInput,
		}) as HTMLInputElement;
		hiddenInput.value = currentColor;

		const swatch = swatchWrapper.createDiv(cls.swatch);
		swatch.style.backgroundColor = currentColor;

		hiddenInput.addEventListener('change', async () => {
			await this.updateColor(plugin, status, themeMode, colorType, hiddenInput.value, swatch);
		});

		const macaronContainer = field.createDiv();
		const macaronPicker = new MacaronColorPicker({
			container: macaronContainer,
			currentColor,
			limit: 8,
			rows: 2,
			onColorChange: async (color) => {
				await this.updateColor(plugin, status, themeMode, colorType, color, swatch);
				hiddenInput.value = rgbToHex(color) || color;
			},
		});
		macaronPicker.render();
	}

	private async updateColor(
		plugin: GanttCalendarPlugin,
		status: TaskStatus,
		themeMode: 'light' | 'dark',
		colorType: 'backgroundColor' | 'textColor',
		color: string,
		swatch: HTMLElement
	): Promise<void> {
		const idx = plugin.settings.taskStatuses.findIndex((s: TaskStatus) => s.key === status.key);
		if (idx === -1) return;

		const target = plugin.settings.taskStatuses[idx];
		this.ensureThemeColors(target);

		const colorKey = themeMode === 'dark' ? 'darkColors' : 'lightColors';
		(target[colorKey] as ThemeColors)[colorType] = color;

		swatch.style.backgroundColor = color;
		this.updatePreview();

		if (this.config.onColorChange) {
			await this.config.onColorChange();
		} else {
			await plugin.saveSettings();
			plugin.refreshCalendarViews();
		}
	}

	private updatePreview(): void {
		if (!this.previewEl) return;
		const { status } = this.config;
		const themeMode = getCurrentThemeMode();
		const colors = this.getThemeColors(status, themeMode);
		if (colors) {
			this.previewEl.style.background = colors.backgroundColor;
			this.previewEl.style.color = colors.textColor;
		}
	}

	private getThemeColors(status: TaskStatus, themeMode: 'light' | 'dark'): ThemeColors | null {
		this.ensureThemeColors(status);
		if (status.lightColors && status.darkColors) {
			return themeMode === 'dark' ? status.darkColors : status.lightColors;
		}
		if (status.backgroundColor && status.textColor) {
			return { backgroundColor: status.backgroundColor, textColor: status.textColor };
		}
		return null;
	}

	private ensureThemeColors(status: TaskStatus): void {
		if (status.lightColors && status.darkColors) return;

		if (status.backgroundColor && status.textColor) {
			if (!status.lightColors) {
				status.lightColors = { backgroundColor: status.backgroundColor, textColor: status.textColor };
			}
			if (!status.darkColors) {
				status.darkColors = { backgroundColor: '#2d333b', textColor: '#adbac7' };
			}
			return;
		}

		if (!status.lightColors) {
			status.lightColors = { backgroundColor: '#FFFFFF', textColor: '#333333' };
		}
		if (!status.darkColors) {
			status.darkColors = { backgroundColor: '#2d333b', textColor: '#adbac7' };
		}
	}
}
