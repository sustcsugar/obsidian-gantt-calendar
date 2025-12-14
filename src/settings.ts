import { App, PluginSettingTab, Setting } from 'obsidian';
import type GanttCalendarPlugin from '../main';

// RGB to Hex converter
function rgbToHex(rgb: string): string {
	if (rgb.startsWith('#')) return rgb;
	const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
	if (!match) return rgb;
	const hex = (x: string) => parseInt(x).toString(16).padStart(2, '0');
	return `#${hex(match[1])}${hex(match[2])}${hex(match[3])}`;
}

// Gantt Calendar Plugin Settings Interface
export interface GanttCalendarSettings {
	mySetting: string;
	startOnMonday: boolean;
	yearLunarFontSize: number;
	solarFestivalColor: string;
	lunarFestivalColor: string;
	solarTermColor: string;
	globalTaskFilter: string;
	enabledTaskFormats: string[];
	showGlobalFilterInTaskText: boolean; // 是否在任务列表文本中显示 global filter 前缀
	dateFilterField: 'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'completionDate' | 'cancelledDate'; // 日期筛选使用的字段
}

export const DEFAULT_SETTINGS: GanttCalendarSettings = {
	mySetting: 'default',
	startOnMonday: true,
	yearLunarFontSize: 10,
	solarFestivalColor: '#e74c3c',  // 阳历节日 - 红色
	lunarFestivalColor: '#e8a041',  // 农历节日 - 橙色
	solarTermColor: '#52c41a',      // 节气 - 绿色
	globalTaskFilter: '🎯 ',        // 全局任务筛选标记
	enabledTaskFormats: ['tasks', 'dataview'], // 启用的任务格式
	showGlobalFilterInTaskText: true, // 默认显示 global filter
	dateFilterField: 'dueDate', // 默认使用截止日期作为筛选字段
};

export class GanttCalendarSettingTab extends PluginSettingTab {
	plugin: GanttCalendarPlugin;

	constructor(app: App, plugin: GanttCalendarPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// ===== 日历视图设置 =====
		containerEl.createEl('h2', { text: '日历视图设置' });

		// 年视图农历字号
		new Setting(containerEl)
			.setName('年视图农历字号')
			.setDesc('调整年视图月卡片内农历文字大小（8-18px）')
			.addSlider(slider => slider
				.setLimits(8, 18, 1)
				.setValue(this.plugin.settings.yearLunarFontSize)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.yearLunarFontSize = value;
					await this.plugin.saveSettings();
					this.plugin.refreshCalendarViews();
				}));

		// 一周开始于
		new Setting(containerEl)
			.setName('一周开始于:')
			.setDesc('选择一周的起始日')
			.addDropdown(drop => {
				drop.addOptions({ 'monday': '周一', 'sunday': '周日' });
				drop.setValue(this.plugin.settings.startOnMonday ? 'monday' : 'sunday');
				drop.onChange(async (value) => {
					this.plugin.settings.startOnMonday = (value === 'monday');
					await this.plugin.saveSettings();
					this.plugin.refreshCalendarViews();
				});
			});

		// 节日颜色设置
		containerEl.createEl('h4', { text: '节日颜色设置' });
		
		this.createColorSetting(
			containerEl,
			'阳历节日颜色',
			'自定义阳历节日显示颜色',
			'solarFestivalColor'
		);
		
		this.createColorSetting(
			containerEl,
			'农历节日颜色',
			'自定义农历节日显示颜色',
			'lunarFestivalColor'
		);
		
		this.createColorSetting(
			containerEl,
			'节气颜色',
			'自定义节气显示颜色',
			'solarTermColor'
		);

		// ===== 任务视图设置 =====
		containerEl.createEl('h2', { text: '任务视图设置' });

		// 全局任务筛选标记
		new Setting(containerEl)
			.setName('全局任务筛选标记')
			.setDesc('用于标记任务的前缀符号或文字（如 "🎯 " 或 "TODO"）')
			.addText(text => text
				.setPlaceholder('🎯 ')
				.setValue(this.plugin.settings.globalTaskFilter)
				.onChange(async (value) => {
					this.plugin.settings.globalTaskFilter = value;
					await this.plugin.saveSettings();
					this.plugin.refreshTaskViews();
				}));

		// 启用的任务格式
		new Setting(containerEl)
			.setName('启用的任务格式')
			.setDesc('选择要支持的任务格式（Tasks 插件或 Dataview 插件）')
			.addDropdown(drop => {
				drop.addOptions({
					'tasks': 'Tasks 插件格式（使用 emoji 表示日期）',
					'dataview': 'Dataview 插件格式（使用字段表示日期）',
					'both': '两者都支持',
				});

				const formats = this.plugin.settings.enabledTaskFormats;
				if (formats.includes('tasks') && formats.includes('dataview')) drop.setValue('both');
				else if (formats.includes('tasks')) drop.setValue('tasks');
				else if (formats.includes('dataview')) drop.setValue('dataview');

				drop.onChange(async (value) => {
					this.plugin.settings.enabledTaskFormats = (value === 'both') ? ['tasks', 'dataview'] : [value];
					await this.plugin.saveSettings();
					this.plugin.refreshTaskViews();
				});
			});

		// 任务文本是否显示 Global Filter
		new Setting(containerEl)
			.setName('任务文本显示 Global Filter')
			.setDesc('在任务列表中文本前显示全局筛选前缀（如 🎯）。关闭则仅显示任务描述')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showGlobalFilterInTaskText)
				.onChange(async (value) => {
					this.plugin.settings.showGlobalFilterInTaskText = value;
					await this.plugin.saveSettings();
					this.plugin.refreshTaskViews();
				}));

		// 日期筛选字段
		new Setting(containerEl)
			.setName('日期筛选字段')
			.setDesc('选择在任务筛选器中用于日期范围筛选（今日/本周/本月）的日期字段')
			.addDropdown(drop => drop
				.addOptions({
					'createdDate': '创建日期',
					'startDate': '开始日期',
					'scheduledDate': '计划日期',
					'dueDate': '截止日期',
					'completionDate': '完成日期',
					'cancelledDate': '取消日期',
				})
				.setValue(this.plugin.settings.dateFilterField)
				.onChange(async (value) => {
					this.plugin.settings.dateFilterField = value as 'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'completionDate' | 'cancelledDate';
					await this.plugin.saveSettings();
					this.plugin.refreshTaskViews();
				}));
	}

	private createColorSetting(
		containerEl: HTMLElement,
		name: string,
		desc: string,
		settingKey: 'solarFestivalColor' | 'lunarFestivalColor' | 'solarTermColor'
	): void {
		const settingDiv = containerEl.createDiv('festival-color-setting');
		
		const labelDiv = settingDiv.createDiv('festival-color-label');
		labelDiv.createEl('div', { text: name, cls: 'festival-color-name' });
		labelDiv.createEl('div', { text: desc, cls: 'festival-color-desc' });
		
		const colorPickerDiv = settingDiv.createDiv('festival-color-picker');
		
		// Custom color input
		const customInput = colorPickerDiv.createEl('input', {
			type: 'color',
			cls: 'festival-color-input'
		}) as HTMLInputElement;
		customInput.value = this.plugin.settings[settingKey];
		customInput.title = '点击选择自定义颜色';
		customInput.addEventListener('change', async () => {
			this.plugin.settings[settingKey] = customInput.value;
			await this.plugin.saveSettings();
			this.plugin.refreshCalendarViews();
			this.updateColorDisplay(colorPickerDiv, customInput.value);
		});
		
		// Preset colors
		const presetColors = ['#e74c3c', '#e8a041', '#52c41a', '#2196F3', '#9C27B0', '#FF5722', '#00BCD4'];
		presetColors.forEach(color => {
			const colorButton = colorPickerDiv.createEl('div', { cls: 'festival-color-swatch' });
			colorButton.style.backgroundColor = color;
			colorButton.style.borderColor = color === this.plugin.settings[settingKey] ? '#000' : 'transparent';
			colorButton.addEventListener('click', async () => {
				this.plugin.settings[settingKey] = color;
				customInput.value = color;
				await this.plugin.saveSettings();
				this.plugin.refreshCalendarViews();
				this.updateColorDisplay(colorPickerDiv, color);
			});
		});
		
		this.updateColorDisplay(colorPickerDiv, this.plugin.settings[settingKey]);
	}

	private updateColorDisplay(colorPickerDiv: HTMLElement, selectedColor: string): void {
		const swatches = colorPickerDiv.querySelectorAll('.festival-color-swatch');
		swatches.forEach(swatch => {
			const bgColor = (swatch as HTMLElement).style.backgroundColor;
			if (bgColor === selectedColor || rgbToHex(bgColor) === selectedColor) {
				(swatch as HTMLElement).style.borderColor = '#000';
				(swatch as HTMLElement).style.borderWidth = '3px';
			} else {
				(swatch as HTMLElement).style.borderColor = 'transparent';
				(swatch as HTMLElement).style.borderWidth = '1px';
			}
		});
	}
}
