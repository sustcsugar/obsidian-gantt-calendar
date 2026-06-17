import { App } from 'obsidian';
import { BaseViewRenderer } from './BaseViewRenderer';
import { generateMonthCalendar } from '../calendar/calendarGenerator';
import type { IPluginContext, GCTask, TagFilterState } from '../types';
import { getTaskDateField } from '../types';
import type { DateFieldType } from '../settings/types';
import { YearViewClasses } from '../utils/bem';
import { Logger } from '../utils/logger';
import { i18n } from '../i18n/i18n';

/**
 * 年视图渲染器
 */
export class YearViewRenderer extends BaseViewRenderer {
	private readonly SETTINGS_PREFIX = 'yearView';

	constructor(app: App, plugin: IPluginContext) {
		super(app, plugin);
		this.initializeFilterStates(this.SETTINGS_PREFIX);
	}

	/**
	 * 重写标签筛选 setter 以支持持久化
	 */
	public setTagFilterState(state: TagFilterState): void {
		super.setTagFilterState(state);
		this.saveTagFilterState(this.SETTINGS_PREFIX).catch(err => {
			Logger.error('YearView', 'Failed to save tag filter', err);
		});
	}

	private yearContainer: HTMLElement | null = null;

	render(container: HTMLElement, currentDate: Date): void {
		const year = currentDate.getFullYear();

		// 预计算当年每日任务数量
		let tasks: GCTask[] = this.plugin.taskCache?.getAllTasks?.() || [];
		// 应用标签筛选
		tasks = this.applyTagFilter(tasks);
		const dateField = this.plugin.settings.dateFilterField || 'dueDate';
		const countsMap: Map<string, number> = new Map();
		const startDate = new Date(year, 0, 1);
		const endDate = new Date(year, 11, 31);

		for (const t of tasks) {
			const d = getTaskDateField(t, dateField);
			if (!d) continue;
			if (d < startDate || d > endDate) continue;
			const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
			countsMap.set(key, (countsMap.get(key) || 0) + 1);
		}

		const yearContainer = container.createDiv('gc-view gc-view--year');
		this.yearContainer = yearContainer;

		const monthsGrid = yearContainer.createDiv('gc-year-view__months');

		for (let month = 1; month <= 12; month++) {
			const monthData = generateMonthCalendar(year, month, !!(this.plugin?.settings?.startOnMonday));
			const monthDiv = monthsGrid.createDiv(YearViewClasses.elements.monthCard);

			if (this.plugin.settings.showLunar) {
				monthDiv.addClass('gc-year-view__month-card--show-lunar');
			}

			// 月份标题
			const monthHeader = monthDiv.createDiv(YearViewClasses.elements.monthHeader);
			const monthNames = i18n.t('views.yearView.months') as unknown as string[];
			monthHeader.createEl('h3', { text: monthNames[month - 1] });

			// 星期标签
			const weekdaysDiv = monthDiv.createDiv(YearViewClasses.elements.weekdays);
			const startOnMonday = !!(this.plugin?.settings?.startOnMonday);
			const labelsSunFirst = i18n.t('views.yearView.weekdaysShort') as unknown as string[];
			const labelsMonFirst = i18n.t('views.yearView.weekdaysShortMon') as unknown as string[];
			(startOnMonday ? labelsMonFirst : labelsSunFirst).forEach((day) => {
				weekdaysDiv.createEl('div', { text: day, cls: YearViewClasses.elements.weekday });
			});

			// 日期网格
			const daysDiv = monthDiv.createDiv(YearViewClasses.elements.daysGrid);
			monthData.days.forEach((day) => {
				const dayEl = daysDiv.createEl('div');
				dayEl.addClass(YearViewClasses.elements.day);
				dayEl.dataset.date = `${day.date.getFullYear()}-${(day.date.getMonth() + 1).toString().padStart(2, '0')}-${day.date.getDate().toString().padStart(2, '0')}`;

				// 热力图
				const dayKey = `${day.date.getFullYear()}-${(day.date.getMonth() + 1).toString().padStart(2, '0')}-${day.date.getDate().toString().padStart(2, '0')}`;
				const count = countsMap.get(dayKey) || 0;
				if (this.plugin.settings.yearHeatmapEnabled && count > 0) {
					const palette = this.plugin.settings.yearHeatmapPalette || 'blue';
					const level = count >= 20 ? 5 : count >= 10 ? 4 : count >= 5 ? 3 : count >= 2 ? 2 : 1;
					dayEl.addClass(`heatmap-${palette}-${level}`);
					if (this.plugin.settings.yearHeatmap3DEnabled === 1) {
						dayEl.addClass('heatmap-3d-1');
					} else if (this.plugin.settings.yearHeatmap3DEnabled === 2) {
						dayEl.addClass('heatmap-3d-2');
					}
				}

				const dateNum = dayEl.createEl('div', { text: day.day.toString() });
				dateNum.addClass(YearViewClasses.elements.dayNumber);

				if (day.lunarText && this.plugin.settings.showLunar) {
					const lunarEl = dayEl.createEl('div', { text: day.lunarText });
					lunarEl.addClass(YearViewClasses.elements.lunarText);
					if ((day.festival || day.festivalType) && this.plugin.settings.showFestivals) {
						lunarEl.addClass('festival');
						if (day.festivalType) {
							lunarEl.addClass(`festival-${day.festivalType}`);
						}
					}
				}

				if (this.plugin.settings.yearShowTaskCount && count > 0) {
					const countEl = dayEl.createEl('div', { text: `${count}` });
					countEl.addClass(YearViewClasses.elements.taskCount);
				}

				if (!day.isCurrentMonth) {
					dayEl.addClass('outside-month');
				}
				if (day.isToday) {
					dayEl.addClass('today');
				}

				dayEl.onclick = () => {
					if (this.plugin.calendarView) {
						this.plugin.calendarView.selectDate(day.date);
					}
				};
			});
		}
	}

	/**
	 * 增量刷新：更新任务计数和热力图，不重建DOM
	 */
	public refreshTasks(): void {
		if (!this.yearContainer) return;

		let tasks: GCTask[] = this.plugin.taskCache?.getAllTasks?.() || [];
		tasks = this.applyTagFilter(tasks);
		const dateField = this.plugin.settings.dateFilterField || 'dueDate';

		const yearGrid = this.yearContainer.querySelector('.gc-year-view__months');
		if (!yearGrid) return;

		const firstMonthCard = yearGrid.querySelector('.gc-year-view__month-card');
		if (!firstMonthCard) return;

		const countsMap: Map<string, number> = new Map();
		const monthCards = yearGrid.querySelectorAll('.gc-year-view__month-card');

		for (const t of tasks) {
			const d = getTaskDateField(t, dateField);
			if (!d) continue;
			const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
			countsMap.set(key, (countsMap.get(key) || 0) + 1);
		}

		monthCards.forEach((monthCard) => {
			const days = monthCard.querySelectorAll('.gc-year-view__day');
			days.forEach((dayEl: Element) => {
				const dayNumberEl = dayEl.querySelector('.gc-year-view__day-number');
				if (!dayNumberEl) return;

				const dateStr = (dayEl as HTMLElement).dataset.date;
				if (!dateStr) return;

				const count = countsMap.get(dateStr) || 0;

				// 移除旧的热力图类
				(dayEl as HTMLElement).classList.remove(
					'heatmap-blue-1', 'heatmap-blue-2', 'heatmap-blue-3', 'heatmap-blue-4', 'heatmap-blue-5',
					'heatmap-green-1', 'heatmap-green-2', 'heatmap-green-3', 'heatmap-green-4', 'heatmap-green-5',
					'heatmap-red-1', 'heatmap-red-2', 'heatmap-red-3', 'heatmap-red-4', 'heatmap-red-5',
					'heatmap-purple-1', 'heatmap-purple-2', 'heatmap-purple-3', 'heatmap-purple-4', 'heatmap-purple-5',
					'heatmap-orange-1', 'heatmap-orange-2', 'heatmap-orange-3', 'heatmap-orange-4', 'heatmap-orange-5',
					'heatmap-cyan-1', 'heatmap-cyan-2', 'heatmap-cyan-3', 'heatmap-cyan-4', 'heatmap-cyan-5',
					'heatmap-pink-1', 'heatmap-pink-2', 'heatmap-pink-3', 'heatmap-pink-4', 'heatmap-pink-5',
					'heatmap-yellow-1', 'heatmap-yellow-2', 'heatmap-yellow-3', 'heatmap-yellow-4', 'heatmap-yellow-5',
					'heatmap-3d-1', 'heatmap-3d-2'
				);

				// 添加新的热力图类
				if (this.plugin.settings.yearHeatmapEnabled && count > 0) {
					const palette = this.plugin.settings.yearHeatmapPalette || 'blue';
					const level = count >= 20 ? 5 : count >= 10 ? 4 : count >= 5 ? 3 : count >= 2 ? 2 : 1;
					(dayEl as HTMLElement).classList.add(`heatmap-${palette}-${level}`);
					if (this.plugin.settings.yearHeatmap3DEnabled === 1) {
						(dayEl as HTMLElement).classList.add('heatmap-3d-1');
					} else if (this.plugin.settings.yearHeatmap3DEnabled === 2) {
						(dayEl as HTMLElement).classList.add('heatmap-3d-2');
					}
				}

				// 更新任务数量显示
				let countEl = dayEl.querySelector('.gc-year-view__task-count');
				if (this.plugin.settings.yearShowTaskCount && count > 0) {
					if (!countEl) {
						countEl = dayEl.ownerDocument?.createElement('div');
						if (countEl) {
							countEl.className = 'gc-year-view__task-count';
							dayEl.appendChild(countEl);
						}
					}
					if (countEl) {
						countEl.textContent = `${count}`;
					}
				} else if (countEl) {
					countEl.remove();
				}
			});
		});
	}

	/**
	 * 更新所有月卡片显示（农历始终显示，此方法保留用于字号更新）
	 */
	public updateAllMonthCards(): void {
		if (!this.yearContainer) return;
	}

	/**
	 * 应用农历字号设置
	 */
	public applyLunarFontSize(container: HTMLElement): void {
		const lunarFontSize = this.plugin.settings.yearLunarFontSize || 10;
		const lunarTexts = container.querySelectorAll(`.${YearViewClasses.elements.lunarText}`);
		lunarTexts.forEach((text: Element) => {
			(text as HTMLElement).style.fontSize = `${lunarFontSize}px`;
		});
	}
}
