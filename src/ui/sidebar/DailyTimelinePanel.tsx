import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { Notice } from 'obsidian';
import type { GCTask } from '../../types';
import type { DateFieldType } from '../../settings/types';
import { i18n } from '../../i18n/i18n';
import { SidebarClasses } from '../../utils/bem';
import { buildSidebarConfig } from '../../components/TaskCard';
import { getTodayInTimezone } from '../../dateUtils/timezone';
import { formatDate } from '../../dateUtils/dateUtilsIndex';
import { updateTaskProperties } from '../../tasks/taskUpdater';
import { getTaskInterval } from '../views/week/timelineModel';
import { buildDayTimelineModel } from '../views/week/timelineModel';
import { DayTimelineCanvas } from '../views/week/DayTimelineCanvas';
import { Logger } from '../../utils/logger';
import { usePlugin, useApp } from '../pluginContext';
import { useCalendarStore } from '../store/calendarStore';
import { useDropTarget } from '../utils/useDragAndDrop';
import { Icon } from '../components/Icon';
import { TaskCard } from '../components/TaskCard';

/** dataTransfer.taskId（filePath:lineNumber）→ 任务查找 */
function findTaskById(tasks: GCTask[], taskId: string): GCTask | null {
	const [filePath, lineNum] = taskId.split(':');
	const lineNumber = parseInt(lineNum, 10);
	return tasks.find((t) => t.filePath === filePath && t.lineNumber === lineNumber) || null;
}

/** 归零到本地午夜（Date 比较以 getTime 为准，需先抹平时分秒） */
function atMidnight(date: Date): Date {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	return d;
}

/** 按日历日平移：跨月/跨年/闰日由 Date 归一化，仍是本地午夜 */
function shiftDay(date: Date, delta: number): Date {
	const d = new Date(date);
	d.setDate(d.getDate() + delta);
	d.setHours(0, 0, 0, 0);
	return d;
}

/**
 * 侧边栏 — 每日时间线 Tab（连续画布版）
 * 日期默认"今天"，标题行右侧导航可前后切换；跨天后跟随态自动前进。
 * 全天区域（含 ≥24h 长区间任务）+ 共享单日连续画布 DayTimelineCanvas
 */
export function DailyTimelinePanel(): JSX.Element {
	const plugin = usePlugin();
	const app = useApp();
	const tasks = useCalendarStore((s) => s.tasks);
	const refreshTasks = useCalendarStore((s) => s.refreshTasks);

	/** 手动选定的日期；null = 跟随"今天"（默认态，时钟跨天后自动前进） */
	const [pickedDate, setPickedDate] = useState<Date | null>(null);
	const [today, setToday] = useState<Date>(() => atMidnight(getTodayInTimezone()));
	const day = pickedDate ?? today;

	// 长时间挂起的侧栏（休眠恢复/跨天）：刷新"今天"基线；已手动选定的日期不受影响
	useEffect(() => {
		const syncToday = (): void => {
			const fresh = atMidnight(getTodayInTimezone());
			setToday((prev) => (prev.getTime() === fresh.getTime() ? prev : fresh));
		};
		const onWake = (): void => {
			if (!document.hidden) syncToday();
		};
		document.addEventListener('visibilitychange', onWake);
		window.addEventListener('focus', onWake);
		return () => {
			document.removeEventListener('visibilitychange', onWake);
			window.removeEventListener('focus', onWake);
		};
	}, []);

	const config = useMemo(() => buildSidebarConfig(plugin.settings), [plugin.settings]);
	// 时间线内统一使用紧凑变体，高度由块容器按时长撑开
	const timelineConfig = useMemo(() => ({ ...config, variant: 'timeline' as const }), [config]);

	// 侧栏语义保持以 dueDate 为读取字段；区间路由用 gantt 起止字段（与周视图一致）
	const dateField: DateFieldType = 'dueDate';
	const startField = plugin.settings.ganttStartField || 'startDate';
	const endField = plugin.settings.ganttEndField || 'dueDate';
	const enabledFormats = plugin.settings.enabledTaskFormats || [];

	const candidates = useMemo(() => tasks.filter((t) => !t.cancelled), [tasks]);
	const model = useMemo(() => (
		buildDayTimelineModel(candidates, day, startField, endField, dateField)
	), [candidates, day, startField, endField, dateField]);

	// ===== 日期导航 =====
	const goPrevDay = useCallback(() => setPickedDate(shiftDay(day, -1)), [day]);
	const goNextDay = useCallback(() => setPickedDate(shiftDay(day, 1)), [day]);
	const goToday = useCallback(() => setPickedDate(null), []);

	// ===== 全天区拖放：转全天（day 精度） =====
	const handleAllDayDrop = useCallback((taskId: string): void => {
		const task = findTaskById(candidates, taskId);
		if (!task) return;
		const interval = getTaskInterval(task, startField, endField, dateField);
		const updates: Partial<Record<DateFieldType, Date>> = {};
		let precision: Partial<Record<DateFieldType, 'day' | 'time'>> = {};
		if (interval) {
			updates[startField] = day;
			updates[endField] = day;
			precision = { [startField]: 'day', [endField]: 'day' };
		} else {
			updates[dateField] = day;
			precision = { [dateField]: 'day' };
		}
		void (async () => {
			try {
				const taskToUpdate = { ...task, datePrecision: { ...task.datePrecision, ...precision } };
				await updateTaskProperties(app, taskToUpdate, updates, enabledFormats);
				await plugin.taskCache.refreshFile(task.filePath);
				useCalendarStore.getState().notifyTasksUpdated(plugin.taskCache.getAllTasks(), task.filePath);
			} catch (error) {
				Logger.error('DailyTimelinePanel', 'Set all-day failed:', error);
				new Notice(i18n.t('views.dayView.updateTaskFailed'));
			}
		})();
	}, [candidates, day, app, plugin, startField, endField, dateField, enabledFormats]);

	const allDayDropProps = useDropTarget({
		onDrop: (taskId) => handleAllDayDrop(taskId),
		activeClass: 'gc-sidebar__all-day--drag-over',
	});

	const weekdayNames = i18n.t('sidebar.dailyTimeline.weekdays') as unknown as string[];
	const isEmpty = model.blocks.length === 0 && model.allday.length === 0;
	const handleRefresh = useCallback(() => refreshTasks(), [refreshTasks]);

	const navPrevLabel = i18n.t('sidebar.dailyTimeline.nav.prevDay');
	const navNextLabel = i18n.t('sidebar.dailyTimeline.nav.nextDay');
	const navTodayLabel = i18n.t('sidebar.dailyTimeline.nav.goToday');

	return (
		<>
			<div className={SidebarClasses.elements.timelineHeader}>
				<div className={SidebarClasses.elements.timelineTitle}>
					{`${formatDate(day, 'MM/dd')} ${weekdayNames[day.getDay()]}`}
				</div>
				<div className={SidebarClasses.elements.timelineNav}>
					<button
						type="button"
						className="clickable-icon"
						aria-label={navPrevLabel}
						onClick={goPrevDay}
					>
						<Icon icon="chevron-left" />
					</button>
					<button
						type="button"
						className={SidebarClasses.elements.timelineTodayBtn}
						aria-label={navTodayLabel}
						disabled={pickedDate === null}
						onClick={goToday}
					>
						{i18n.t('sidebar.dailyTimeline.nav.today')}
					</button>
					<button
						type="button"
						className="clickable-icon"
						aria-label={navNextLabel}
						onClick={goNextDay}
					>
						<Icon icon="chevron-right" />
					</button>
				</div>
			</div>

			{isEmpty ? (
				<div className={SidebarClasses.elements.emptyState}>
					{i18n.t('sidebar.dailyTimeline.noTasks')}
				</div>
			) : null}

			{/* 全天区域（始终渲染为拖放目标）：day 精度命中 + 覆盖当日的 ≥24h 长区间 */}
			<div className={SidebarClasses.elements.timelineAllDay} {...allDayDropProps}>
				<div className={SidebarClasses.elements.timelineAllDayLabel}>
					{i18n.t('sidebar.dailyTimeline.allDay')}
				</div>
				<div className={SidebarClasses.elements.timelineAllDayTasks}>
					{model.allday.map(({ task, timeLabel }) => (
						<div key={`${task.filePath}:${task.lineNumber}`} className={SidebarClasses.elements.timelineAllDayItem}>
							<TaskCard task={task} config={timelineConfig} />
							{timeLabel ? (
								<span className={SidebarClasses.elements.timelineAllDayTime}>{timeLabel}</span>
							) : null}
						</div>
					))}
				</div>
			</div>

			{/* 连续时间画布（与周视图/日视图同语义的共享组件） */}
			<DayTimelineCanvas
				day={day}
				model={model}
				config={timelineConfig}
				tasks={candidates}
				refresh={handleRefresh}
			/>
		</>
	);
}
