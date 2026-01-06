import { rgbToHex } from '../utils/color';
import type { ColorPickerConfig } from '../types';

/**
 * 颜色选择器组件
 * 提供自定义颜色输入框和预设颜色色卡
 */
export class ColorPicker {
	private config: ColorPickerConfig;
	private colorPickerDiv: HTMLElement;

	constructor(config: ColorPickerConfig) {
		this.config = config;
	}

	/**
	 * 渲染颜色选择器
	 */
	render(): void {
		const settingDiv = this.config.container.createDiv('festival-color-setting');

		// 标签
		const labelDiv = settingDiv.createDiv('festival-color-label');
		labelDiv.createEl('div', {
			text: this.config.name,
			cls: 'festival-color-name'
		});
		labelDiv.createEl('div', {
			text: this.config.description,
			cls: 'festival-color-desc'
		});

		// 颜色选择器容器
		this.colorPickerDiv = settingDiv.createDiv('festival-color-picker');

		// 自定义颜色输入
		const customInput = this.colorPickerDiv.createEl('input', {
			type: 'color',
			cls: 'festival-color-input'
		}) as HTMLInputElement;
		customInput.value = this.config.currentColor;
		customInput.title = '点击选择自定义颜色';
		customInput.addEventListener('change', async () => {
			await this.config.onColorChange(customInput.value);
			this.updateDisplay(customInput.value);
		});

		// 预设颜色
		this.config.presetColors.forEach(color => {
			const colorButton = this.colorPickerDiv.createEl('div', {
				cls: 'festival-color-swatch'
			});
			colorButton.style.backgroundColor = color;
			colorButton.style.borderColor = color === this.config.currentColor
				? '#000'
				: 'transparent';
			colorButton.addEventListener('click', async () => {
				await this.config.onColorChange(color);
				customInput.value = color;
				this.updateDisplay(color);
			});
		});

		this.updateDisplay(this.config.currentColor);
	}

	/**
	 * 更新颜色显示的选中状态
	 */
	private updateDisplay(selectedColor: string): void {
		const swatches = this.colorPickerDiv.querySelectorAll('.festival-color-swatch');
		swatches.forEach(swatch => {
			const bgColor = (swatch as HTMLElement).style.backgroundColor;
			if (bgColor === selectedColor || rgbToHex(bgColor) === selectedColor) {
				(swatch as HTMLElement).style.outline = '2px solid #000';
				(swatch as HTMLElement).style.outlineOffset = '1px';
			} else {
				(swatch as HTMLElement).style.outline = 'none';
				(swatch as HTMLElement).style.outlineOffset = '0px';
			}
		});
	}
}
