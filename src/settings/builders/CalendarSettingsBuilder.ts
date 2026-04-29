import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import { FolderSuggest, FileSuggest } from '../components';
import type { BuilderConfig } from '../types';
import { getObsidianDailyNoteSettings, isObsidianDailyNoteAvailable } from '../../utils/dailyNoteSettingsBridge';

/**
 * 日历设置构建器
 * 包含 Daily Note 相关的基础配置（文件夹路径、文件名格式、模板等）
 */
export class CalendarSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		this.createSettingGroup('Daily Notes', (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 用于包裹可切换的设置区域
			const obsidianSection = this.containerEl.createDiv();
			const manualSection = this.containerEl.createDiv();

			const updateVisibility = () => {
				obsidianSection.classList.toggle('gc-settings-section-hidden', !this.plugin.settings.followObsidianDailyNote);
				manualSection.classList.toggle('gc-settings-section-hidden', this.plugin.settings.followObsidianDailyNote);
			};

			// 使用 Obsidian 日记设置开关
			addSetting(setting =>
				setting.setName('使用 Obsidian 日记设置')
					.setDesc('读取核心"日记"插件或"Periodic Notes"插件的文件夹和格式设置，无需手动配置')
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.followObsidianDailyNote)
						.onChange(async (value) => {
							this.plugin.settings.followObsidianDailyNote = value;
							await this.saveAndRefreshViews();
							updateVisibility();
						}))
			);

			// === Obsidian 模式设置（只读） ===
			const available = isObsidianDailyNoteAvailable();
			if (available) {
				const obsidianSettings = getObsidianDailyNoteSettings();
				const folder = obsidianSettings.folder || '(根目录)';
				const format = obsidianSettings.format || 'YYYY-MM-DD';
				const template = obsidianSettings.template || '(无)';

				new Setting(obsidianSection)
					.setName('日记文件夹')
					.setDesc('来自 Obsidian 日记设置（只读）')
					.addText(text => text.setValue(folder).setDisabled(true));

				new Setting(obsidianSection)
					.setName('文件名格式')
					.setDesc(`Moment.js 格式（只读）: ${format}`)
					.addText(text => text.setValue(format).setDisabled(true));

				new Setting(obsidianSection)
					.setName('模板')
					.setDesc(template)
					.addText(text => text.setValue(template).setDisabled(true));
			} else {
				new Setting(obsidianSection)
					.setName('未检测到日记插件')
					.setDesc('请启用 Obsidian 核心"日记"插件或安装"Periodic Notes"社区插件');
			}

			// === 手动模式设置 ===
			new Setting(manualSection)
				.setName('Daily Note 文件夹路径')
				.setDesc('指定存放 Daily Note 文件的文件夹路径（相对于库根目录）')
				.addSearch(cb => {
					new FolderSuggest(this.plugin.app, cb.inputEl);
					cb.setPlaceholder('Example: DailyNotes')
						.setValue(this.plugin.settings.dailyNotePath)
						.onChange(async (value) => {
							const trimmed = value.trim().replace(/\/$/, '');
							this.plugin.settings.dailyNotePath = trimmed;
							await this.saveAndRefreshViews();
						});
				});

			new Setting(manualSection)
				.setName('Daily Note 文件名格式')
				.setDesc('指定 Daily Note 文件名格式（如 yyyy-MM-dd，会在日视图中用当前日期自动替换）')
				.addText(text => text
					.setPlaceholder('yyyy-MM-dd')
					.setValue(this.plugin.settings.dailyNoteNameFormat)
					.onChange(async (value) => {
						this.plugin.settings.dailyNoteNameFormat = value;
						await this.saveAndRefreshViews();
					}));

			new Setting(manualSection)
				.setName('Daily Note 模板文件路径')
				.setDesc('创建 Daily Note 时使用的模板文件路径（留空则创建空文件）')
				.addSearch(cb => {
					new FileSuggest(this.plugin.app, cb.inputEl);
					cb.setPlaceholder('Templates/Daily Note.md')
						.setValue(this.plugin.settings.dailyNoteTemplatePath)
						.onChange(async (value) => {
							this.plugin.settings.dailyNoteTemplatePath = value.trim();
							await this.saveAndRefreshViews();
						});
				});

			// 初始显隐
			updateVisibility();
		});
	}
}
