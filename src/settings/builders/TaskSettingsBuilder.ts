import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import { FolderSuggest } from '../components';
import type { BuilderConfig } from '../types';

/**
 * 任务设置构建器
 * 包含任务基础设置和任务创建设置
 * 任务状态设置由 TaskStatusSettingsBuilder 独立管理
 */
export class TaskSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		// ===== 任务基础 =====
		this.createSettingGroup('任务基础', (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 全局任务筛选标记
			addSetting(setting =>
				setting.setName('全局任务筛选标记(修改此设置后需重启 Obsidian 生效)')
					.setDesc('用于标记任务的前缀符号或文字（如 "🎯 ", "TODO ", "#task "）')
					.addText(text => text
						.setPlaceholder('空则不使用筛选')
						.setValue(this.plugin.settings.globalTaskFilter)
						.onChange(async (value) => {
							this.plugin.settings.globalTaskFilter = value.trim();
							await this.saveAndRefreshViews();
						}))
			);

			// 启用的任务格式
			addSetting(setting => {
				setting.setName('启用的任务格式')
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
							await this.saveAndRefreshViews();
						});
					});
			});

			// 任务文本是否显示 Global Filter
			addSetting(setting =>
				setting.setName('任务文本显示 Global Filter')
					.setDesc('在任务列表中文本前显示全局筛选前缀（如 🎯）。关闭则仅显示任务描述')
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.showGlobalFilterInTaskText)
						.onChange(async (value) => {
							this.plugin.settings.showGlobalFilterInTaskText = value;
							await this.saveAndRefreshViews();
						}))
			);

			// 任务笔记文件夹路径
			addSetting(setting =>
				setting.setName('任务笔记文件夹路径')
					.setDesc('从任务创建笔记时的默认存放路径（相对于库根目录）')
					.addSearch(cb => {
						new FolderSuggest(this.plugin.app, cb.inputEl);
						cb.setPlaceholder('Example: Tasks')
							.setValue(this.plugin.settings.taskNotePath)
							.onChange(async (value) => {
								const trimmed = value.trim().replace(/\/$/, '');
								this.plugin.settings.taskNotePath = trimmed;
								await this.saveAndRefreshViews();
							});
					})
			);
		});

		// ===== 任务创建 =====
		this.createSettingGroup('任务创建', (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 新任务所在标题
			addSetting(setting =>
				setting.setName('新任务所在标题')
					.setDesc('在 Daily Note 中添加新任务时的目标标题（留空则添加到文件末尾）')
					.addText(text => text
						.setPlaceholder('例如：## 工作任务')
						.setValue(this.plugin.settings.newTaskHeading || '')
						.onChange(async (value) => {
							this.plugin.settings.newTaskHeading = value || undefined;
							await this.saveAndRefreshViews();
						}))
			);

			// 默认任务优先级
			addSetting(setting =>
				setting.setName('默认任务优先级')
					.setDesc('创建新任务时的默认优先级')
					.addDropdown(drop => drop
						.addOptions({
							'highest': '🔺 最高',
							'high': '⏫ 高',
							'medium': '🔼 中',
							'low': '🔽 低',
							'lowest': '⏬ 最低',
							'normal': '无',
						})
						.setValue(this.plugin.settings.defaultTaskPriority || 'medium')
						.onChange(async (value) => {
							this.plugin.settings.defaultTaskPriority = value as any;
							await this.saveAndRefreshViews();
						}))
			);

			// 周期任务实例显示数量
			addSetting(setting =>
				setting.setName('周期任务实例显示数量')
					.setDesc('在周视图/月视图中，每个周期任务最多显示的未来虚拟实例数量。设置为 0 则不显示虚拟实例。')
					.addText(text => text
						.setPlaceholder('5')
						.setValue(String(this.plugin.settings.recurringTaskDisplayLimit ?? 5))
						.onChange(async (value) => {
							const num = parseInt(value);
							if (!isNaN(num) && num >= 0) {
								this.plugin.settings.recurringTaskDisplayLimit = num;
								await this.saveAndRefreshViews();
							}
						}))
			);
		});
	}
}
