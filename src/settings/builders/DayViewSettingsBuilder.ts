import { Setting, TFolder } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig } from '../types';

/**
 * 日视图设置构建器
 */
export class DayViewSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		// ===== 日视图设置 =====
		this.containerEl.createEl('h2', { text: '日视图设置' });

		// 显示 Daily Note 开关
		new Setting(this.containerEl)
			.setName('显示 Daily Note')
			.setDesc('在日视图中显示当天的 Daily Note 内容')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDailyNote)
				.onChange(async (value) => {
					this.plugin.settings.enableDailyNote = value;
					await this.plugin.saveSettings();
					// 重新渲染设置面板以显示/隐藏关联的设置
					// 注意：这里需要调用 SettingTab 的 display() 方法，但我们在构建器中没有直接访问
					// 解决方案：在 SettingTab 中监听设置变化并重新渲染
					this.plugin.refreshCalendarViews();
				}));

		// Daily Note 相关设置（仅在启用时显示）
		if (this.plugin.settings.enableDailyNote) {
			this.renderDailyNoteSettings();
		}
	}

	private renderDailyNoteSettings(): void {
		// 日视图布局选择
		new Setting(this.containerEl)
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
					await this.saveAndRefresh();
				}));

		// Daily Note 文件夹路径
		new Setting(this.containerEl)
			.setName('Daily Note 文件夹路径')
			.setDesc('指定存放 Daily Note 文件的文件夹路径（相对于库根目录）')
			.addText(text => {
				text
					.setPlaceholder('DailyNotes')
					.setValue(this.plugin.settings.dailyNotePath)
					.onChange(async (value) => {
						this.plugin.settings.dailyNotePath = value;
						await this.saveAndRefresh();
					});

				// 路径预测：使用 datalist 提供文件夹候选
				const inputEl = text.inputEl;
				const datalistId = `gantt-dailynote-folder-suggest-${Date.now()}`;
				inputEl.setAttr('list', datalistId);
				const datalist = inputEl.parentElement?.createEl('datalist');
				if (datalist) datalist.id = datalistId;

				const folders = this.plugin.app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder);
				const updateSuggestions = (query: string) => {
					if (!datalist) return;
					datalist.innerHTML = '';
					const lower = query.toLowerCase();
					folders
						.filter((f: TFolder) => f.path.toLowerCase().includes(lower))
						.slice(0, 50)
						.forEach((f: TFolder) => {
							const opt = datalist.createEl('option');
							opt.value = f.path;
						});
				};

				inputEl.addEventListener('focus', () => updateSuggestions(inputEl.value || ''));
				inputEl.addEventListener('input', () => updateSuggestions(inputEl.value || ''));
			});

		// Daily Note 文件名格式
		new Setting(this.containerEl)
			.setName('Daily Note 文件名格式')
			.setDesc('指定 Daily Note 文件名格式（如 yyyy-MM-dd，会在日视图中用当前日期自动替换）')
			.addText(text => text
				.setPlaceholder('yyyy-MM-dd')
				.setValue(this.plugin.settings.dailyNoteNameFormat)
				.onChange(async (value) => {
					this.plugin.settings.dailyNoteNameFormat = value;
					await this.saveAndRefresh();
				}));
	}
}
