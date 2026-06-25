import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import { TaskStatusCard } from '../components';
import { AddCustomStatusModal, EditCustomStatusModal } from '../modals';
import { SettingsStatusCardClasses, setCssProps } from '../../utils/bem';
import type { BuilderConfig } from '../types';
import type { TaskStatus } from '../../tasks/taskStatus';
import { i18n } from '../../i18n/i18n';

export class TaskStatusSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		this.createSettingGroup(i18n.t('settings.taskStatus.groupTitle'), (group) => {
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
				setting.setName(i18n.t('settings.taskStatus.defaultStatus.name'))
					.setDesc(i18n.t('settings.taskStatus.defaultStatus.description'));
				setting.controlEl.remove();
				setCssProps(setting.settingEl, { flexDirection: 'column', alignItems: 'flex-start' });

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

			addSetting(setting => {
				setting.setName(i18n.t('settings.taskStatus.addCustom.name'))
					.setDesc(i18n.t('settings.taskStatus.addCustom.description', { count: customStatuses.length }))
					.addButton(button => button
						.setButtonText(i18n.t('settings.taskStatus.addCustom.button'))
						.setCta()
						.onClick(() => {
							new AddCustomStatusModal(this.plugin.app, this.plugin, () => {
								void this.onRefreshSettings?.();
							}).open();
						}));
			});

			if (customStatuses.length > 0) {
				addSetting(setting => {
					setting.setName(i18n.t('settings.taskStatus.customStatus.name'))
						.setDesc(i18n.t('settings.taskStatus.customStatus.description'));
					setting.controlEl.remove();
					setCssProps(setting.settingEl, { flexDirection: 'column', alignItems: 'flex-start' });

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
