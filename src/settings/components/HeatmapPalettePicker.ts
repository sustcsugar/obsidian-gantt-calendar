import { HEATMAP_PALETTES } from '../constants';
import type { HeatmapPalette } from '../types';

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
 * 提供热力图配色方案的平铺选择界面
 */
export class HeatmapPalettePicker {
	private config: HeatmapPalettePickerConfig;
	private listDiv: HTMLElement;

	constructor(config: HeatmapPalettePickerConfig) {
		this.config = config;
	}

	/**
	 * 渲染热力图色卡选择器
	 */
	render(): void {
		const settingDiv = this.config.container.createDiv('heatmap-palette-setting');
		const labelDiv = settingDiv.createDiv('heatmap-palette-label');
		labelDiv.createEl('div', { text: '热力图配色方案', cls: 'heatmap-palette-name' });
		labelDiv.createEl('div', { text: '选择任务热力图的颜色梯度', cls: 'heatmap-palette-desc' });

		this.listDiv = settingDiv.createDiv('heatmap-palette-list');

		Object.values(HEATMAP_PALETTES).forEach((palette) => {
			const option = this.listDiv.createDiv('heatmap-palette-option');
			option.setAttr('data-palette', palette.key);

			const bars = option.createDiv('heatmap-palette-bars');
			palette.colors.forEach(c => {
				const bar = bars.createDiv('heatmap-palette-bar');
				(bar as HTMLElement).style.backgroundColor = c;
			});

			option.createEl('span', { text: palette.label, cls: 'heatmap-palette-label-text' });

			// 初始选中态
			if (this.config.currentPalette === palette.key) {
				(option as HTMLElement).classList.add('selected');
			}

			option.addEventListener('click', async () => {
				await this.config.onPaletteChange(palette.key);
				// 选中态更新
				Array.from(this.listDiv.children).forEach(el => el.classList.remove('selected'));
				(option as HTMLElement).classList.add('selected');
			});
		});
	}
}
