import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig, GanttCalendarSettings } from '../types';

type ViewColumn = 'week' | 'month' | 'sidebar';

interface SharedToggleDef {
	label: string;
	keys: Record<ViewColumn, keyof GanttCalendarSettings>;
}

interface SidebarToggleDef {
	label: string;
	key: keyof GanttCalendarSettings;
}

const VIEW_LABELS: Record<ViewColumn, string> = { week: '周', month: '月', sidebar: '侧' };

const SHARED: SharedToggleDef[] = [
	{
		label: '显示复选框',
		keys: { week: 'weekViewShowCheckbox', month: 'monthViewShowCheckbox', sidebar: 'sidebarShowCheckbox' },
	},
	{
		label: '显示任务标签',
		keys: { week: 'weekViewShowTags', month: 'monthViewShowTags', sidebar: 'sidebarShowTags' },
	},
	{
		label: '显示优先级',
		keys: { week: 'weekViewShowPriority', month: 'monthViewShowPriority', sidebar: 'sidebarShowPriority' },
	},
	{
		label: '显示 Ticktick',
		keys: { week: 'weekViewShowTicktick', month: 'monthViewShowTicktick', sidebar: 'sidebarShowTicktick' },
	},
];

const SIDEBAR_ONLY: SidebarToggleDef[] = [
	{ label: '显示文件位置', key: 'sidebarShowFileLocation' },
	{ label: '显示截止日期', key: 'sidebarShowDueDate' },
];

/**
 * 整合的卡片显示控制构建器
 * 将原来分散在周视图/月视图/侧边栏中的重复显示拨动开关整合为紧凑的列式网格布局
 */
export class CardDisplaySettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		this.createSettingGroup('卡片显示控制', (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			const settings = this.plugin.settings as unknown as Record<string, unknown>;

			// 共享拨动行（周/月/侧 各一列）
			for (const def of SHARED) {
				addSetting(setting => {
					setting.setName(def.label);
					const row = setting.controlEl.createDiv('gc-card-toggle-row');

					for (const view of ['week', 'month', 'sidebar'] as ViewColumn[]) {
						const key = def.keys[view];
						const cell = row.createDiv('gc-card-toggle-cell');
						const label = cell.createEl('span', {
							text: VIEW_LABELS[view],
							cls: 'gc-card-toggle-cell-label',
						});
						const input = cell.createEl('input', {
							type: 'checkbox',
							attr: { 'aria-label': `${def.label} - ${VIEW_LABELS[view]}视图` },
						}) as HTMLInputElement;
						input.checked = !!settings[key];
						input.addEventListener('change', async () => {
							settings[key] = input.checked;
							await this.saveAndRefreshViews();
						});
					}
				});
			}

			// 分隔线
			addSetting(setting => {
				setting.setName('').setDesc('');
				setting.controlEl.empty();
				setting.controlEl.createEl('hr', 'gc-card-toggle-divider');
			});

			// 侧边栏专属行
			for (const def of SIDEBAR_ONLY) {
				addSetting(setting => {
					setting.setName(def.label);
					const row = setting.controlEl.createDiv('gc-card-toggle-row');

					// 占位（周、月）
					row.createDiv('gc-card-toggle-spacer');
					row.createDiv('gc-card-toggle-spacer');

					// 侧边栏拨动
					const cell = row.createDiv('gc-card-toggle-cell');
					const label = cell.createEl('span', {
						text: '侧',
						cls: 'gc-card-toggle-cell-label',
					});
					const input = cell.createEl('input', {
						type: 'checkbox',
						attr: { 'aria-label': `${def.label} - 侧边栏` },
					}) as HTMLInputElement;
					input.checked = !!settings[def.key];
					input.addEventListener('change', async () => {
						settings[def.key] = input.checked;
						await this.saveAndRefreshViews();
					});
				});
			}
		});
	}
}
