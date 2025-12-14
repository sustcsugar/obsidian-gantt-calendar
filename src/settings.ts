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
	enableDailyNote: boolean; // 是否在日视图中显示 Daily Note
	dayViewLayout: 'horizontal' | 'vertical'; // 日视图布局：水平（左右分屏）或垂直（上下分屏）
	dailyNotePath: string; // Daily note 文件夹路径
	dailyNoteNameFormat: string; // Daily note 文件名格式 (如 yyyy-MM-dd)
	monthViewTaskLimit: number; // 月视图每天显示的最大任务数量
	yearShowTaskCount: boolean; // 年视图是否显示每日任务数量
	yearHeatmapEnabled: boolean; // 年视图是否启用任务热力图
	yearHeatmapPalette: 'blue' | 'green' | 'red' | 'purple' | 'orange' | 'cyan' | 'pink' | 'yellow'; // 热力图色卡选择
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
	enableDailyNote: true, // 默认在日视图中显示 Daily Note
	dayViewLayout: 'horizontal', // 默认水平（左右分屏）布局
	dailyNotePath: 'DailyNotes', // 默认 daily note 文件夹路径
	dailyNoteNameFormat: 'yyyy-MM-dd', // 默认文件名格式
	monthViewTaskLimit: 5, // 默认每天显示5个任务
	yearShowTaskCount: true,
	yearHeatmapEnabled: true,
	yearHeatmapPalette: 'blue',
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

		// ===== 日视图设置 =====
		containerEl.createEl('h2', { text: '日视图设置' });

		// 显示 Daily Note 开关
		new Setting(containerEl)
			.setName('显示 Daily Note')
			.setDesc('在日视图中显示当天的 Daily Note 内容')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDailyNote)
				.onChange(async (value) => {
					this.plugin.settings.enableDailyNote = value;
					await this.plugin.saveSettings();
					// 重新渲染设置面板以显示/隐藏关联的设置
					this.display();
					// 刷新日历视图（包括日视图）
					this.plugin.refreshCalendarViews();
				}));

		// Daily Note 文件夹路径（仅在启用时显示）
		if (this.plugin.settings.enableDailyNote) {
			// 日视图布局选择
			new Setting(containerEl)
				.setName('日视图布局')
				.setDesc('选择 Daily Note 和任务列表的布局方式')
				.addDropdown(drop => drop
					.addOptions({
						'horizontal': '左右分屏（任务在左，笔记在右）',
						'vertical': '上下分屏（任务在上，笔记在下）',
					})
					.setValue(this.plugin.settings.dayViewLayout)
					.onChange(async (value) => {
						this.plugin.settings.dayViewLayout = value as 'horizontal' | 'vertical';
						await this.plugin.saveSettings();
						this.plugin.refreshCalendarViews();
					}));

			new Setting(containerEl)
				.setName('Daily Note 文件夹路径')
				.setDesc('指定存放 Daily Note 文件的文件夹路径（相对于库根目录）')
				.addText(text => text
					.setPlaceholder('DailyNotes')
					.setValue(this.plugin.settings.dailyNotePath)
					.onChange(async (value) => {
						this.plugin.settings.dailyNotePath = value;
						await this.plugin.saveSettings();
						this.plugin.refreshCalendarViews();
					}));

			// Daily Note 文件名格式（仅在启用时显示）
			new Setting(containerEl)
				.setName('Daily Note 文件名格式')
				.setDesc('指定 Daily Note 文件名格式（如 yyyy-MM-dd，会在日视图中用当前日期自动替换）')
				.addText(text => text
					.setPlaceholder('yyyy-MM-dd')
					.setValue(this.plugin.settings.dailyNoteNameFormat)
					.onChange(async (value) => {
						this.plugin.settings.dailyNoteNameFormat = value;
						await this.plugin.saveSettings();
						this.plugin.refreshCalendarViews();
					}));
		}

		// ===== 月视图设置 =====
		containerEl.createEl('h2', { text: '月视图设置' });

		// 月视图每天显示的任务数量
		new Setting(containerEl)
			.setName('每天显示的任务数量')
			.setDesc('设置月视图中每个日期卡片最多显示多少个任务（1-10）')
			.addSlider(slider => slider
				.setLimits(1, 10, 1)
				.setValue(this.plugin.settings.monthViewTaskLimit)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.monthViewTaskLimit = value;
					await this.plugin.saveSettings();
					this.plugin.refreshCalendarViews();
				}));

		// ===== 任务视图设置 =====
		// ===== 年视图设置 =====
		containerEl.createEl('h2', { text: '年视图设置' });

		// 年视图每日任务数量显示
		new Setting(containerEl)
			.setName('显示每日任务数量')
			.setDesc('在年视图每个日期下方显示当天任务总数（已完成+未完成）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.yearShowTaskCount)
				.onChange(async (value) => {
					this.plugin.settings.yearShowTaskCount = value;
					await this.plugin.saveSettings();
					this.plugin.refreshCalendarViews();
				}));

		// 年视图任务热力图开关
		new Setting(containerEl)
			.setName('启用任务热力图')
			.setDesc('根据当天任务数量深浅显示日期背景颜色')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.yearHeatmapEnabled)
				.onChange(async (value) => {
					this.plugin.settings.yearHeatmapEnabled = value;
					await this.plugin.saveSettings();
					this.plugin.refreshCalendarViews();
					// 切换显示色卡设置
					this.display();
				}));

		// 热力图色卡选择（平铺单选色卡）
		if (this.plugin.settings.yearHeatmapEnabled) {
			this.createHeatmapPaletteSetting(containerEl);
		}

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

	private createHeatmapPaletteSetting(containerEl: HTMLElement): void {
		const settingDiv = containerEl.createDiv('heatmap-palette-setting');
		const labelDiv = settingDiv.createDiv('heatmap-palette-label');
		labelDiv.createEl('div', { text: '热力图配色方案', cls: 'heatmap-palette-name' });
		labelDiv.createEl('div', { text: '选择任务热力图的颜色梯度', cls: 'heatmap-palette-desc' });

		const palettes: Array<{ key: 'blue'|'green'|'red'|'purple'|'orange'|'cyan'|'pink'|'yellow'; colors: string[]; label: string }> = [
			{ key: 'blue', label: '蓝色', colors: [
				'rgba(56, 132, 255, 0.12)',
				'rgba(56, 132, 255, 0.22)',
				'rgba(56, 132, 255, 0.32)',
				'rgba(56, 132, 255, 0.44)',
				'rgba(56, 132, 255, 0.58)'
			] },
			{ key: 'green', label: '绿色', colors: [
				'rgba(82, 196, 26, 0.12)',
				'rgba(82, 196, 26, 0.22)',
				'rgba(82, 196, 26, 0.32)',
				'rgba(82, 196, 26, 0.44)',
				'rgba(82, 196, 26, 0.58)'
			] },
			{ key: 'red', label: '红色', colors: [
				'rgba(231, 76, 60, 0.12)',
				'rgba(231, 76, 60, 0.22)',
				'rgba(231, 76, 60, 0.32)',
				'rgba(231, 76, 60, 0.44)',
				'rgba(231, 76, 60, 0.58)'
			] },
			{ key: 'purple', label: '紫色', colors: [
				'rgba(142, 68, 173, 0.12)',
				'rgba(142, 68, 173, 0.22)',
				'rgba(142, 68, 173, 0.32)',
				'rgba(142, 68, 173, 0.44)',
				'rgba(142, 68, 173, 0.58)'
			] },
			{ key: 'orange', label: '橙色', colors: [
				'rgba(245, 124, 0, 0.12)',
				'rgba(245, 124, 0, 0.22)',
				'rgba(245, 124, 0, 0.32)',
				'rgba(245, 124, 0, 0.44)',
				'rgba(245, 124, 0, 0.58)'
			] },
			{ key: 'cyan', label: '青色', colors: [
				'rgba(0, 188, 212, 0.12)',
				'rgba(0, 188, 212, 0.22)',
				'rgba(0, 188, 212, 0.32)',
				'rgba(0, 188, 212, 0.44)',
				'rgba(0, 188, 212, 0.58)'
			] },
			{ key: 'pink', label: '粉色', colors: [
				'rgba(233, 30, 99, 0.12)',
				'rgba(233, 30, 99, 0.22)',
				'rgba(233, 30, 99, 0.32)',
				'rgba(233, 30, 99, 0.44)',
				'rgba(233, 30, 99, 0.58)'
			] },
			{ key: 'yellow', label: '黄色', colors: [
				'rgba(255, 193, 7, 0.12)',
				'rgba(255, 193, 7, 0.22)',
				'rgba(255, 193, 7, 0.32)',
				'rgba(255, 193, 7, 0.44)',
				'rgba(255, 193, 7, 0.58)'
			] },
		];

		const listDiv = settingDiv.createDiv('heatmap-palette-list');
		palettes.forEach(p => {
			const option = listDiv.createDiv('heatmap-palette-option');
			option.setAttr('data-palette', p.key);
			const bars = option.createDiv('heatmap-palette-bars');
			p.colors.forEach(c => {
				const bar = bars.createDiv('heatmap-palette-bar');
				(bar as HTMLElement).style.backgroundColor = c;
			});
			option.createEl('span', { text: p.label, cls: 'heatmap-palette-label-text' });
			// 初始选中态
			if (this.plugin.settings.yearHeatmapPalette === p.key) {
				(option as HTMLElement).classList.add('selected');
			}
			option.addEventListener('click', async () => {
				this.plugin.settings.yearHeatmapPalette = p.key;
				await this.plugin.saveSettings();
				// 选中态更新
				Array.from(listDiv.children).forEach(el => el.classList.remove('selected'));
				(option as HTMLElement).classList.add('selected');
				this.plugin.refreshCalendarViews();
			});
		});
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
				(swatch as HTMLElement).style.outline = '2px solid #000';
				(swatch as HTMLElement).style.outlineOffset = '1px';
			} else {
				(swatch as HTMLElement).style.outline = 'none';
				(swatch as HTMLElement).style.outlineOffset = '0px';
			}
		});
	}
}
