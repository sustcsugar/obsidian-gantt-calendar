import { SettingsStatusCardClasses, setCssProps } from '../../utils/bem';
import { rgbToHex } from '../utils/color';
import { MACARON_COLORS } from '../../tasks/taskStatus';

export interface MacaronColorPickerConfig {
	container: HTMLElement;
	currentColor: string;
	onColorChange: (color: string) => Promise<void> | void;
	colors?: string[];
	limit?: number;
	rows?: number;
	columns?: number;
}

export class MacaronColorPicker {
	private config: MacaronColorPickerConfig;

	constructor(config: MacaronColorPickerConfig) {
		this.config = config;
	}

	render(): void {
		const cls = SettingsStatusCardClasses.elements;
		const grid = this.config.container.createDiv(cls.macaron);

		const sourceColors = this.config.colors || MACARON_COLORS;
		const colors = this.config.limit
			? sourceColors.slice(0, this.config.limit)
			: sourceColors;

		const rows = this.config.rows || 1;
		const columns = this.config.columns || Math.ceil(colors.length / rows);

		setCssProps(grid, { gridTemplateColumns: `repeat(${columns}, 1fr)` });

		colors.forEach(color => {
			const swatch = grid.createDiv(cls.macaronSwatch);
			setCssProps(swatch, { backgroundColor: color });
			if (color === this.config.currentColor) {
				setCssProps(swatch, { outline: '2px solid var(--interactive-accent)', outlineOffset: '1px' });
			}
			swatch.addEventListener('click', () => {
				void (async () => {
					await this.config.onColorChange(color);
					this.updateDisplay(color);
				})();
			});
		});
	}

	private updateDisplay(selectedColor: string): void {
		const swatches = this.config.container.querySelectorAll(`.${SettingsStatusCardClasses.elements.macaronSwatch}`);
		swatches.forEach(swatchEl => {
			const swatch = swatchEl as HTMLElement;
			const bgColor = swatch.style.backgroundColor;
			const isSelected = bgColor === selectedColor || rgbToHex(bgColor) === selectedColor;

			if (isSelected) {
				setCssProps(swatch, { outline: '2px solid var(--interactive-accent)', outlineOffset: '1px' });
			} else {
				setCssProps(swatch, { outline: 'none' });
			}
		});
	}
}
