import { BaseViewRenderer } from './BaseViewRenderer';
import { generateMonthCalendar } from '../calendar/calendarGenerator';
import type { GanttTask } from '../types';

/**
 * 年视图渲染器
 */
export class YearViewRenderer extends BaseViewRenderer {
	private yearContainer: HTMLElement | null = null;

	render(container: HTMLElement, currentDate: Date): void {
		const year = currentDate.getFullYear();

		// 预计算当年每日任务数量
		let tasks: GanttTask[] = this.plugin.taskCache?.getAllTasks?.() || [];
		// 应用标签筛选
		tasks = this.applyTagFilter(tasks);
		const dateField = this.plugin.settings.dateFilterField || 'dueDate';
		const countsMap: Map<string, number> = new Map();
		const startDate = new Date(year, 0, 1);
		const endDate = new Date(year, 11, 31);
		
		for (const t of tasks) {
			const d = (t as any)[dateField] as Date | undefined;
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
			const monthDiv = monthsGrid.createDiv('calendar-month-card');

			// 月份标题
			const monthHeader = monthDiv.createDiv('calendar-month-header');
			const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
			monthHeader.createEl('h3', { text: monthNames[month - 1] });

			// 星期标签
			const weekdaysDiv = monthDiv.createDiv('calendar-weekdays');
			const startOnMonday = !!(this.plugin?.settings?.startOnMonday);
			const labelsSunFirst = ['日', '一', '二', '三', '四', '五', '六'];
			const labelsMonFirst = ['一', '二', '三', '四', '五', '六', '日'];
			(startOnMonday ? labelsMonFirst : labelsSunFirst).forEach((day) => {
				weekdaysDiv.createEl('div', { text: day, cls: 'calendar-weekday' });
			});

			// 日期网格
			const daysDiv = monthDiv.createDiv('calendar-days-grid');
			monthData.days.forEach((day) => {
				const dayEl = daysDiv.createEl('div');
				dayEl.addClass('calendar-day');
				
				// 热力图：根据任务数量设置背景
				const dayKey = `${day.date.getFullYear()}-${(day.date.getMonth() + 1).toString().padStart(2, '0')}-${day.date.getDate().toString().padStart(2, '0')}`;
				const count = countsMap.get(dayKey) || 0;
				if (this.plugin.settings.yearHeatmapEnabled && count > 0) {
					const palette = this.plugin.settings.yearHeatmapPalette || 'blue';
					const level = count >= 20 ? 5 : count >= 10 ? 4 : count >= 5 ? 3 : count >= 2 ? 2 : 1;
					dayEl.addClass(`heatmap-${palette}-${level}`);
				}

				const dateNum = dayEl.createEl('div', { text: day.day.toString() });
				dateNum.addClass('calendar-day-number');

				if (day.lunarText) {
					const lunarEl = dayEl.createEl('div', { text: day.lunarText });
					lunarEl.addClass('calendar-lunar-text');
					if (day.festival || day.festivalType) {
						lunarEl.addClass('festival');
						if (day.festivalType) {
							lunarEl.addClass(`festival-${day.festivalType}`);
						}
					}
				}

				// 显示任务数量
				if (this.plugin.settings.yearShowTaskCount && count > 0) {
					const countEl = dayEl.createEl('div', { text: `${count}` });
					countEl.addClass('calendar-day-task-count');
				}

				if (!day.isCurrentMonth) {
					dayEl.addClass('outside-month');
				}
				if (day.isToday) {
					dayEl.addClass('today');
				}

				// 点击事件由主视图处理
				dayEl.onclick = () => {
					if (this.plugin.calendarView) {
						this.plugin.calendarView.selectDate(day.date);
					}
				};
			});

			// 延迟检查是否显示农历
			setTimeout(() => {
				this.updateYearCardDisplay(monthDiv);
			}, 100);
		}
	}

	/**
	 * 根据卡片大小更新农历显示
	 */
	public updateYearCardDisplay(monthDiv: HTMLElement): void {
		const daysGrid = monthDiv.querySelector('.calendar-days-grid') as HTMLElement;
		if (!daysGrid) return;

		const dayElements = daysGrid.querySelectorAll('.calendar-day');
		if (dayElements.length === 0) return;

		const firstDay = dayElements[0] as HTMLElement;
		const dayRect = firstDay.getBoundingClientRect();

		// 单元格足够大时显示农历
		const showLunar = dayRect.width > 35 && dayRect.height > 45;

		if (showLunar) {
			monthDiv.addClass('show-lunar');
		} else {
			monthDiv.removeClass('show-lunar');
		}
	}

	/**
	 * 更新所有月卡片显示
	 */
	public updateAllMonthCards(): void {
		if (!this.yearContainer) return;
		const monthCards = this.yearContainer.querySelectorAll('.calendar-month-card');
		monthCards.forEach((card) => {
			this.updateYearCardDisplay(card as HTMLElement);
		});
	}

	/**
	 * 应用农历字号设置
	 */
	public applyLunarFontSize(container: HTMLElement): void {
		const lunarFontSize = this.plugin.settings.yearLunarFontSize || 10;
		const lunarTexts = container.querySelectorAll('.calendar-lunar-text');
		lunarTexts.forEach((text: Element) => {
			(text as HTMLElement).style.fontSize = `${lunarFontSize}px`;
		});
	}
}
