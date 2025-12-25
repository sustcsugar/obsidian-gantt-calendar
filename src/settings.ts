import { App, PluginSettingTab, Setting, TFolder, Modal } from 'obsidian';
import type GanttCalendarPlugin from '../main';
import { TaskStatus, DEFAULT_TASK_STATUSES, MACARON_COLORS, validateStatusSymbol, CheckboxIconStyle } from './tasks/taskStatus';

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
	dateFilterField: 'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'completionDate' | 'cancelledDate'; // 日历视图的筛选字段，任务视图的初始字段
	enableDailyNote: boolean; // 是否在日视图中显示 Daily Note
	dayViewLayout: 'horizontal' | 'vertical'; // 日视图布局：水平（左右分屏）或垂直（上下分屏）
	dailyNotePath: string; // Daily note 文件夹路径
	dailyNoteNameFormat: string; // Daily note 文件名格式 (如 yyyy-MM-dd)
	monthViewTaskLimit: number; // 月视图每天显示的最大任务数量
	yearShowTaskCount: boolean; // 年视图是否显示每日任务数量
	yearHeatmapEnabled: boolean; // 年视图是否启用任务热力图
	yearHeatmapPalette: 'blue' | 'green' | 'red' | 'purple' | 'orange' | 'cyan' | 'pink' | 'yellow'; // 热力图色卡选择
	taskNotePath: string; // 任务笔记默认文件夹路径
	taskStatuses: TaskStatus[]; // 任务状态配置（包含颜色）
}

export const DEFAULT_SETTINGS: GanttCalendarSettings = {
	mySetting: 'default',
	startOnMonday: true,
	yearLunarFontSize: 10,
	solarFestivalColor: '#e74c3c',  // 阳历节日 - 红色
	lunarFestivalColor: '#e8a041',  // 农历节日 - 橙色
	solarTermColor: '#52c41a',      // 节气 - 绿色
	globalTaskFilter: '🎯 ',        // 全局任务筛选标记
	enabledTaskFormats: ['tasks'], // 启用的任务格式
	showGlobalFilterInTaskText: true, // 默认显示 global filter
	dateFilterField: 'dueDate', // 默认使用截止日期作为筛选字段
	enableDailyNote: true, // 默认在日视图中显示 Daily Note
	dayViewLayout: 'horizontal', // 默认水平（左右分屏）布局
	dailyNotePath: 'DailyNotes', // 默认 daily note 文件夹路径
	dailyNoteNameFormat: 'yyyy-MM-dd', // 默认文件名格式
	monthViewTaskLimit: 3, // 默认每天显示5个任务
	yearShowTaskCount: true,
	yearHeatmapEnabled: true,
	yearHeatmapPalette: 'blue',
	taskNotePath: 'Tasks', // 默认任务笔记文件夹路径
	taskStatuses: DEFAULT_TASK_STATUSES, // 默认任务状态配置
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

		// ===== 任务视图设置 =====
		containerEl.createEl('h1', { text: '任务视图设置' });

		// 全局任务筛选标记
		new Setting(containerEl)
			.setName('全局任务筛选标记')
			.setDesc('用于标记任务的前缀符号或文字（如 "🎯 " 或 "TODO"）')
			.addText(text => text
				.setPlaceholder('空则不使用筛选')
				.setValue(this.plugin.settings.globalTaskFilter)
				.onChange(async (value) => {
					this.plugin.settings.globalTaskFilter = value;
					await this.plugin.saveSettings();
					this.plugin.refreshCalendarViews();
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
					this.plugin.refreshCalendarViews();
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
					this.plugin.refreshCalendarViews();
				}));

		// 任务笔记文件夹路径
		new Setting(containerEl)
			.setName('任务笔记文件夹路径')
			.setDesc('从任务创建笔记时的默认存放路径（相对于库根目录）')
			.addText(text => text
				.setPlaceholder('Tasks')
				.setValue(this.plugin.settings.taskNotePath)
				.onChange(async (value) => {
					this.plugin.settings.taskNotePath = value;
					await this.plugin.saveSettings();
				}));



		// ===== 日历视图设置 =====
		containerEl.createEl('h1', { text: '日历视图设置' });

		// 日期筛选字段
		new Setting(containerEl)
			.setName('日期筛选字段')
			.setDesc('日历视图始终使用此字段筛选任务；任务视图可在工具栏灵活切换')
			.addDropdown(drop => drop
				.addOptions({
					'createdDate': '➕ 创建日期',
					'startDate': '🛫 开始日期',
					'scheduledDate': '⏳ 计划日期',
					'dueDate': '📅 截止日期',
					'completionDate': '✅ 完成日期',
					'cancelledDate': '❌ 取消日期',
				})
				.setValue(this.plugin.settings.dateFilterField)
				.onChange(async (value) => {
					this.plugin.settings.dateFilterField = value as 'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'completionDate' | 'cancelledDate';
					await this.plugin.saveSettings();
					this.plugin.refreshCalendarViews();
				}));

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

		// ===== 节日颜色设置 =====
		containerEl.createEl('h2', { text: '节日颜色设置' });
		
		// 创建横向容器
		const festivalColorContainer = containerEl.createDiv('festival-color-settings-container');
		
		this.createColorSetting(
			festivalColorContainer,
			'阳历节日颜色',
			'自定义阳历节日显示颜色',
			'solarFestivalColor'
		);
		
		this.createColorSetting(
			festivalColorContainer,
			'农历节日颜色',
			'自定义农历节日显示颜色',
			'lunarFestivalColor'
		);
		
		this.createColorSetting(
			festivalColorContainer,
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
				.addText(text => {
					text
						.setPlaceholder('DailyNotes')
						.setValue(this.plugin.settings.dailyNotePath)
						.onChange(async (value) => {
							this.plugin.settings.dailyNotePath = value;
							await this.plugin.saveSettings();
							this.plugin.refreshCalendarViews();
						});

					// 路径预测：使用 datalist 提供文件夹候选
					const inputEl = text.inputEl;
					const datalistId = `gantt-dailynote-folder-suggest-${Date.now()}`;
					inputEl.setAttr('list', datalistId);
					const datalist = inputEl.parentElement?.createEl('datalist');
					if (datalist) datalist.id = datalistId;

					const folders = this.app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder);
					const updateSuggestions = (query: string) => {
						if (!datalist) return;
						datalist.innerHTML = '';
						const lower = query.toLowerCase();
						folders
							.filter(f => f.path.toLowerCase().includes(lower))
							.slice(0, 50)
							.forEach(f => {
								const opt = datalist.createEl('option');
								opt.value = f.path;
							});
					};

					inputEl.addEventListener('focus', () => updateSuggestions(inputEl.value || ''));
					inputEl.addEventListener('input', () => updateSuggestions(inputEl.value || ''));
				});

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

		// ===== 任务状态设置 =====
		containerEl.createEl('h2', { text: '任务状态设置' });
		this.createTaskStatusSettings(containerEl);

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

	/**
	 * 创建任务状态设置界面
	 */
	private createTaskStatusSettings(containerEl: HTMLElement): void {
		const desc = containerEl.createEl('div', {
			cls: 'setting-item-description',
			text: '配置任务状态的颜色和样式。支持 7 种默认状态和自定义状态。'
		});
		desc.style.marginBottom = '16px';

		// 默认状态列表
		const defaultStatusesDiv = containerEl.createDiv();
		defaultStatusesDiv.createEl('h3', { text: '默认状态', cls: 'setting-item-heading' });

		DEFAULT_TASK_STATUSES.forEach((status) => {
			this.createSingleStatusSetting(defaultStatusesDiv, status);
		});

		// 自定义状态部分
		const customStatusesDiv = containerEl.createDiv();
		customStatusesDiv.createEl('h3', { text: '自定义状态', cls: 'setting-item-heading' });

		// 获取自定义状态数量
		const customStatuses = this.plugin.settings.taskStatuses.filter(s => !s.isDefault);
		const customCount = customStatuses.length;
		const maxCustom = 3;

		// 显示自定义状态数量提示
		const countInfo = customStatusesDiv.createEl('div', {
			cls: 'setting-item-description',
			text: `已添加 ${customCount}/${maxCustom} 个自定义状态`
		});
		countInfo.style.marginBottom = '12px';

		// 渲染现有自定义状态
		customStatuses.forEach((status) => {
			this.createSingleStatusSetting(customStatusesDiv, status, true);
		});

		// 添加自定义状态按钮
		if (customCount < maxCustom) {
			const addButton = new Setting(customStatusesDiv)
				.setName('添加自定义状态')
				.setDesc('创建一个新的任务状态')
				.addButton(button => button
					.setButtonText('添加')
					.setCta()
					.onClick(() => {
						this.showAddCustomStatusModal(containerEl);
					}));
			addButton.settingEl.style.marginTop = '16px';
		}
	}

	/**
	 * 创建单个状态设置项
	 */
	private createSingleStatusSetting(
		containerEl: HTMLElement,
		status: TaskStatus,
		isCustom: boolean = false
	): void {
		const statusDiv = containerEl.createDiv();
		statusDiv.addClass('task-status-setting-item');
		statusDiv.style.display = 'flex';
		statusDiv.style.flexWrap = 'wrap';
		statusDiv.style.alignItems = 'center';
		statusDiv.style.gap = '12px';
		statusDiv.style.padding = '12px';
		statusDiv.style.marginBottom = '8px';
		statusDiv.style.background = 'var(--background-secondary)';
		statusDiv.style.borderRadius = '6px';

		// 状态图标（复选框示例）
		const iconDiv = statusDiv.createEl('div');
		iconDiv.style.display = 'flex';
		iconDiv.style.alignItems = 'center';
		iconDiv.style.justifyContent = 'center';
		iconDiv.style.width = '40px';
		iconDiv.style.height = '28px';
		iconDiv.style.border = `2px solid ${status.checkboxColor}`;
		iconDiv.style.borderRadius = this.getBorderRadiusForIconStyle(status.checkboxIcon);
		iconDiv.style.background = status.checkboxIcon === 'filled' ? status.checkboxColor : status.backgroundColor;
		iconDiv.style.color = status.checkboxIcon === 'filled' ? '#FFFFFF' : status.textColor;
		iconDiv.style.fontSize = '10px';
		iconDiv.style.fontWeight = 'bold';
		iconDiv.textContent = `[${status.symbol}]`;

		// 状态信息
		const infoDiv = statusDiv.createEl('div');
		infoDiv.style.flex = '1';
		infoDiv.style.minWidth = '120px';
		infoDiv.createEl('div', {
			text: `${status.name} (${status.key})`,
			cls: 'task-status-name'
		});
		infoDiv.createEl('div', {
			text: status.description,
			cls: 'setting-item-description'
		}).style.fontSize = '12px';

		// 卡片颜色选择区域
		const cardColorDiv = statusDiv.createEl('div');
		cardColorDiv.style.display = 'flex';
		cardColorDiv.style.alignItems = 'center';
		cardColorDiv.style.gap = '8px';
		cardColorDiv.style.paddingRight = '12px';
		cardColorDiv.style.borderRight = '1px solid var(--background-modifier-border)';

		// 背景色选择
		const bgLabel = cardColorDiv.createEl('span', {
			text: '背景',
			cls: 'setting-item-description'
		});
		bgLabel.style.fontSize = '11px';

		const bgColorPicker = cardColorDiv.createEl('input', {
			type: 'color',
			cls: 'task-status-color-input'
		}) as HTMLInputElement;
		bgColorPicker.value = status.backgroundColor;
		bgColorPicker.style.width = '32px';
		bgColorPicker.style.height = '28px';
		bgColorPicker.style.border = 'none';
		bgColorPicker.style.padding = '0';
		bgColorPicker.style.cursor = 'pointer';
		bgColorPicker.addEventListener('change', async () => {
			const statusIndex = this.plugin.settings.taskStatuses.findIndex(s => s.key === status.key);
			if (statusIndex !== -1) {
				this.plugin.settings.taskStatuses[statusIndex].backgroundColor = bgColorPicker.value;
				await this.plugin.saveSettings();
				this.plugin.refreshCalendarViews();
			}
		});

		// 马卡龙配色背景色
		const bgMacaronDiv = cardColorDiv.createEl('div');
		bgMacaronDiv.style.display = 'flex';
		bgMacaronDiv.style.gap = '4px';
		MACARON_COLORS.slice(0, 10).forEach(color => {
			const swatch = bgMacaronDiv.createEl('div');
			swatch.style.width = '16px';
			swatch.style.height = '16px';
			swatch.style.borderRadius = '2px';
			swatch.style.cursor = 'pointer';
			swatch.style.backgroundColor = color;
			swatch.style.border = color === status.backgroundColor ? '2px solid #000' : '1px solid var(--background-modifier-border)';
			swatch.addEventListener('click', async () => {
				bgColorPicker.value = swatch.style.backgroundColor || color;
				const statusIndex = this.plugin.settings.taskStatuses.findIndex(s => s.key === status.key);
				if (statusIndex !== -1) {
					this.plugin.settings.taskStatuses[statusIndex].backgroundColor = color;
					await this.plugin.saveSettings();
					this.plugin.refreshCalendarViews();
					this.display();
				}
			});
		});

		// 文字色选择
		const textLabel = cardColorDiv.createEl('span', {
			text: '文字',
			cls: 'setting-item-description'
		});
		textLabel.style.fontSize = '11px';
		textLabel.style.marginLeft = '8px';

		const textColorPicker = cardColorDiv.createEl('input', {
			type: 'color',
			cls: 'task-status-color-input'
		}) as HTMLInputElement;
		textColorPicker.value = status.textColor;
		textColorPicker.style.width = '32px';
		textColorPicker.style.height = '28px';
		textColorPicker.style.border = 'none';
		textColorPicker.style.padding = '0';
		textColorPicker.style.cursor = 'pointer';
		textColorPicker.addEventListener('change', async () => {
			const statusIndex = this.plugin.settings.taskStatuses.findIndex(s => s.key === status.key);
			if (statusIndex !== -1) {
				this.plugin.settings.taskStatuses[statusIndex].textColor = textColorPicker.value;
				await this.plugin.saveSettings();
				this.plugin.refreshCalendarViews();
			}
		});

		// 复选框样式配置区域
		const checkboxStyleDiv = statusDiv.createEl('div');
		checkboxStyleDiv.style.display = 'flex';
		checkboxStyleDiv.style.alignItems = 'center';
		checkboxStyleDiv.style.gap = '8px';

		// 复选框颜色
		const checkboxColorLabel = checkboxStyleDiv.createEl('span', {
			text: '复选框',
			cls: 'setting-item-description'
		});
		checkboxColorLabel.style.fontSize = '11px';

		const checkboxColorPicker = checkboxStyleDiv.createEl('input', {
			type: 'color',
			cls: 'task-status-color-input'
		}) as HTMLInputElement;
		checkboxColorPicker.value = status.checkboxColor;
		checkboxColorPicker.style.width = '32px';
		checkboxColorPicker.style.height = '28px';
		checkboxColorPicker.style.border = 'none';
		checkboxColorPicker.style.padding = '0';
		checkboxColorPicker.style.cursor = 'pointer';
		checkboxColorPicker.addEventListener('change', async () => {
			const statusIndex = this.plugin.settings.taskStatuses.findIndex(s => s.key === status.key);
			if (statusIndex !== -1) {
				this.plugin.settings.taskStatuses[statusIndex].checkboxColor = checkboxColorPicker.value;
				await this.plugin.saveSettings();
				this.plugin.refreshCalendarViews();
				this.display();
			}
		});

		// 复选框图标样式选择
		const iconStyleSelect = checkboxStyleDiv.createEl('select') as HTMLSelectElement;
		iconStyleSelect.style.padding = '4px 8px';
		iconStyleSelect.style.borderRadius = '4px';
		iconStyleSelect.style.border = '1px solid var(--background-modifier-border)';
		iconStyleSelect.style.background = 'var(--background-primary)';
		iconStyleSelect.style.color = 'var(--text-normal)';
		iconStyleSelect.style.cursor = 'pointer';

		const iconOptions: { value: CheckboxIconStyle; label: string }[] = [
			{ value: 'square', label: '方形' },
			{ value: 'circle', label: '圆形' },
			{ value: 'rounded', label: '圆角' },
			{ value: 'minimal', label: '极简' },
			{ value: 'filled', label: '填充' },
		];

		iconOptions.forEach(option => {
			const optEl = iconStyleSelect.createEl('option');
			optEl.value = option.value;
			optEl.textContent = option.label;
			if (option.value === status.checkboxIcon) {
				optEl.selected = true;
			}
		});

		iconStyleSelect.addEventListener('change', async () => {
			const statusIndex = this.plugin.settings.taskStatuses.findIndex(s => s.key === status.key);
			if (statusIndex !== -1) {
				this.plugin.settings.taskStatuses[statusIndex].checkboxIcon = iconStyleSelect.value as CheckboxIconStyle;
				await this.plugin.saveSettings();
				this.plugin.refreshCalendarViews();
				this.display();
			}
		});

		// 删除按钮（仅自定义状态）
		if (isCustom) {
			const deleteButton = statusDiv.createEl('button');
			deleteButton.textContent = '删除';
			deleteButton.style.marginLeft = 'auto';
			deleteButton.style.padding = '4px 12px';
			deleteButton.style.fontSize = '12px';
			deleteButton.style.borderRadius = '4px';
			deleteButton.style.border = '1px solid var(--background-modifier-border)';
			deleteButton.style.background = 'transparent';
			deleteButton.style.color = 'var(--text-muted)';
			deleteButton.style.cursor = 'pointer';
			deleteButton.addEventListener('click', async () => {
				// 删除自定义状态
				this.plugin.settings.taskStatuses = this.plugin.settings.taskStatuses.filter(s => s.key !== status.key);
				await this.plugin.saveSettings();
				this.plugin.refreshCalendarViews();
				this.display();
			});
			deleteButton.addEventListener('mouseenter', () => {
				deleteButton.style.background = 'var(--interactive-accent)';
				deleteButton.style.color = 'var(--text-on-accent)';
			});
			deleteButton.addEventListener('mouseleave', () => {
				deleteButton.style.background = 'transparent';
				deleteButton.style.color = 'var(--text-muted)';
			});
		}
	}

	/**
	 * 根据图标样式获取对应的圆角值
	 */
	private getBorderRadiusForIconStyle(style: CheckboxIconStyle): string {
		switch (style) {
			case 'circle':
				return '50%';
			case 'rounded':
				return '6px';
			case 'minimal':
				return '0px';
			case 'filled':
				return '4px';
			case 'square':
			default:
				return '2px';
		}
	}

	/**
	 * 显示添加自定义状态模态框
	 */
	private showAddCustomStatusModal(containerEl: HTMLElement): void {
		const modal = new SettingModal(this.app, this.plugin);
		modal.open();
	}
}

/**
 * 添加自定义状态模态框
 */
class SettingModal extends Modal {
	private plugin: GanttCalendarPlugin;
	private nameInput: HTMLInputElement;
	private keyInput: HTMLInputElement;
	private symbolInput: HTMLInputElement;
	private descInput: HTMLTextAreaElement;
	private bgColorInput: HTMLInputElement;
	private textColorInput: HTMLInputElement;
	private checkboxColorInput: HTMLInputElement;
	private checkboxIconSelect: HTMLSelectElement;
	private nameError: HTMLElement;
	private symbolError: HTMLElement;

	constructor(app: App, plugin: GanttCalendarPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('gantt-status-modal');

		contentEl.createEl('h2', { text: '添加自定义状态' });

		// 状态名称
		const nameContainer = contentEl.createDiv();
		nameContainer.style.marginBottom = '16px';
		nameContainer.createEl('label', { text: '状态名称:' });
		this.nameInput = nameContainer.createEl('input', {
			type: 'text',
			placeholder: '例如：等待审核'
		});
		this.nameInput.style.width = '100%';
		this.nameInput.style.marginTop = '8px';
		this.nameInput.style.padding = '8px';
		this.nameInput.style.borderRadius = '4px';
		this.nameInput.style.border = '1px solid var(--background-modifier-border)';

		// 状态 Key
		const keyContainer = contentEl.createDiv();
		keyContainer.style.marginBottom = '16px';
		keyContainer.createEl('label', { text: '状态标识 (英文):' });
		this.keyInput = keyContainer.createEl('input', {
			type: 'text',
			placeholder: '例如：pending_review'
		});
		this.keyInput.style.width = '100%';
		this.keyInput.style.marginTop = '8px';
		this.keyInput.style.padding = '8px';
		this.keyInput.style.borderRadius = '4px';
		this.keyInput.style.border = '1px solid var(--background-modifier-border)';

		// 状态符号
		const symbolContainer = contentEl.createDiv();
		symbolContainer.style.marginBottom = '16px';
		symbolContainer.createEl('label', { text: '复选框符号 (单个字符):' });
		symbolContainer.createEl('div', {
			text: '只能使用字母或数字，不能使用默认状态的符号 (空格, x, !, -, /, ?, n)',
			cls: 'setting-item-description'
		}).style.fontSize = '11px';
		this.symbolInput = symbolContainer.createEl('input', {
			type: 'text',
			placeholder: '例如：p'
		});
		this.symbolInput.style.width = '100%';
		this.symbolInput.style.marginTop = '8px';
		this.symbolInput.style.padding = '8px';
		this.symbolInput.style.borderRadius = '4px';
		this.symbolInput.style.border = '1px solid var(--background-modifier-border)';
		this.symbolInput.maxLength = 1;
		this.symbolError = symbolContainer.createEl('div', {
			cls: 'setting-item-description'
		});
		this.symbolError.style.color = 'var(--text-error)';
		this.symbolError.style.marginTop = '4px';

		// 状态描述
		const descContainer = contentEl.createDiv();
		descContainer.style.marginBottom = '16px';
		descContainer.createEl('label', { text: '状态描述:' });
		this.descInput = descContainer.createEl('textarea', {
			placeholder: '描述此状态的用途'
		});
		this.descInput.style.width = '100%';
		this.descInput.style.marginTop = '8px';
		this.descInput.style.padding = '8px';
		this.descInput.style.borderRadius = '4px';
		this.descInput.style.border = '1px solid var(--background-modifier-border)';
		this.descInput.rows = 2;

		// 卡片颜色选择
		const colorContainer = contentEl.createDiv();
		colorContainer.style.marginBottom = '16px';
		colorContainer.style.display = 'flex';
		colorContainer.style.gap = '24px';

		// 背景色
		const bgColorDiv = colorContainer.createDiv();
		bgColorDiv.createEl('label', { text: '卡片背景颜色:' });
		this.bgColorInput = bgColorDiv.createEl('input', { type: 'color', value: '#FFFFFF' });
		this.bgColorInput.style.width = '60px';
		this.bgColorInput.style.height = '36px';
		this.bgColorInput.style.border = 'none';
		this.bgColorInput.style.padding = '0';
		this.bgColorInput.style.cursor = 'pointer';

		// 文字颜色
		const textColorDiv = colorContainer.createDiv();
		textColorDiv.createEl('label', { text: '卡片文字颜色:' });
		this.textColorInput = textColorDiv.createEl('input', { type: 'color', value: '#333333' });
		this.textColorInput.style.width = '60px';
		this.textColorInput.style.height = '36px';
		this.textColorInput.style.border = 'none';
		this.textColorInput.style.padding = '0';
		this.textColorInput.style.cursor = 'pointer';

		// 马卡龙配色
		const macaronContainer = contentEl.createDiv();
		macaronContainer.style.marginBottom = '16px';
		macaronContainer.createEl('label', { text: '快速选择卡片背景颜色:' });
		const macaronGrid = macaronContainer.createDiv();
		macaronGrid.style.display = 'grid';
		macaronGrid.style.gridTemplateColumns = 'repeat(10, 1fr)';
		macaronGrid.style.gap = '6px';
		macaronGrid.style.marginTop = '8px';
		MACARON_COLORS.forEach(color => {
			const swatch = macaronGrid.createEl('div');
			swatch.style.width = '24px';
			swatch.style.height = '24px';
			swatch.style.borderRadius = '4px';
			swatch.style.cursor = 'pointer';
			swatch.style.backgroundColor = color;
			swatch.style.border = '1px solid var(--background-modifier-border)';
			swatch.addEventListener('click', () => {
				this.bgColorInput.value = color;
			});
		});

		// 复选框样式配置
		const checkboxStyleContainer = contentEl.createDiv();
		checkboxStyleContainer.style.marginBottom = '16px';
		checkboxStyleContainer.style.display = 'flex';
		checkboxStyleContainer.style.gap = '24px';

		// 复选框颜色
		const checkboxColorDiv = checkboxStyleContainer.createDiv();
		checkboxColorDiv.createEl('label', { text: '复选框颜色:' });
		this.checkboxColorInput = checkboxColorDiv.createEl('input', { type: 'color', value: '#999999' });
		this.checkboxColorInput.style.width = '60px';
		this.checkboxColorInput.style.height = '36px';
		this.checkboxColorInput.style.border = 'none';
		this.checkboxColorInput.style.padding = '0';
		this.checkboxColorInput.style.cursor = 'pointer';

		// 复选框图标样式
		const checkboxIconDiv = checkboxStyleContainer.createDiv();
		checkboxIconDiv.createEl('label', { text: '复选框样式:' });
		this.checkboxIconSelect = checkboxIconDiv.createEl('select') as HTMLSelectElement;
		this.checkboxIconSelect.style.width = '120px';
		this.checkboxIconSelect.style.height = '36px';
		this.checkboxIconSelect.style.padding = '4px 8px';
		this.checkboxIconSelect.style.borderRadius = '4px';
		this.checkboxIconSelect.style.border = '1px solid var(--background-modifier-border)';
		this.checkboxIconSelect.style.background = 'var(--background-primary)';
		this.checkboxIconSelect.style.color = 'var(--text-normal)';
		this.checkboxIconSelect.style.cursor = 'pointer';

		const iconOptions: { value: CheckboxIconStyle; label: string }[] = [
			{ value: 'square', label: '方形' },
			{ value: 'circle', label: '圆形' },
			{ value: 'rounded', label: '圆角' },
			{ value: 'minimal', label: '极简' },
			{ value: 'filled', label: '填充' },
		];

		iconOptions.forEach(option => {
			const optEl = this.checkboxIconSelect.createEl('option');
			optEl.value = option.value;
			optEl.textContent = option.label;
		});

		// 按钮容器
		const buttonContainer = contentEl.createDiv();
		buttonContainer.style.display = 'flex';
		buttonContainer.style.justifyContent = 'flex-end';
		buttonContainer.style.gap = '12px';
		buttonContainer.style.marginTop = '24px';

		// 取消按钮
		const cancelButton = buttonContainer.createEl('button', { text: '取消' });
		cancelButton.style.padding = '8px 20px';
		cancelButton.style.borderRadius = '6px';
		cancelButton.style.border = '1px solid var(--background-modifier-border)';
		cancelButton.style.background = 'transparent';
		cancelButton.style.cursor = 'pointer';
		cancelButton.addEventListener('click', () => this.close());

		// 添加按钮
		const addButton = buttonContainer.createEl('button', { text: '添加' });
		addButton.style.padding = '8px 20px';
		addButton.style.borderRadius = '6px';
		addButton.style.border = 'none';
		addButton.style.background = 'var(--interactive-accent)';
		addButton.style.color = 'var(--text-on-accent)';
		addButton.style.cursor = 'pointer';
		addButton.addEventListener('click', () => this.addCustomStatus());
	}

	private addCustomStatus() {
		const name = this.nameInput.value.trim();
		const key = this.keyInput.value.trim();
		const symbol = this.symbolInput.value.trim();
		const description = this.descInput.value.trim();
		const backgroundColor = this.bgColorInput.value;
		const textColor = this.textColorInput.value;
		const checkboxColor = this.checkboxColorInput.value;
		const checkboxIcon = this.checkboxIconSelect.value as CheckboxIconStyle;

		// 验证
		if (!name) {
			this.nameError?.remove();
			if (this.nameInput.parentElement) {
				const error = this.nameInput.parentElement.createEl('div', {
					text: '请输入状态名称',
					cls: 'setting-item-description'
				});
				if (error.style) {
					error.style.color = 'var(--text-error)';
					error.style.marginTop = '4px';
				}
			}
			return;
		}

		if (!key) {
			return;
		}

		if (!symbol) {
			this.symbolError.textContent = '请输入复选框符号';
			return;
		}

		// 验证符号
		const validation = validateStatusSymbol(symbol, true);
		if (!validation.valid) {
			this.symbolError.textContent = validation.error || '符号无效';
			return;
		}

		// 检查 key 是否重复
		if (this.plugin.settings.taskStatuses.some(s => s.key === key)) {
			if (this.keyInput.parentElement) {
				const keyError = this.keyInput.parentElement.createEl('div', {
					text: '状态标识已存在',
					cls: 'setting-item-description'
				});
				if (keyError.style) {
					keyError.style.color = 'var(--text-error)';
				}
			}
			return;
		}

		// 添加新状态
		const newStatus: TaskStatus = {
			key,
			symbol,
			name,
			description: description || '自定义状态',
			backgroundColor,
			textColor,
			checkboxColor,
			checkboxIcon,
			isDefault: false
		};

		this.plugin.settings.taskStatuses.push(newStatus);
		this.plugin.saveSettings();
		this.plugin.refreshCalendarViews();
		this.close();

		// 刷新设置界面 - 重新调用 display
		// 由于 Modal 和 SettingTab 在不同的上下文中，这里直接关闭即可
		// 用户可以手动刷新设置页面查看新状态
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
