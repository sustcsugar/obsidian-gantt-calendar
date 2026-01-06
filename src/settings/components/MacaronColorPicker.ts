import { rgbToHex } from '../utils/color';
import { MACARON_COLORS } from '../../tasks/taskStatus';

/**
 * 马卡龙色卡选择器配置接口
 */
export interface MacaronColorPickerConfig {
	container: HTMLElement;
	currentColor: string;
	onColorChange: (color: string) => Promise<void> | void;
	limit?: number; // 限制显示的颜色数量（默认显示全部）
}

/**
 * 马卡龙色卡选择器组件
 * 提供预设的马卡龙色卡网格选择
 */
export class MacaronColorPicker {
	private config: MacaronColorPickerConfig;
	private macaronDiv: HTMLElement;

	constructor(config: MacaronColorPickerConfig) {
		this.config = config;
	}

	/**
	 * 渲染马卡龙色卡选择器
	 */
	render(): void {
		this.macaronDiv = this.config.container.createEl('div');
		this.macaronDiv.style.display = 'flex';
		this.macaronDiv.style.gap = '4px';

		const colors = this.config.limit
			? MACARON_COLORS.slice(0, this.config.limit)
			: MACARON_COLORS;

		colors.forEach(color => {
			const swatch = this.macaronDiv.createEl('div', { cls: 'task-macaron-swatch' });
			swatch.style.width = '16px';
			swatch.style.height = '16px';
			swatch.style.borderRadius = '2px';
			swatch.style.cursor = 'pointer';
			swatch.style.backgroundColor = color;
			swatch.style.border = color === this.config.currentColor ? '2px solid #000' : '1px solid var(--background-modifier-border)';
			swatch.addEventListener('click', async () => {
				await this.config.onColorChange(color);
				this.updateDisplay(color);
			});
		});

		this.updateDisplay(this.config.currentColor);
	}

	/**
	 * 更新马卡龙色卡的选中状态
	 */
	private updateDisplay(selectedColor: string): void {
		const swatches = this.macaronDiv.querySelectorAll('.task-macaron-swatch');
		swatches.forEach(swatch => {
			const bgColor = (swatch as HTMLElement).style.backgroundColor;
			const isSelected = bgColor === selectedColor || rgbToHex(bgColor) === selectedColor;

			if (isSelected) {
				(swatch as HTMLElement).style.border = '2px solid #000';
				(swatch as HTMLElement).style.outline = 'none';
			} else {
				(swatch as HTMLElement).style.border = '1px solid var(--background-modifier-border)';
				(swatch as HTMLElement).style.outline = 'none';
			}
		});
	}
}
