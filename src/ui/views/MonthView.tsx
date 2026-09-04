import { Fragment, useMemo, useCallback, type JSX } from 'react';
import { taskKey } from '../utils/taskKey';
import type { DragEvent as ReactDragEvent } from 'react';
import { Notice } from 'obsidian';
import { generateMonthCalendar } from '../../calendar/calendarGenerator';
import type { GCTask } from '../../types';
import { getTaskDateField } from '../../types';
import { MonthViewConfig } from '../../components/TaskCard';
import { MonthViewClasses, setCssProps } from '../../utils/bem';
import { usePlugin, useApp } from '../pluginContext';
import { useCalendarStore, selectViewFilter } from '../store/calendarStore';
import { applyStatusFilter, applyTagFilter, applySort } from '../utils/taskFilters';
import { TaskCard } from '../components/TaskCard';
import { updateTaskDateField } from '../../tasks/taskUpdater';
import { toISOStringLocal } from '../../dateUtils/timezone';
import { generateVirtualInstances } from '../../tasks/virtualTaskGenerator';
import { i18n } from '../../i18n/i18n';
import { Logger } from '../../utils/logger';

/**
 * React 月视图
 * 渲染 7 列 × 6 周 网格（保留原有 BEM 类名与 grid 定位方式）
 */
export function MonthView(): JSX.Element {
	const plugin = usePlugin();
	const app = useApp();
	const currentDate = useCalendarStore((s) => s.currentDate);
	const tasks = useCalendarStore((s) => s.tasks);
	const filter = useCalendarStore((s) => selectViewFilter(s, 'month'));
	const setCurrentDate = useCalendarStore((s) => s.setCurrentDate);
	const setViewType = useCalendarStore((s) => s.setViewType);
	const refreshTasks = useCalendarStore((s) => s.refreshTasks);
	// 稳定回调：TaskCard 已 memo，内联箭头函数会使 memo 失效
	const handleCardRefresh = useCallback(() => refreshTasks(), [refreshTasks]);

	const startOnMonday = !!plugin.settings.startOnMonday;
	const dateField = plugin.settings.dateFilterField || 'dueDate';

	const config = useMemo(() => ({
		...MonthViewConfig,
		showCheckbox: plugin.settings.monthViewShowCheckbox,
		showTags: plugin.settings.monthViewShowTags,
		showPriority: plugin.settings.monthViewShowPriority,
		showTicktick: plugin.settings.monthViewShowTicktick,
	}), [plugin.settings]);

	const monthData = useMemo(() => {
		return generateMonthCalendar(currentDate.getFullYear(), currentDate.getMonth() + 1, startOnMonday);
	}, [currentDate, startOnMonday]);

	const monthViewData = useMemo(() => {
		// 全局筛选
		const scoped = applySort(applyTagFilter(applyStatusFilter(tasks, filter.status), filter.tag), filter.sort);
		return scoped;
	}, [tasks, filter]);

	// 预生成整月虚拟周期实例
	const virtualInstances = useMemo(() => {
		if (!monthData) return [];
		const allDays = monthData.days;
		const monthStart = new Date(allDays[0].date);
		monthStart.setHours(0, 0, 0, 0);
		const monthEnd = new Date(allDays[allDays.length - 1].date);
		monthEnd.setHours(0, 0, 0, 0);
		return generateVirtualInstances(
			monthViewData,
			monthStart,
			monthEnd,
			dateField,
			plugin.settings.recurringTaskDisplayLimit ?? 5
		);
	}, [monthViewData, monthData, dateField, plugin.settings.recurringTaskDisplayLimit]);

	const tasksForDay = useMemo(() => {
		const map = new Map<string, GCTask[]>();
		if (!monthData) return map;
		for (const day of monthData.days) {
			const key = toISOStringLocal(day.date);
			const normalized = new Date(day.date);
			normalized.setHours(0, 0, 0, 0);

			const real = monthViewData.filter((t) => {
				const d = getTaskDateField(t, dateField);
				if (!d) return false;
				const dd = new Date(d);
				if (isNaN(dd.getTime())) return false;
				dd.setHours(0, 0, 0, 0);
				return dd.getTime() === normalized.getTime();
			});
			const virt = (virtualInstances || []).filter((t) => {
				const d = getTaskDateField(t, dateField);
				if (!d) return false;
				const dd = new Date(d);
				if (isNaN(dd.getTime())) return false;
				dd.setHours(0, 0, 0, 0);
				return dd.getTime() === normalized.getTime();
			});
			map.set(key, [...real, ...virt]);
		}
		return map;
	}, [monthData, monthViewData, virtualInstances, dateField]);

	// ===== 拖放落点 =====
	const handleDayDrop = useCallback(async (e: ReactDragEvent, targetDate: Date) => {
		e.preventDefault();
		const dayCell = e.currentTarget as HTMLElement;
		setCssProps(dayCell, { backgroundColor: '' });

		const taskId = e.dataTransfer?.getData('taskId');
		if (!taskId) return;

		const [filePath, lineNum] = taskId.split(':');
		const lineNumber = parseInt(lineNum, 10);
		const sourceTask = tasks.find((t) => t.filePath === filePath && t.lineNumber === lineNumber);
		if (!sourceTask) {
			Logger.error('MonthView', 'Source task not found:', taskId);
			return;
		}

		try {
			// 保留任务原有时间
			const newDate = new Date(targetDate);
			const original = getTaskDateField(sourceTask, dateField);
			if (original) {
				const orig = new Date(original);
				if (!isNaN(orig.getTime())) {
					newDate.setHours(orig.getHours(), orig.getMinutes(), orig.getSeconds(), 0);
				}
			}
			await updateTaskDateField(app, sourceTask, dateField, newDate, plugin.settings.enabledTaskFormats);
			await plugin.taskCache.refreshFile(sourceTask.filePath);
			useCalendarStore.getState().notifyTasksUpdated(
				plugin.taskCache.getAllTasks(), sourceTask.filePath
			);
		} catch (error) {
			Logger.error('MonthView', 'Error updating task date:', error);
			new Notice(i18n.t('views.dayView.updateDateFailed'));
		}
	}, [app, dateField, plugin.settings.enabledTaskFormats, tasks]);

	if (!monthData) {
		return <div className="gc-view gc-view--month" />;
	}

	const labelsSunFirst = i18n.t('views.monthView.weekdays') as unknown as string[];
	const labelsMonFirst = i18n.t('views.monthView.weekdaysMon') as unknown as string[];
	const weekdayLabels = startOnMonday ? labelsMonFirst : labelsSunFirst;

	const monthFontSize = plugin.settings.monthLunarFontSize || 10;
	const taskLimit = plugin.settings.monthViewTaskLimit || 5;

	return (
		<div className="gc-view gc-view--month">
			<div className={`${MonthViewClasses.elements.weekday} gc-month-view__weekday--empty`} />
			{weekdayLabels.map((label, i) => (
				<div key={i} className={MonthViewClasses.elements.weekday}>
					{label}
				</div>
			))}

			{monthData.weeks.map((week, weekIndex) => {
				const weekRow = weekIndex + 2;
				return (
					<Fragment key={week.weekNumber}>
						<div
							className={MonthViewClasses.elements.weekNumber}
							style={{ gridRow: `${weekRow}`, gridColumn: '1' }}
						>
							<span>W{week.weekNumber}</span>
						</div>
						{week.days.map((day, dayIndex) => {
							const cellClasses = [
								MonthViewClasses.elements.dayCell,
								!day.isCurrentMonth ? MonthViewClasses.modifiers.outsideMonth : '',
								day.isToday ? MonthViewClasses.modifiers.today : '',
							].filter(Boolean).join(' ');
							const key = toISOStringLocal(day.date);
							const dayTasks = tasksForDay.get(key) || [];
							const displayTasks = dayTasks.slice(0, taskLimit);
							const hasMore = dayTasks.length > taskLimit;

							const lunarEl = day.lunarText && plugin.settings.showLunar
								? (
									<div
										className={`${MonthViewClasses.elements.lunarText}${(day.festival || day.festivalType) && plugin.settings.showFestivals ? ` ${MonthViewClasses.modifiers.festival}${day.festivalType ? ` ${festivalClass(day.festivalType)}` : ''}` : ''}`}
										style={{ fontSize: `${monthFontSize}px` }}
									>
										{day.lunarText}
									</div>
								) : null;

							return (
								<div
									key={`${week.weekNumber}-${dayIndex}`}
									className={cellClasses}
									data-date={key}
									style={{ gridRow: `${weekRow}`, gridColumn: `${dayIndex + 2}` }}
									role="button"
									tabIndex={0}
									onKeyDown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											setCurrentDate(day.date);
											setViewType('day');
										}
									}}
									onClick={(e) => {
										if ((e.target as HTMLElement).closest('.gc-task-card')) return;
										setCurrentDate(day.date);
										setViewType('day');
									}}
									onDragOver={(e) => {
										e.preventDefault();
										e.dataTransfer.dropEffect = 'move';
										setCssProps(e.currentTarget, { backgroundColor: 'var(--background-modifier-hover)' });
									}}
									onDragLeave={(e) => {
										setCssProps(e.currentTarget, { backgroundColor: '' });
									}}
									onDrop={(e) => void handleDayDrop(e, day.date)}
								>
									<div className={MonthViewClasses.elements.dayHeader}>
										<div className={MonthViewClasses.elements.dayNumber}>{day.day.toString()}</div>
										{lunarEl}
									</div>
									<div className={MonthViewClasses.elements.tasks}>
										{displayTasks.map((t) => (
											<TaskCard
												key={taskKey(t)}
												task={t}
												config={config}
												targetDate={day.date}
												onRefresh={handleCardRefresh}
											/>
										))}
										{hasMore ? (
											<div className={MonthViewClasses.elements.taskMore}>
												{i18n.t('common.more', { count: dayTasks.length - taskLimit })}
											</div>
										) : null}
									</div>
								</div>
							);
						})}
					</Fragment>
				);
			})}
		</div>
	);
}

function festivalClass(type: 'solar' | 'lunar' | 'solarTerm'): string {
	switch (type) {
		case 'solar': return MonthViewClasses.modifiers.festivalSolar;
		case 'lunar': return MonthViewClasses.modifiers.festivalLunar;
		case 'solarTerm': return MonthViewClasses.modifiers.festivalSolarTerm;
	}
}

