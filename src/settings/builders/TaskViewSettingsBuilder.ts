import { Setting, TFolder } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig } from '../types';

/**
 * 任务视图设置构建器
 */
export class TaskViewSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		// ===== 任务视图设置 =====
		this.containerEl.createEl('h1', { text: '任务视图设置' });

		// 全局任务筛选标记
		new Setting(this.containerEl)
			.setName('全局任务筛选标记')
			.setDesc('用于标记任务的前缀符号或文字（如 "🎯 " 或 "TODO"）')
			.addText(text => text
				.setPlaceholder('空则不使用筛选')
				.setValue(this.plugin.settings.globalTaskFilter)
				.onChange(async (value) => {
					this.plugin.settings.globalTaskFilter = value;
					await this.saveAndRefresh();
				}));

		// 启用的任务格式
		new Setting(this.containerEl)
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
					await this.saveAndRefresh();
				});
			});

		// 任务文本是否显示 Global Filter
		new Setting(this.containerEl)
			.setName('任务文本显示 Global Filter')
			.setDesc('在任务列表中文本前显示全局筛选前缀（如 🎯）。关闭则仅显示任务描述')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showGlobalFilterInTaskText)
				.onChange(async (value) => {
					this.plugin.settings.showGlobalFilterInTaskText = value;
					await this.saveAndRefresh();
				}));

		// 任务笔记文件夹路径
		new Setting(this.containerEl)
			.setName('任务笔记文件夹路径')
			.setDesc('从任务创建笔记时的默认存放路径（相对于库根目录）')
			.addText(text => text
				.setPlaceholder('Tasks')
				.setValue(this.plugin.settings.taskNotePath)
				.onChange(async (value) => {
					this.plugin.settings.taskNotePath = value;
					await this.plugin.saveSettings();
				}));
	}
}
