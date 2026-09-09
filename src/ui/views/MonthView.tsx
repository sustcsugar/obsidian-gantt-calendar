import { Fragment, useMemo, useCallback, useEffect, useRef, type JSX } from 'react';
import { AnimatePresence, motion, type Variants } from 'motion/react';
import { taskKey } from '../utils/taskKey';
import type { DragEvent as ReactDragEvent } from 'react';
import { Notice } from 'obsidian';
import { generateMonthCalendar } from '../../calendar/calendarGenerator';
import type { GCTask } from '../../types';
import { MonthViewConfig } from '../../components/TaskCard';
import { MonthViewClasses, setCssProps } from '../../utils/bem';
import { usePlugin, useApp } from '../pluginContext';
import { useCalendarStore, selectViewFilter } from '../store/calendarStore';
import { applyStatusFilter, applyTagFilter, applySort } from '../utils/taskFilters';
import { TaskCard } from '../components/TaskCard';
import { updateTaskProperties } from '../../tasks/taskUpdater';
import { toISOStringLocal } from '../../dateUtils/timezone';
import { createMonthWheelStep, shiftMonth, getMonthKey, monthTravelDir } from '../utils/monthWheel';
import { MOTION, easeOutTransition } from '../motion';
import { generateVirtualInstances } from '../../tasks/virtualTaskGenerator';
import { buildMonthTimelineModel, getTaskInterval, clampSingleFieldWrite } from './week/timelineModel';
import { sortTasks } from '../../tasks/taskSorter';
import { i18n } from '../../i18n/i18n';
import { Logger } from '../../utils/logger';
import type { DateFieldType } from '../../settings/types';

/** 横跨条单行高度（条 18px + 间距 2px） */
const SPAN_ROW_PX = 20;
/** 横跨条带与格内内容之间的间隙 */
const SPAN_STRIP_GAP_PX = 4;
/**
 * 横跨条带顶部让位：日期头部高度（格 padding-top 8px + 日号 22px + gap 2px）。
 * 条带从此偏移开始，不遮挡日号/农历
 */
const SPAN_HEADER_OFFSET_PX = 32;

/** dataTransfer.taskId（filePath:lineNumber）→ 任务查找 */
function findTaskById(tasks: GCTask[], taskId: string): GCTask | null {
	const [filePath, lineNum] = taskId.split(':');
	const lineNumber = parseInt(lineNum, 10);
	return tasks.find((t) => t.filePath === filePath && t.lineNumber === lineNumber) || null;
}

/**
 * React 月视图（时间线语义版）
 * 7 列 × N 周网格；跨日区间任务渲染为每周行顶部的横跨条（周内钳制 + 延续箭头 + 时刻标注），
 * 单日/定时任务在锚日格内显示卡片；拖放语义与周/日/侧栏画布对齐。
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

	// ===== 滚轮切月：悬停月视图滚动即切换月份（累计阈值 + 冷却防惯性连跳） =====
	// 原生监听（passive: false）而非 React onWheel：后者在根容器注册为 passive，
	// preventDefault 可能失效；月视图内容不溢出，滚轮原本无滚动目标，无冲突。
	const viewRef = useRef<HTMLDivElement>(null);
	const stepWheelRef = useRef(createMonthWheelStep());

	useEffect(() => {
		const el = viewRef.current;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			const dir = stepWheelRef.current(e.deltaY, e.deltaMode, Date.now());
			if (dir === 0) return;
			e.preventDefault();
			setCurrentDate(shiftMonth(currentDate, dir));
		};
		el.addEventListener('wheel', onWheel, { passive: false });
		return () => el.removeEventListener('wheel', onWheel);
	}, [currentDate, setCurrentDate]);

	// ===== 相邻月切月动画：方向由上次渲染的月份键推导（±1 平移 / 其余淡入淡出） =====
	const monthKey = getMonthKey(currentDate);
	const prevMonthKeyRef = useRef(monthKey);
	const slideDir = monthTravelDir(prevMonthKeyRef.current, monthKey);
	useEffect(() => {
		prevMonthKeyRef.current = monthKey;
	}, [monthKey]);

	const startOnMonday = !!plugin.settings.startOnMonday;
	const dateField = plugin.settings.dateFilterField || 'dueDate';
	const startField = plugin.settings.ganttStartField || 'startDate';
	const endField = plugin.settings.ganttEndField || 'dueDate';
	const enabledFormats = plugin.settings.enabledTaskFormats || [];

	// 月视图统一使用 timeline 变体：格内卡片与横跨条同一视觉语言
	const config = useMemo(() => ({
		...MonthViewConfig,
		variant: 'timeline' as const,
		showCheckbox: plugin.settings.monthViewShowCheckbox,
		showTags: plugin.settings.monthViewShowTags,
		showPriority: plugin.settings.monthViewShowPriority,
		showTicktick: plugin.settings.monthViewShowTicktick,
	}), [plugin.settings]);

	const monthData = useMemo(() => {
		return generateMonthCalendar(currentDate.getFullYear(), currentDate.getMonth() + 1, startOnMonday);
	}, [currentDate, startOnMonday]);

	// 全局筛选
	const scoped = useMemo(() => (
		applySort(applyTagFilter(applyStatusFilter(tasks, filter.status), filter.tag), filter.sort)
	), [tasks, filter]);

	// 预生成整月虚拟周期实例
	const virtualInstances = useMemo(() => {
		if (!monthData) return [];
		const allDays = monthData.days;
		const monthStart = new Date(allDays[0].date);
		monthStart.setHours(0, 0, 0, 0);
		const monthEnd = new Date(allDays[allDays.length - 1].date);
		monthEnd.setHours(0, 0, 0, 0);
		return generateVirtualInstances(
			scoped,
			monthStart,
			monthEnd,
			dateField,
			plugin.settings.recurringTaskDisplayLimit ?? 5
		);
	}, [scoped, monthData, dateField, plugin.settings.recurringTaskDisplayLimit]);

	// 月视图时间线模型：跨日横跨条 + 格内任务（锚日语义）
	const monthModel = useMemo(() => {
		if (!monthData) return [];
		const combined = sortTasks([...scoped, ...virtualInstances], filter.sort).filter((t) => !t.cancelled);
		return buildMonthTimelineModel(combined, monthData.weeks, startField, endField, dateField);
	}, [scoped, virtualInstances, monthData, filter.sort, startField, endField, dateField]);

	// 任务全集（拖放源查找）
	const dragLookupTasks = useMemo(() => tasks.filter((t) => !t.cancelled), [tasks]);

	// ===== 拖放落点：语义与画布对齐 =====
	const handleDayDrop = useCallback(async (e: ReactDragEvent, targetDate: Date) => {
		e.preventDefault();
		const dayCell = e.currentTarget as HTMLElement;
		setCssProps(dayCell, { backgroundColor: '' });

		const taskId = e.dataTransfer?.getData('taskId');
		if (!taskId) return;
		const sourceTask = findTaskById(dragLookupTasks, taskId);
		if (!sourceTask) {
			Logger.error('MonthView', 'Source task not found:', taskId);
			return;
		}

		const target = new Date(targetDate);
		target.setHours(0, 0, 0, 0);
		const interval = getTaskInterval(sourceTask, startField, endField, dateField);
		const updates: Partial<Record<DateFieldType, Date>> = {};
		let precision: Partial<Record<DateFieldType, 'day' | 'time'>> = {};

		try {
			if (interval && interval.kind === 'point') {
				// 点任务拖动 = 双写起止并升级为区间任务（锚点时刻保留，整体移到目标日）
				const durationMin = Math.round((interval.end.getTime() - interval.start.getTime()) / 60000);
				const anchorTime = interval.start.getHours() * 60 + interval.start.getMinutes();
				const anchorMin = anchorTime;
				updates[startField] = atMinutes(target, anchorMin);
				updates[endField] = atMinutes(target, anchorMin + durationMin);
				precision = { [startField]: 'time', [endField]: 'time' };
			} else if (interval) {
				// 区间任务 = 整段平移 Δ 天（开始日锚定目标日，各端点保时/保天精度）
				const dayMsOf = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
				const deltaMs = target.getTime() - dayMsOf(interval.start);
				const newStart = new Date(interval.start.getTime() + deltaMs);
				const newEnd = new Date(interval.end.getTime() + deltaMs);
				const startIsTime = sourceTask.datePrecision?.[startField] === 'time';
				const endIsTime = sourceTask.datePrecision?.[endField] === 'time';
				updates[startField] = startIsTime ? newStart : atMinutes(newStart, 0);
				updates[endField] = endIsTime ? newEnd : atMinutes(newEnd, 0);
				precision = { ...sourceTask.datePrecision };
			} else {
				// 全天单字段：dateField 平移到目标日（day 精度）；
				// 对端钳制：落点越过对端点所在日时钳到对端点日，避免制造倒置数据
				updates[dateField] = clampSingleFieldWrite(sourceTask, dateField, target, startField, endField);
				precision = { [dateField]: 'day' };
			}

			const taskToUpdate = { ...sourceTask, datePrecision: { ...sourceTask.datePrecision, ...precision } };
			await updateTaskProperties(app, taskToUpdate, updates, enabledFormats);
			await plugin.taskCache.refreshFile(sourceTask.filePath);
			refreshTasks();
		} catch (error) {
			Logger.error('MonthView', 'Error updating task date:', error);
			new Notice(i18n.t('views.dayView.updateDateFailed'));
		}
	}, [app, dateField, startField, endField, enabledFormats, dragLookupTasks, plugin, refreshTasks]);

	if (!monthData) {
		return <div ref={viewRef} className="gc-view gc-view--month" />;
	}

	const labelsSunFirst = i18n.t('views.monthView.weekdays') as unknown as string[];
	const labelsMonFirst = i18n.t('views.monthView.weekdaysMon') as unknown as string[];
	const weekdayLabels = startOnMonday ? labelsMonFirst : labelsSunFirst;

	const monthFontSize = plugin.settings.monthLunarFontSize || 10;
	const taskLimit = plugin.settings.monthViewTaskLimit || 5;

	return (
		<div className="gc-month-anim">
			<AnimatePresence initial={false} custom={slideDir} mode="popLayout">
				<motion.div
					key={monthKey}
					ref={viewRef}
					className="gc-view gc-view--month"
					custom={slideDir}
					variants={monthSlideVariants}
					initial="enter"
					animate="center"
					exit="exit"
					transition={easeOutTransition(MOTION.dur.normal)}
				>
				<div className={`${MonthViewClasses.elements.weekday} gc-month-view__weekday--empty`} />
			{weekdayLabels.map((label, i) => (
				<div key={i} className={MonthViewClasses.elements.weekday}>
					{label}
				</div>
			))}

			{monthData.weeks.map((week, weekIndex) => {
				const weekRow = weekIndex + 2;
				const weekModel = monthModel[weekIndex];
				// 横跨条带高度（含空行 0），格内内容以 padding-top 让位
				const stripH = (weekModel?.spanLaneCount ?? 0) * SPAN_ROW_PX + SPAN_STRIP_GAP_PX;
				return (
					<Fragment key={week.weekNumber}>
						<div
							className={MonthViewClasses.elements.weekNumber}
							style={{ gridRow: `${weekRow}`, gridColumn: '1' }}
						>
							<span>W{week.weekNumber}</span>
						</div>
						{/* 横跨条带 overlay：与 7 个日格同行同区域，从日期头部下方开始，pointer-events 穿透到格 */}
						<div
							className={MonthViewClasses.elements.spanStrip}
							style={{ gridRow: `${weekRow}`, gridColumn: '2 / -1', marginTop: `${SPAN_HEADER_OFFSET_PX}px`, height: `${stripH}px` }}
						>
							{(weekModel?.spanBars ?? []).map((bar) => (
								<div
									key={`span-${taskKey(bar.task)}`}
									className={`${MonthViewClasses.elements.spanBar}${bar.continuesBefore ? ` ${MonthViewClasses.modifiers.spanBarContinuesBefore}` : ''}${bar.continuesAfter ? ` ${MonthViewClasses.modifiers.spanBarContinuesAfter}` : ''}${bar.stackedIndex > 0 ? ` ${MonthViewClasses.modifiers.spanBarStacked}` : ''}`}
									style={{
										left: `calc(${(bar.startCol / 7) * 100}% + 1px)`,
										width: `calc(${((bar.endCol - bar.startCol + 1) / 7) * 100}% - 2px)`,
										top: `${bar.lane * SPAN_ROW_PX}px`,
										zIndex: bar.stackedIndex > 0 ? 3 : 1,
									}}
								>
									<TaskCard
										task={bar.task}
										config={config}
										targetDate={week.days[bar.startCol]?.date}
										onRefresh={handleCardRefresh}
									/>
									{bar.timeLabel ? (
										<span className={MonthViewClasses.elements.spanBarTime}>{bar.timeLabel}</span>
									) : null}
								</div>
							))}
						</div>
						{week.days.map((day, dayIndex) => {
							const cellClasses = [
								MonthViewClasses.elements.dayCell,
								!day.isCurrentMonth ? MonthViewClasses.modifiers.outsideMonth : '',
								day.isToday ? MonthViewClasses.modifiers.today : '',
							].filter(Boolean).join(' ');
							const key = toISOStringLocal(day.date);
							const dayTasks = weekModel?.cells.get(key) || [];
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
									<div className={MonthViewClasses.elements.tasks} style={{ paddingTop: `${stripH}px` }}>
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
				</motion.div>
			</AnimatePresence>
		</div>
	);
}

/** 目标日 00:00 + 分钟偏移 */
function atMinutes(base: Date, min: number): Date {
	const d = new Date(base);
	d.setHours(0, 0, 0, 0);
	d.setMinutes(min);
	return d;
}

function festivalClass(type: 'solar' | 'lunar' | 'solarTerm'): string {
	switch (type) {
		case 'solar': return MonthViewClasses.modifiers.festivalSolar;
		case 'lunar': return MonthViewClasses.modifiers.festivalLunar;
		case 'solarTerm': return MonthViewClasses.modifiers.festivalSolarTerm;
	}
}

/**
 * 相邻月切换滑入/滑出变体：dir=±1 时整宽双向平移（新板边贴边同速推进），
 * dir=0（同月/跨多月）仅淡入淡出，不做长距离滑屏。
 */
const monthSlideVariants: Variants = {
	enter: (dir: number) => ({ x: dir === 0 ? 0 : `${dir * 100}%`, opacity: 0 }),
	center: { x: 0, opacity: 1 },
	exit: (dir: number) => ({ x: dir === 0 ? 0 : `${-dir * 100}%`, opacity: 0 }),
};
