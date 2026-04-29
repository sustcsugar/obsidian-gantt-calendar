import { rgbToHex } from '../utils/color';
import { MACARON_COLORS } from '../../tasks/taskStatus';

export interface MacaronColorPickerConfig {
	container: HTMLElement;
	currentColor: string;
	onColorChange: (color: string) => Promise<void> | void;
	limit?: number;
	rows?: number;
	columns?: number;
}

export class MacaronColorPicker {
	private config: MacaronColorPickerConfig;
	private macaronDiv: HTMLElement;

	constructor(config: MacaronColorPickerConfig) {
		this.config = config;
	}

	render(): void {
		this.macaronDiv = this.config.container.createEl('div', 'macaron-color-picker');

		const colors = this.config.limit
			? MACARON_COLORS.slice(0, this.config.limit)
			: MACARON_COLORS;

		const rows = this.config.rows || 1;
		const columns = this.config.columns || Math.ceil(colors.length / rows);

		this.macaronDiv.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;

		colors.forEach(color => {
			const swatch = this.macaronDiv.createEl('div', 'task-macaron-swatch');
			swatch.style.backgroundColor = color;
			swatch.style.border = color === this.config.currentColor
				? '2px solid var(--interactive-accent)'
				: '1px solid var(--background-modifier-border)';
			swatch.addEventListener('click', async () => {
				await this.config.onColorChange(color);
				this.updateDisplay(color);
			});
		});

		this.updateDisplay(this.config.currentColor);
	}

	private updateDisplay(selectedColor: string): void {
		const swatches = this.macaronDiv.querySelectorAll('.task-macaron-swatch');
		swatches.forEach(swatch => {
			const bgColor = (swatch as HTMLElement).style.backgroundColor;
			const isSelected = bgColor === selectedColor || rgbToHex(bgColor) === selectedColor;

			if (isSelected) {
				(swatch as HTMLElement).style.border = '2px solid var(--interactive-accent)';
			} else {
				(swatch as HTMLElement).style.border = '1px solid var(--background-modifier-border)';
			}
		});
	}
}
