import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import { TaskStatusCard } from '../components';
import { AddCustomStatusModal } from '../modals';
import type { BuilderConfig } from '../types';
import type { TaskStatus } from '../../tasks/taskStatus';

/**
 * 任务状态设置构建器
 */
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

			// 说明文字
			const desc = container.createEl('div', {
				cls: 'setting-item-description',
				text: '配置任务状态的颜色和样式。支持 7 种默认状态和最多 3 个自定义状态。'
			});
			desc.addClass('gc-task-status-desc');

			// ========== 默认状态 ==========
			addSetting(setting => {
				setting.setName('默认状态')
					.setDesc('内置的 7 种任务默认状态（不可删除）');
				setting.controlEl.remove();

				const gridContainer = setting.settingEl.createDiv('task-status-cards-grid');


				const defaultStatuses = this.plugin.settings.taskStatuses.filter((s: TaskStatus) => s.isDefault);
				defaultStatuses.forEach((status: TaskStatus) => {
					const card = new TaskStatusCard({
						container: gridContainer,
						plugin: this.plugin,
						status: status,
						onColorChange: async () => { await this.saveAndRefreshViews(); }
					});
					card.render();
				});
			});

			// ========== 自定义状态 ==========
			const customStatuses = this.plugin.settings.taskStatuses.filter((s: TaskStatus) => !s.isDefault);
			const customCount = customStatuses.length;
			const maxCustom = 3;

			// 添加按钮
			if (customCount < maxCustom) {
				addSetting(setting =>
					setting.setName('添加自定义状态')
						.setDesc(`创建一个新的任务状态（已添加 ${customCount}/${maxCustom} 个自定义状态）`)
						.addButton(button => button
							.setButtonText('添加')
							.setCta()
							.onClick(() => {
								this.showAddCustomStatusModal();
							}))
				);
			}

			// 自定义状态卡片
			if (customStatuses.length > 0) {
				addSetting(setting => {
					setting.setName('自定义状态')
						.setDesc('最多支持 3 个自定义状态');
					setting.controlEl.remove();

					const gridContainer = setting.settingEl.createDiv('task-status-cards-grid');


					customStatuses.forEach((status: TaskStatus) => {
						const card = new TaskStatusCard({
							container: gridContainer,
							plugin: this.plugin,
							status: status,
							onColorChange: async () => { await this.saveAndRefreshViews(); },
							onDelete: async () => {
								this.plugin.settings.taskStatuses = this.plugin.settings.taskStatuses.filter((s: TaskStatus) => s.key !== status.key);
								await this.saveAndRefreshAll();
							}
						});
						card.render();
					});
				});
			}
		});
	}

	/**
	 * 显示添加自定义状态模态框
	 */
	private showAddCustomStatusModal(): void {
		const modal = new AddCustomStatusModal(this.plugin.app, this.plugin, () => {
			this.onRefreshSettings?.();
		});
		modal.open();
	}
}
