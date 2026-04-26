import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig } from '../types';

/**
 * 侧边栏视图设置构建器
 */
export class SidebarViewSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		this.createSettingGroup('侧边栏设置', (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 显示复选框
			addSetting(setting =>
				setting.setName('显示复选框')
					.setDesc('在侧边栏任务卡片中显示任务复选框')
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.sidebarShowCheckbox)
						.onChange(async (value) => {
							this.plugin.settings.sidebarShowCheckbox = value;
							await this.saveAndRefresh();
						}))
			);

			// 显示任务标签
			addSetting(setting =>
				setting.setName('显示任务标签')
					.setDesc('在侧边栏任务卡片中显示任务标签')
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.sidebarShowTags)
						.onChange(async (value) => {
							this.plugin.settings.sidebarShowTags = value;
							await this.saveAndRefresh();
						}))
			);

			// 显示优先级
			addSetting(setting =>
				setting.setName('显示任务优先级')
					.setDesc('在侧边栏任务卡片中显示任务优先级图标')
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.sidebarShowPriority)
						.onChange(async (value) => {
							this.plugin.settings.sidebarShowPriority = value;
							await this.saveAndRefresh();
						}))
			);

			// 显示 ticktick
			addSetting(setting =>
				setting.setName('显示 Ticktick')
					.setDesc('在侧边栏任务卡片中显示 %%content%% ticktick 文本')
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.sidebarShowTicktick)
						.onChange(async (value) => {
							this.plugin.settings.sidebarShowTicktick = value;
							await this.saveAndRefresh();
						}))
			);

			// 显示文件位置
			addSetting(setting =>
				setting.setName('显示文件位置')
					.setDesc('在侧边栏任务卡片中显示任务所在的文件路径')
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.sidebarShowFileLocation)
						.onChange(async (value) => {
							this.plugin.settings.sidebarShowFileLocation = value;
							await this.saveAndRefresh();
						}))
			);

			// 显示截止日期
			addSetting(setting =>
				setting.setName('显示截止日期')
					.setDesc('在侧边栏任务卡片中显示任务截止日期')
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.sidebarShowDueDate)
						.onChange(async (value) => {
							this.plugin.settings.sidebarShowDueDate = value;
							await this.saveAndRefresh();
						}))
			);
		});
	}
}
