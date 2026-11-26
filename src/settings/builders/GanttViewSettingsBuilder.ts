import { Setting } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import { FolderSuggest } from '../components';
import type { BuilderConfig, DateFieldType } from '../types';
import { i18n } from '../../i18n/i18n';
import { RegularExpressions } from '../../utils/RegularExpressions';

/**
 * 甘特图构建器
 */
export class GanttViewSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		this.createSettingGroup(i18n.t('settings.ganttView.groupTitle'), (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				group.addSetting(cb);
			};

			// 起始字段
			addSetting(setting => {
				setting.setName(i18n.t('settings.ganttView.startField.name'))
					.setDesc(i18n.t('settings.ganttView.startField.description'))
					.addDropdown(drop => drop
						.addOptions({
						'createdDate': i18n.t('settings.ganttView.dateFieldOptions.createdDate'),
						'startDate': i18n.t('settings.ganttView.dateFieldOptions.startDate'),
						'scheduledDate': i18n.t('settings.ganttView.dateFieldOptions.scheduledDate'),
						'dueDate': i18n.t('settings.ganttView.dateFieldOptions.dueDate'),
						'completionDate': i18n.t('settings.ganttView.dateFieldOptions.completionDate'),
						'cancelledDate': i18n.t('settings.ganttView.dateFieldOptions.cancelledDate'),
						})
						.setValue(this.plugin.settings.ganttStartField)
						.onChange((value) => {
							void (async () => {
								this.plugin.settings.ganttStartField = value as DateFieldType;
								await this.saveAndRefreshViews();
							})();
						}));
			});

			// 结束字段
			addSetting(setting => {
				setting.setName(i18n.t('settings.ganttView.endField.name'))
					.setDesc(i18n.t('settings.ganttView.endField.description'))
					.addDropdown(drop => drop
						.addOptions({
						'createdDate': i18n.t('settings.ganttView.dateFieldOptions.createdDate'),
						'startDate': i18n.t('settings.ganttView.dateFieldOptions.startDate'),
						'scheduledDate': i18n.t('settings.ganttView.dateFieldOptions.scheduledDate'),
						'dueDate': i18n.t('settings.ganttView.dateFieldOptions.dueDate'),
						'completionDate': i18n.t('settings.ganttView.dateFieldOptions.completionDate'),
						'cancelledDate': i18n.t('settings.ganttView.dateFieldOptions.cancelledDate'),
						})
						.setValue(this.plugin.settings.ganttEndField)
						.onChange((value) => {
							void (async () => {
								this.plugin.settings.ganttEndField = value as DateFieldType;
								await this.saveAndRefreshViews();
							})();
						}));
			});

			// 甘特图树形根目录（仅用于甘特图树形分组，不限制全库扫描）
			addSetting(setting => {
				setting.setName(i18n.t('settings.ganttView.rootFolder.name'))
					.setDesc(i18n.t('settings.ganttView.rootFolder.description'))
					.addSearch(cb => {
						new FolderSuggest(this.plugin.app, cb.inputEl);
						cb.setPlaceholder(i18n.t('settings.ganttView.rootFolder.placeholder'))
							.setValue(this.plugin.settings.ganttRootFolder || '')
							.onChange((value) => {
								const normalized = value.trim().replace(
									RegularExpressions.MarkdownLexical.leadingTrailingSlashRegex,
									''
								);
								this.plugin.settings.ganttRootFolder = normalized;
								void this.saveAndRefreshViews();
							});
					});
			});

			// 拖拽父任务时联动平移子任务（默认关闭，按需开启）
			addSetting(setting => {
				setting.setName(i18n.t('settings.ganttView.cascadeParentDrag.name'))
					.setDesc(i18n.t('settings.ganttView.cascadeParentDrag.description'))
					.addToggle(toggle => toggle
						.setValue(Boolean(this.plugin.settings.ganttCascadeParentDrag))
						.onChange((value) => {
							void (async () => {
								this.plugin.settings.ganttCascadeParentDrag = value;
								await this.saveAndRefreshViews();
							})();
						}));
			});
		});
	}
}
