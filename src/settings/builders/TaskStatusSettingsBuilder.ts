import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import { TaskStatusCard } from '../components';
import { AddCustomStatusModal, EditCustomStatusModal } from '../modals';
import { SettingsStatusCardClasses } from '../../utils/bem';
import type { BuilderConfig } from '../types';
import type { TaskStatus } from '../../tasks/taskStatus';

export class TaskStatusSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		this.createSettingGroup('任务状态', (group) => {
			const container = group instanceof HTMLElement ? group : this.containerEl;
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(container));
				}
			};

			const cls = SettingsStatusCardClasses.elements;

			// ── 默认状态 ──
			addSetting(setting => {
				setting.setName('默认状态')
					.setDesc('待办和已完成为核心状态，不可删除');
				setting.controlEl.remove();
				setting.settingEl.style.flexDirection = 'column';
				setting.settingEl.style.alignItems = 'flex-start';

				const grid = setting.settingEl.createDiv(cls.grid);
				const defaultStatuses = this.plugin.settings.taskStatuses.filter((s: TaskStatus) => s.isDefault);
				defaultStatuses.forEach((status: TaskStatus) => {
					new TaskStatusCard({
						container: grid,
						plugin: this.plugin,
						status,
						onColorChange: async () => { await this.saveAndRefreshViews(); },
					}).render();
				});
			});

			// ── 自定义状态 ──
			const customStatuses = this.plugin.settings.taskStatuses.filter((s: TaskStatus) => !s.isDefault);

			addSetting(setting =>
				setting.setName('添加自定义状态')
					.setDesc(`已添加 ${customStatuses.length} 个自定义状态`)
					.addButton(button => button
						.setButtonText('添加')
						.setCta()
						.onClick(() => {
							new AddCustomStatusModal(this.plugin.app, this.plugin, () => {
								this.onRefreshSettings?.();
							}).open();
						}))
			);

			if (customStatuses.length > 0) {
				addSetting(setting => {
					setting.setName('自定义状态')
						.setDesc('可自由修改颜色或删除，点击 ✎ 编辑');
					setting.controlEl.remove();
					setting.settingEl.style.flexDirection = 'column';
					setting.settingEl.style.alignItems = 'flex-start';

					const grid = setting.settingEl.createDiv(cls.grid);
					customStatuses.forEach((status: TaskStatus) => {
						new TaskStatusCard({
							container: grid,
							plugin: this.plugin,
							status,
							onColorChange: async () => { await this.saveAndRefreshViews(); },
							onEdit: () => {
								new EditCustomStatusModal(this.plugin.app, this.plugin, status, () => {
									this.onRefreshSettings?.();
								}).open();
							},
							onDelete: async () => {
								this.plugin.settings.taskStatuses = this.plugin.settings.taskStatuses.filter((s: TaskStatus) => s.key !== status.key);
								await this.saveAndRefreshAll();
							},
						}).render();
					});
				});
			}
		});
	}
}
