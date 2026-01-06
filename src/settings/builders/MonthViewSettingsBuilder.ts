import { Setting } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig } from '../types';

/**
 * 月视图设置构建器
 */
export class MonthViewSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		// 月视图标题
		this.containerEl.createEl('h2', { text: '月视图设置' });

		// 月视图每天显示的任务数量
		new Setting(this.containerEl)
			.setName('每天显示的任务数量')
			.setDesc('设置月视图中每个日期卡片最多显示多少个任务（1-10）')
			.addSlider(slider => slider
				.setLimits(1, 10, 1)
				.setValue(this.plugin.settings.monthViewTaskLimit)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.monthViewTaskLimit = value;
					await this.saveAndRefresh();
				}));
	}
}
