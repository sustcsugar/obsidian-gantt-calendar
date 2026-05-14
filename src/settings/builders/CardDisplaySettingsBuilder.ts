import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import { SettingsCardChipClasses } from '../../utils/bem';
import type { BuilderConfig, GanttCalendarSettings } from '../types';

type ViewType = 'week' | 'month' | 'sidebar';

interface ChipDef {
	label: string;
	keys: Record<ViewType, keyof GanttCalendarSettings | undefined>;
}

const SHARED_CHIPS: ChipDef[] = [
	{ label: '复选框', keys: { week: 'weekViewShowCheckbox', month: 'monthViewShowCheckbox', sidebar: 'sidebarShowCheckbox' } },
	{ label: '标签', keys: { week: 'weekViewShowTags', month: 'monthViewShowTags', sidebar: 'sidebarShowTags' } },
	{ label: '优先级', keys: { week: 'weekViewShowPriority', month: 'monthViewShowPriority', sidebar: 'sidebarShowPriority' } },
	{ label: '附加内容', keys: { week: 'weekViewShowTicktick', month: 'monthViewShowTicktick', sidebar: 'sidebarShowTicktick' } },
];

const VIEW_ROWS: { view: ViewType; name: string }[] = [
	{ view: 'week', name: '周视图' },
	{ view: 'month', name: '月视图' },
	{ view: 'sidebar', name: '侧边栏' },
];

export class CardDisplaySettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		this.createSettingGroup('任务卡片显示控制', (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			const settings = this.plugin.settings as unknown as Record<string, unknown>;

			for (const { view, name } of VIEW_ROWS) {
				addSetting(setting => {
					setting.setName(name);

					const row = setting.controlEl.createDiv(SettingsCardChipClasses.elements.chipRow);

					for (const chip of SHARED_CHIPS) {
						const key = chip.keys[view]!;
						this.createChip(
							row,
							chip.label,
							!!settings[key as string],
							`${name} - ${chip.label}`,
							async (value) => {
								settings[key as string] = value;
								await this.saveAndRefreshViews();
							}
						);
					}
				});
			}
		});
	}

	private createChip(
		parent: HTMLElement,
		text: string,
		active: boolean,
		ariaLabel: string,
		onChange: (value: boolean) => Promise<void>
	): HTMLDivElement {
		const cls = SettingsCardChipClasses;
		const chip = parent.createDiv(cls.elements.chip);
		chip.setText(text);
		chip.setAttribute('role', 'switch');
		chip.setAttribute('aria-checked', String(active));
		chip.setAttribute('aria-label', ariaLabel);
		chip.setAttribute('tabindex', '0');
		if (active) chip.addClass(cls.modifiers.chipActive);

		chip.addEventListener('click', async () => {
			const next = !chip.hasClass(cls.modifiers.chipActive);
			chip.toggleClass(cls.modifiers.chipActive, next);
			chip.setAttribute('aria-checked', String(next));
			await onChange(next);
		});
		chip.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				chip.click();
			}
		});
		return chip;
	}
}
