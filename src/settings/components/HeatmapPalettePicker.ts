import { HEATMAP_PALETTES } from '../constants';
import { SettingsHeatmapChipClasses } from '../../utils/bem';

/**
 * 热力图色卡选择器配置接口
 */
export interface HeatmapPalettePickerConfig {
	container: HTMLElement;
	currentPalette: keyof typeof HEATMAP_PALETTES;
	onPaletteChange: (paletteKey: keyof typeof HEATMAP_PALETTES) => Promise<void> | void;
}

/**
 * 热力图色卡选择器组件
 * Apple pill-style chips with gradient preview
 */
export class HeatmapPalettePicker {
	private config: HeatmapPalettePickerConfig;

	constructor(config: HeatmapPalettePickerConfig) {
		this.config = config;
	}

	render(): void {
		const cls = SettingsHeatmapChipClasses;
		const row = this.config.container.createDiv(cls.elements.row);

		Object.values(HEATMAP_PALETTES).forEach((palette) => {
			const chip = row.createDiv(cls.elements.chip);
			chip.setAttribute('role', 'radio');
			chip.setAttribute('aria-checked', String(this.config.currentPalette === palette.key));
			chip.setAttribute('aria-label', palette.label);
			chip.setAttribute('tabindex', '0');

			if (this.config.currentPalette === palette.key) {
				chip.addClass(cls.modifiers.active);
			}

			// Gradient preview bar
			const preview = chip.createDiv(cls.elements.preview);
			const gradient = palette.colors.join(', ');
			preview.style.background = `linear-gradient(to right, ${gradient})`;

			// Label
			chip.createSpan(cls.elements.label).setText(palette.label);

			const select = async () => {
				Array.from(row.children).forEach(el => {
					(el as HTMLElement).removeClass(cls.modifiers.active);
					(el as HTMLElement).setAttribute('aria-checked', 'false');
				});
				chip.addClass(cls.modifiers.active);
				chip.setAttribute('aria-checked', 'true');
				await this.config.onPaletteChange(palette.key);
			};

			chip.addEventListener('click', () => { void select(); });
			chip.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					void select();
				}
			});
		});
	}
}
