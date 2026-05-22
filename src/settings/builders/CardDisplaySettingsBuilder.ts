import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import { SettingsCardChipClasses } from '../../utils/bem';
import type { BuilderConfig, GanttCalendarSettings } from '../types';
import { i18n } from '../../i18n/i18n';

type ViewType = 'week' | 'month' | 'sidebar';

interface ChipDef {
	label: string;
	keys: Record<ViewType, keyof GanttCalendarSettings | undefined>;
}

function getSharedChips(): ChipDef[] {
	return [
		{ label: i18n.t('settings.cardDisplay.chips.checkbox'), keys: { week: 'weekViewShowCheckbox', month: 'monthViewShowCheckbox', sidebar: 'sidebarShowCheckbox' } },
		{ label: i18n.t('settings.cardDisplay.chips.tags'), keys: { week: 'weekViewShowTags', month: 'monthViewShowTags', sidebar: 'sidebarShowTags' } },
		{ label: i18n.t('settings.cardDisplay.chips.priority'), keys: { week: 'weekViewShowPriority', month: 'monthViewShowPriority', sidebar: 'sidebarShowPriority' } },
		{ label: i18n.t('settings.cardDisplay.chips.extraContent'), keys: { week: 'weekViewShowTicktick', month: 'monthViewShowTicktick', sidebar: 'sidebarShowTicktick' } },
	];
}

function getViewRows(): { view: ViewType; name: string }[] {
	return [
		{ view: 'week', name: i18n.t('settings.cardDisplay.views.week') },
		{ view: 'month', name: i18n.t('settings.cardDisplay.views.month') },
		{ view: 'sidebar', name: i18n.t('settings.cardDisplay.views.sidebar') },
	];
}

export class CardDisplaySettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		this.createSettingGroup(i18n.t('settings.cardDisplay.groupTitle'), (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			const settings = this.plugin.settings as unknown as Record<string, unknown>;

			for (const { view, name } of getViewRows()) {
				addSetting(setting => {
					setting.setName(name);

					const row = setting.controlEl.createDiv(SettingsCardChipClasses.elements.chipRow);

					for (const chip of getSharedChips()) {
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
