import { useMemo, type JSX } from 'react';
import type { CSSProperties } from 'react';
import { generateMonthCalendar } from '../../calendar/calendarGenerator';
import { getTaskDateField } from '../../types';
import { YearViewClasses } from '../../utils/bem';
import { usePlugin } from '../pluginContext';
import { useCalendarStore, selectViewFilter } from '../store/calendarStore';
import { applyTagFilter } from '../utils/taskFilters';
import { generateVirtualInstances } from '../../tasks/virtualTaskGenerator';
import { i18n } from '../../i18n/i18n';

/**
 * React 年视图（热力图）
 */
export function YearView(): JSX.Element {
	const plugin = usePlugin();
	const currentDate = useCalendarStore((s) => s.currentDate);
	const tasks = useCalendarStore((s) => s.tasks);
	const filter = useCalendarStore((s) => selectViewFilter(s, 'year'));
	const setCurrentDate = useCalendarStore((s) => s.setCurrentDate);
	const setViewType = useCalendarStore((s) => s.setViewType);

	const year = currentDate.getFullYear();
	const startOnMonday = !!plugin.settings.startOnMonday;
	const dateField = plugin.settings.dateFilterField || 'dueDate';
	const showLunar = plugin.settings.showLunar;
	const showCount = plugin.settings.yearShowTaskCount;

	const data = useMemo(() => {
		const start = new Date(year, 0, 1);
		const end = new Date(year, 11, 31);
		const scoped = applyTagFilter(tasks, filter.tag);

		// 重复任务：生成虚拟实例并合并计数
		const recurringLimit = plugin.settings.recurringTaskDisplayLimit ?? 5;
		const virtuals = generateVirtualInstances(scoped, start, end, dateField, recurringLimit);
		const allTasks = [...scoped, ...virtuals];

		const counts = new Map<string, number>();
		for (const t of allTasks) {
			const d = getTaskDateField(t, dateField);
			if (!d) continue;
			if (d < start || d > end) continue;
			const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
			counts.set(key, (counts.get(key) || 0) + 1);
		}
		return counts;
	}, [tasks, filter, year, dateField]);

	const months = useMemo(() => {
		const palette = plugin.settings.yearHeatmapPalette || 'blue';
		const heatEnabled = plugin.settings.yearHeatmapEnabled;
		const heat3D = plugin.settings.yearHeatmap3DEnabled || 0;
		const lunarFontSize = plugin.settings.yearLunarFontSize || 10;

		const monthNames = i18n.t('views.yearView.months') as unknown as string[];
		const labelsSunFirst = i18n.t('views.yearView.weekdaysShort') as unknown as string[];
		const labelsMonFirst = i18n.t('views.yearView.weekdaysShortMon') as unknown as string[];
		const weekdayLabels = startOnMonday ? labelsMonFirst : labelsSunFirst;

		const monthCards = [];
		for (let m = 1; m <= 12; m++) {
			const monthData = generateMonthCalendar(year, m, startOnMonday);
			monthCards.push({
				m,
				name: monthNames[m - 1],
				weekdayLabels,
				days: monthData.days,
			});
		}

		return { palette, heatEnabled, heat3D, lunarFontSize, monthCards };
	}, [year, startOnMonday, plugin.settings]);

	const modClass = (count: number) => modCountClass(count, months.palette);

	return (
		<div className="gc-view gc-view--year">
			<div className={YearViewClasses.elements.months}>
				{months.monthCards.map((mc) => (
					<div
						key={mc.m}
						className={`${YearViewClasses.elements.monthCard}${showLunar ? ` ${YearViewClasses.modifiers.monthCardShowLunar}` : ''}`}
					>
						<div className={YearViewClasses.elements.monthHeader}>
							<h3>{mc.name}</h3>
						</div>
						<div className={YearViewClasses.elements.weekdays}>
							{mc.weekdayLabels.map((label, i) => (
								<div key={i} className={YearViewClasses.elements.weekday}>
									{label}
								</div>
							))}
						</div>
						<div className={YearViewClasses.elements.daysGrid}>
							{mc.days.map((day, i) => {
								const key = `${(day.date).getFullYear()}-${String(day.date.getMonth() + 1).padStart(2, '0')}-${String(day.date.getDate()).padStart(2, '0')}`;
								const count = data.get(key) || 0;

								const dayClasses = [YearViewClasses.elements.day];
if (months.heatEnabled && count > 0) {
								dayClasses.push(modClass(count));
								if (months.heat3D === 1) dayClasses.push('heatmap-3d-1');
								else if (months.heat3D === 2) dayClasses.push('heatmap-3d-2');
							}
								if (!day.isCurrentMonth) dayClasses.push('outside-month');
								if (day.isToday) dayClasses.push('today');

								const lunarStyle: CSSProperties | undefined = showLunar
									? { fontSize: `${months.lunarFontSize}px` } : undefined;

								return (
									<div
										key={i}
										className={dayClasses.join(' ')}
										data-date={key}
										role="button"
										tabIndex={0}
										onKeyDown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault();
												const d = new Date(day.date);
												setCurrentDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
												setViewType('day');
											}
										}}
										onClick={() => {
											const d = new Date(day.date);
											const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
											setCurrentDate(midnight);
											setViewType('day');
										}}
									>
										<div className={YearViewClasses.elements.dayNumber}>{day.day.toString()}</div>
										{day.lunarText && showLunar ? (
											<div
												className={`${YearViewClasses.elements.lunarText}${(day.festival || day.festivalType) && plugin.settings.showFestivals ? ` festival${day.festivalType ? ` festival-${day.festivalType}` : ''}` : ''}`}
												style={lunarStyle}
											>
												{day.lunarText}
											</div>
										) : null}
										{showCount && count > 0 ? (
											<div className={YearViewClasses.elements.taskCount}>{count}</div>
										) : null}
									</div>
								);
							})}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

function modCountClass(count: number, palette: string): string {
	const level = count >= 20 ? 5 : count >= 10 ? 4 : count >= 5 ? 3 : count >= 2 ? 2 : 1;
	return `heatmap-${palette}-${level}`;
}