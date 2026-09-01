import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { taskKey } from '../utils/taskKey';
import type { DragEvent as ReactDragEvent } from 'react';
import { Notice } from 'obsidian';
import { getWeekOfDate } from '../../dateUtils/dateUtilsIndex';
import type { GCTask } from '../../types';
import type { DateFieldType } from '../../settings/types';
import { getTaskDateField } from '../../types';
import { WeekViewConfig } from '../../components/TaskCard';
import { WeekViewClasses } from '../../utils/bem';
import { usePlugin, useApp } from '../pluginContext';
import { useCalendarStore, selectViewFilter } from '../store/calendarStore';
import { applyStatusFilter, applyTagFilter, applySort } from '../utils/taskFilters';
import { TaskCard } from '../components/TaskCard';
import { Icon } from '../components/Icon';
import { updateTaskDateField } from '../../tasks/taskUpdater';
import { sortTasks } from '../../tasks/taskSorter';
import { toISOStringLocal } from '../../dateUtils/timezone';
import { generateVirtualInstances } from '../../tasks/virtualTaskGenerator';
import { openCreateTaskModal } from '../modals/TaskFormModal';
import { renderCurrentTimeLine } from '../../utils/currentTimeLine';
import { useTaskTooltip } from '../components/TooltipProvider';
import { i18n } from '../../i18n/i18n';
import { Logger } from '../../utils/logger';

/**
 * 周视图时间轴模式持久化标志（一旦激活，插件会话内保持，与旧实现 timelineActive 语义一致）
 */
let weekTimelineActive = false;

/**
 * 检测一周内是否存在带时间精度的任务（用于激活时间轴模式）
 */
function hasTimedTasksInRange(allTasks: GCTask[], dateField: DateFieldType, weekStart: Date, weekEnd: Date): boolean {
	for (const task of allTasks) {
		const precision = task.datePrecision?.[dateField ];
		if (precision !== 'time') continue;
		const dateValue = getTaskDateField(task, dateField );
		if (!dateValue) continue;
		const taskDate = new Date(dateValue);
		if (isNaN(taskDate.getTime())) continue;
		taskDate.setHours(0, 0, 0, 0);
		if (taskDate.getTime() >= weekStart.getTime() && taskDate.getTime() <= weekEnd.getTime()) {
			return true;
		}
	}
	return false;
}

/**
 * 判断任务日期是否为某一天的本地零点时间
 */
function sameDay(task: GCTask, dateField: DateFieldType, normalizedTarget: Date): boolean {
	const dateValue = getTaskDateField(task, dateField);
	if (!dateValue) return false;
	const taskDate = new Date(dateValue);
	if (isNaN(taskDate.getTime())) return false;
	taskDate.setHours(0, 0, 0, 0);
	return taskDate.getTime() === normalizedTarget.getTime();
}

/**
 * React 周视图
 * 时间轴模式：header + 时间标尺 + 任务格全部放在同一个 CSS grid 中（grid-row/grid-column 沿用旧实现）
 */
export function WeekView(): JSX.Element {
	const plugin = usePlugin();
	const app = useApp();
	const tooltip = useTaskTooltip();
	const currentDate = useCalendarStore((s) => s.currentDate);
	const tasks = useCalendarStore((s) => s.tasks);
	const filter = useCalendarStore((s) => selectViewFilter(s, 'week'));
	const updateSeq = useCalendarStore((s) => s.updateSeq);
	const refreshTasks = useCalendarStore((s) => s.refreshTasks);
	// 稳定回调：TaskCard 已 memo，内联箭头函数会使 memo 失效
	const handleCardRefresh = useCallback(() => refreshTasks(), [refreshTasks]);

	const startOnMonday = !!plugin.settings.startOnMonday;
	const dateField = plugin.settings.dateFilterField || 'dueDate';
	const showLunar = !!plugin.settings.showLunar;
	const recurringLimit = plugin.settings.recurringTaskDisplayLimit ?? 5;
	const enabledFormats = plugin.settings.enabledTaskFormats || [];

	const config = useMemo(() => ({
		...WeekViewConfig,
		enableDrag: true,
		showCheckbox: plugin.settings.weekViewShowCheckbox,
		showTags: plugin.settings.weekViewShowTags,
		showPriority: plugin.settings.weekViewShowPriority,
		showTicktick: plugin.settings.weekViewShowTicktick,
	}), [plugin.settings]);

	const weekData = useMemo(() => (
		getWeekOfDate(currentDate, currentDate.getFullYear(), startOnMonday)
	), [currentDate, startOnMonday]);

	const weekStart = useMemo(() => {
		const d = new Date(weekData.days[0].date);
		d.setHours(0, 0, 0, 0);
		return d;
	}, [weekData]);

	const weekEnd = useMemo(() => {
		const d = new Date(weekData.days[6].date);
		d.setHours(0, 0, 0, 0);
		return d;
	}, [weekData]);

	// 全局筛选 + 排序
	const scoped = useMemo(() => (
		applySort(applyTagFilter(applyStatusFilter(tasks, filter.status), filter.tag), filter.sort)
	), [tasks, filter]);

	const hasTimed = useMemo(() => (
		hasTimedTasksInRange(scoped, dateField, weekStart, weekEnd)
	), [scoped, dateField, weekStart, weekEnd]);

	// 会话级时间轴模式标志：一旦激活则保持
	const [timelineActive, setTimelineActive] = useState(() => weekTimelineActive);
	useEffect(() => {
		if (hasTimed) {
			if (!weekTimelineActive) weekTimelineActive = true;
			setTimelineActive(true);
		}
	}, [hasTimed]);
	const useTimeline = timelineActive || hasTimed;

	const hasTodayInWeek = useMemo(() => weekData.days.some((d) => d.isToday), [weekData]);

	// 预生成整周的虚拟周期实例
	const virtualInstances = useMemo(() => (
		generateVirtualInstances(scoped, weekStart, weekEnd, dateField, recurringLimit)
	), [scoped, weekStart, weekEnd, dateField, recurringLimit]);

	// 扁平列表模式：每天的任务集合（真实 + 虚拟，已排序）
	const flatDayTasks = useMemo(() => {
		const map = new Map<string, GCTask[]>();
		for (const day of weekData.days) {
			const normalized = new Date(day.date);
			normalized.setHours(0, 0, 0, 0);
			const real = scoped.filter((t) => sameDay(t, dateField, normalized));
			const virt = virtualInstances.filter((t) => sameDay(t, dateField, normalized));
			map.set(toISOStringLocal(day.date), sortTasks([...real, ...virt], filter.sort));
		}
		return map;
	}, [weekData, scoped, virtualInstances, dateField, filter.sort]);

	// 时间轴模式：每天分离全天任务与按小时的定时任务
	const timelineDayData = useMemo(() => {
		const map = new Map<string, { allday: GCTask[]; hours: Map<number, GCTask[]> }>();
		for (const day of weekData.days) {
			const normalized = new Date(day.date);
			normalized.setHours(0, 0, 0, 0);
			const combined = sortTasks([
				...scoped.filter((t) => sameDay(t, dateField, normalized)),
				...virtualInstances.filter((t) => sameDay(t, dateField, normalized)),
			], filter.sort);
			const allday: GCTask[] = [];
			const hours = new Map<number, GCTask[]>();
			for (const task of combined) {
				const precision = task.datePrecision?.[dateField ];
				if (precision === 'time') {
					const dateValue = getTaskDateField(task, dateField );
					const hour = dateValue ? new Date(dateValue).getHours() : 0;
					const list = hours.get(hour) || [];
					list.push(task);
					hours.set(hour, list);
				} else {
					allday.push(task);
				}
			}
			map.set(toISOStringLocal(day.date), { allday, hours });
		}
		return map;
	}, [weekData, scoped, virtualInstances, dateField, filter.sort]);

	// ===== 拖放状态 =====
	const [dragRow, setDragRow] = useState<number | null>(null);
	const [alldayDragOver, setAlldayDragOver] = useState(false);
	const [flatDragOver, setFlatDragOver] = useState<string | null>(null);

	const gridRef = useRef<HTMLDivElement | null>(null);

	// 当前时间指示线（复用 renderCurrentTimeLine：以每小时时间格为基准计算偏移）
	useEffect(() => {
		if (!useTimeline || !hasTodayInWeek || !gridRef.current) return;
		const grid = gridRef.current;
		grid.querySelector(`.${WeekViewClasses.elements.currentTimeLine}`)?.remove();
		renderCurrentTimeLine(grid, `.${WeekViewClasses.elements.timeSlot}`, WeekViewClasses.elements.currentTimeLine);
	}, [useTimeline, updateSeq, hasTodayInWeek, weekStart]);

	// 每 30s 重画一次当前时间线，否则挂机数小时后红线位置严重滞后
	useEffect(() => {
		if (!useTimeline || !hasTodayInWeek) return;
		const timer = window.setInterval(() => {
			const grid = gridRef.current;
			if (!grid) return;
			grid.querySelector(`.${WeekViewClasses.elements.currentTimeLine}`)?.remove();
			renderCurrentTimeLine(grid, `.${WeekViewClasses.elements.timeSlot}`, WeekViewClasses.elements.currentTimeLine);
		}, 30_000);
		return () => window.clearInterval(timer);
	}, [useTimeline, hasTodayInWeek, weekStart]);

	// ===== 解析拖拽任务 =====
	const parseDropTask = useCallback((e: ReactDragEvent): GCTask | null => {
		const taskId = e.dataTransfer?.getData('taskId');
		if (!taskId) return null;
		const [filePath, lineNum] = taskId.split(':');
		const lineNumber = parseInt(lineNum, 10);
		const sourceTask = tasks.find((t) => t.filePath === filePath && t.lineNumber === lineNumber);
		if (!sourceTask) {
			Logger.error('WeekView', 'Source task not found:', taskId);
		}
		return sourceTask || null;
	}, [tasks]);

	// ===== 时间格拖放：落点行的小时 =====
	const handleTimeSlotDragOver = useCallback((e: ReactDragEvent, hour: number) => {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
		setDragRow(hour);
	}, []);

	const handleTimeSlotDragLeave = useCallback((e: ReactDragEvent) => {
		const related = e.relatedTarget as Node | null;
		if (related && e.currentTarget.contains(related)) return;
		setDragRow(null);
	}, []);

	const handleTimeSlotDrop = useCallback((e: ReactDragEvent, targetDate: Date, hour: number) => {
		e.preventDefault();
		setDragRow(null);
		const sourceTask = parseDropTask(e);
		if (!sourceTask) return;

		void (async () => {
			try {
				tooltip.cancel();
				const newDate = new Date(targetDate);
				newDate.setHours(hour, 0, 0, 0);
				// 拖到时间格 = time 精度。传入浅拷贝而非变异 store 中的共享对象
				const timedTask = { ...sourceTask, datePrecision: { ...sourceTask.datePrecision, [dateField]: 'time' } };
				await updateTaskDateField(app, timedTask, dateField, newDate, enabledFormats);
				// 立即刷新指定文件的 Repository 缓存（跳过文件事件 50ms 防抖），
				// 然后通知视图。Repository 缓存更新后 getAllTasks() 返回最新数据。
				await plugin.taskCache.refreshFile(sourceTask.filePath);
				refreshTasks();
				Logger.debug('WeekView', 'Task time updated via drag-drop', {
					taskId: `${sourceTask.filePath}:${sourceTask.lineNumber}`,
					hour,
				});
			} catch (error) {
				Logger.error('WeekView', 'Error updating task time:', error);
				new Notice(i18n.t('views.dayView.updateTimeFailed'));
			}
		})();
	}, [app, dateField, enabledFormats, parseDropTask, plugin]);

	// ===== 全天行拖放（设为全天任务） =====
	const handleAlldayDragOver = useCallback((e: ReactDragEvent) => {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
		setAlldayDragOver(true);
	}, []);

	const handleAlldayDragLeave = useCallback((e: ReactDragEvent) => {
		const related = e.relatedTarget as Node | null;
		if (related && e.currentTarget.contains(related)) return;
		setAlldayDragOver(false);
	}, []);

	const handleAlldayDrop = useCallback((e: ReactDragEvent, targetDate: Date) => {
		e.preventDefault();
		setAlldayDragOver(false);
		const sourceTask = parseDropTask(e);
		if (!sourceTask) return;

		void (async () => {
			try {
				tooltip.cancel();
				const newDate = new Date(targetDate);
				newDate.setHours(0, 0, 0, 0);
				// 拖到全天行 = day 精度。同样走浅拷贝
				const dayTask = { ...sourceTask, datePrecision: { ...sourceTask.datePrecision, [dateField]: 'day' } };
				await updateTaskDateField(app, dayTask, dateField, newDate, enabledFormats);
				await plugin.taskCache.refreshFile(sourceTask.filePath);
				refreshTasks();
				Logger.debug('WeekView', 'Task set to all-day via drag-drop', {
					taskId: `${sourceTask.filePath}:${sourceTask.lineNumber}`,
					targetDate,
				});
			} catch (error) {
				Logger.error('WeekView', 'Error updating task to all-day:', error);
				new Notice(i18n.t('views.dayView.updateTaskFailed'));
			}
		})();
	}, [app, dateField, enabledFormats, parseDropTask, plugin]);

	// ===== 扁平列表列拖放（保留原时间） =====
	const handleColumnDragOver = useCallback((e: ReactDragEvent, dateKey: string) => {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
		setFlatDragOver(dateKey);
	}, []);

	const handleColumnDragLeave = useCallback((e: ReactDragEvent) => {
		const related = e.relatedTarget as Node | null;
		if (related && e.currentTarget.contains(related)) return;
		setFlatDragOver(null);
	}, []);

	const handleColumnDrop = useCallback((e: ReactDragEvent, targetDate: Date) => {
		e.preventDefault();
		setFlatDragOver(null);
		const sourceTask = parseDropTask(e);
		if (!sourceTask) return;

		void (async () => {
			try {
				tooltip.hide();
				const newDate = new Date(targetDate);
				const original = getTaskDateField(sourceTask, dateField );
				if (original) {
					const orig = new Date(original);
					if (!isNaN(orig.getTime())) {
						newDate.setHours(orig.getHours(), orig.getMinutes(), orig.getSeconds(), 0);
					}
				}
				await updateTaskDateField(app, sourceTask, dateField, newDate, enabledFormats);
				await plugin.taskCache.refreshFile(sourceTask.filePath);
				refreshTasks();
				Logger.debug('WeekView', 'Task drag-drop update successful', {
					taskId: `${sourceTask.filePath}:${sourceTask.lineNumber}`,
					dateField,
					targetDate,
				});
			} catch (error) {
				Logger.error('WeekView', 'Error updating task date:', error);
				new Notice(i18n.t('views.dayView.updateDateFailed'));
			}
		})();
	}, [app, dateField, enabledFormats, parseDropTask, plugin]);

	// ===== 渲染 =====
	const dayNames = i18n.t('views.weekView.weekdays') as unknown as string[];
	const allDayLabel = i18n.t('views.weekView.allDay');

	return (
		<div className={`gc-view gc-view--week${useTimeline ? ` ${WeekViewClasses.modifiers.timeline}` : ''}`}>
			<div className={WeekViewClasses.elements.grid}>
				{useTimeline ? (
					<div className={WeekViewClasses.elements.tasksGrid} ref={gridRef}>
						<div className={WeekViewClasses.elements.headerSpacer} style={{ gridColumn: '1', gridRow: '1' }} />
						{weekData.days.map((day, dayIdx) => (
							<div
								key={`week-h-${dayIdx}`}
								className={`${WeekViewClasses.elements.headerCell}${day.isToday ? ` ${WeekViewClasses.modifiers.today}` : ''}`}
								style={{ gridColumn: `${dayIdx + 2}`, gridRow: '1' }}
							>
								<div className={WeekViewClasses.elements.dayName}>{dayNames[day.weekday]}</div>
								<div className={WeekViewClasses.elements.dayNumber}>{day.day.toString()}</div>
								{day.lunarText && showLunar ? (
									<div className={WeekViewClasses.elements.lunarText}>{day.lunarText}</div>
								) : null}
							</div>
						))}

						<div className={WeekViewClasses.elements.alldayGutter} style={{ gridColumn: '1', gridRow: '2' }}>
							{allDayLabel}
						</div>
						{weekData.days.map((day, dayIdx) => (
							<div
								key={`week-a-${dayIdx}`}
								className={`${WeekViewClasses.elements.alldaySlot}${day.isToday ? ` ${WeekViewClasses.modifiers.alldaySlotToday}` : ''}${alldayDragOver ? ` ${WeekViewClasses.modifiers.alldayDragOver}` : ''}`}
								style={{ gridColumn: `${dayIdx + 2}`, gridRow: '2' }}
								onDragOver={handleAlldayDragOver}
								onDragLeave={handleAlldayDragLeave}
								onDrop={(e) => void handleAlldayDrop(e, day.date)}
							>
								<div className={WeekViewClasses.elements.alldayTasks}>
									{(timelineDayData.get(toISOStringLocal(day.date))?.allday || []).map((t) => (
										<TaskCard
											key={taskKey(t)}
											task={t}
											config={config}
											targetDate={day.date}
											onClick={() => tooltip.hide()}
											onRefresh={handleCardRefresh}
										/>
									))}
								</div>
							</div>
						))}

						{Array.from({ length: 24 }, (_, hour) => (
							<div
								key={`week-g-${hour}`}
								className={`${WeekViewClasses.elements.timeGutterSlot}${dragRow === hour ? ` ${WeekViewClasses.modifiers.dragOver}` : ''}`}
								style={{ gridColumn: '1', gridRow: `${hour + 3}` }}
							>
								<div className={WeekViewClasses.elements.timeGutterLabel}>
									{`${String(hour).padStart(2, '0')}:00`}
								</div>
							</div>
						))}

						{weekData.days.map((day, dayIdx) => (
							Array.from({ length: 24 }, (_, hour) => {
								const hourTasks = timelineDayData.get(toISOStringLocal(day.date))?.hours.get(hour) || [];
								return (
									<div
										key={`week-s-${dayIdx}-${hour}`}
										className={`${WeekViewClasses.elements.timeSlot}${day.isToday ? ` ${WeekViewClasses.modifiers.timeSlotToday}` : ''}${dragRow === hour ? ` ${WeekViewClasses.modifiers.dragOver}` : ''}`}
										style={{ gridColumn: `${dayIdx + 2}`, gridRow: `${hour + 3}` }}
										onDragOver={(e) => handleTimeSlotDragOver(e, hour)}
										onDragLeave={handleTimeSlotDragLeave}
										onDrop={(e) => void handleTimeSlotDrop(e, day.date, hour)}
									>
										<div className={WeekViewClasses.elements.timeTasks}>
											{hourTasks.map((t) => (
												<TaskCard
													key={taskKey(t)}
													task={t}
													config={config}
													targetDate={day.date}
													onClick={() => tooltip.hide()}
													onRefresh={handleCardRefresh}
												/>
											))}
										</div>
										{hourTasks.length === 0 ? (
											<SlotCreateButton
												hour={hour}
												targetDate={day.date}
												onSuccess={() => refreshTasks()}
											/>
										) : null}
									</div>
								);
							})
						))}
					</div>
				) : (
					<>
						<div className={WeekViewClasses.elements.headerRow}>
							{weekData.days.map((day, dayIdx) => (
								<div
									key={`flat-h-${dayIdx}`}
									className={`${WeekViewClasses.elements.headerCell}${day.isToday ? ` ${WeekViewClasses.modifiers.today}` : ''}`}
								>
									<div className={WeekViewClasses.elements.dayName}>{dayNames[day.weekday]}</div>
									<div className={WeekViewClasses.elements.dayNumber}>{day.day.toString()}</div>
									{day.lunarText && showLunar ? (
										<div className={WeekViewClasses.elements.lunarText}>{day.lunarText}</div>
									) : null}
								</div>
							))}
						</div>
						<div className={WeekViewClasses.elements.tasksGrid}>
							{weekData.days.map((day, dayIdx) => {
								const key = toISOStringLocal(day.date);
								const dayTasks = flatDayTasks.get(key) || [];
								return (
									<div
										key={`flat-c-${dayIdx}`}
										className={`${WeekViewClasses.elements.tasksColumn}${day.isToday ? ` ${WeekViewClasses.modifiers.tasksColumnToday}` : ''}`}
										data-date={key}
										style={{ backgroundColor: flatDragOver === key ? 'var(--background-modifier-hover)' : '' }}
										onDragOver={(e) => handleColumnDragOver(e, key)}
										onDragLeave={handleColumnDragLeave}
										onDrop={(e) => void handleColumnDrop(e, day.date)}
									>
										{dayTasks.length === 0 ? (
											<div className={WeekViewClasses.elements.empty}>
												{i18n.t('common.noTasks')}
											</div>
										) : (
											dayTasks.map((t) => (
												<TaskCard
													key={taskKey(t)}
													task={t}
													config={config}
													targetDate={day.date}
													onClick={() => tooltip.hide()}
													onRefresh={handleCardRefresh}
												/>
											))
										)}
									</div>
								);
							})}
						</div>
					</>
				)}
			</div>
		</div>
	);
}


/**
 * 空时间格 "+" 快速创建按钮（点击创建带目标日期与小时的任务）
 */
function SlotCreateButton({
	hour,
	targetDate,
	onSuccess,
}: {
	hour: number;
	targetDate: Date;
	onSuccess: () => void;
}): JSX.Element {
	const plugin = usePlugin();
	const app = useApp();

	return (
		<div
			className={WeekViewClasses.elements.slotCreate}
			role="button"
			tabIndex={0}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					(e.currentTarget as HTMLElement).click();
				}
			}}
			onClick={(e) => {
				e.stopPropagation();
				openCreateTaskModal({
					app,
					plugin,
					targetDate,
					targetHour: hour,
					onSuccess,
				});
			}}
		>
			<Icon icon="plus" />
		</div>
	);
}