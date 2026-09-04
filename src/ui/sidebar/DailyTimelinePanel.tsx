import { useCallback, useMemo, type JSX } from 'react';
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
import { openFileInExistingLeaf } from '../../utils/fileOpener';
import { Logger } from '../../utils/logger';
import { usePlugin, useApp } from '../pluginContext';
import { useCalendarStore } from '../store/calendarStore';
import { useDropTarget } from '../utils/useDragAndDrop';
import { TaskCard } from '../components/TaskCard';

/** dataTransfer.taskId（filePath:lineNumber）→ 任务查找 */
function findTaskById(tasks: GCTask[], taskId: string): GCTask | null {
	const [filePath, lineNum] = taskId.split(':');
	const lineNumber = parseInt(lineNum, 10);
	return tasks.find((t) => t.filePath === filePath && t.lineNumber === lineNumber) || null;
}

/**
 * 侧边栏 — 今日时间线 Tab（连续画布版）
 * 全天区域（含 ≥24h 长区间任务）+ 共享单日连续画布 DayTimelineCanvas
 */
export function DailyTimelinePanel(): JSX.Element {
	const plugin = usePlugin();
	const app = useApp();
	const tasks = useCalendarStore((s) => s.tasks);
	const refreshTasks = useCalendarStore((s) => s.refreshTasks);

	const today = useMemo(() => {
		const d = getTodayInTimezone();
		d.setHours(0, 0, 0, 0);
		return d;
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
		buildDayTimelineModel(candidates, today, startField, endField, dateField)
	), [candidates, today, startField, endField, dateField]);

	// ===== 全天区拖放：转全天（day 精度） =====
	const handleAllDayDrop = useCallback((taskId: string): void => {
		const task = findTaskById(candidates, taskId);
		if (!task) return;
		const interval = getTaskInterval(task, startField, endField, dateField);
		const updates: Partial<Record<DateFieldType, Date>> = {};
		let precision: Partial<Record<DateFieldType, 'day' | 'time'>> = {};
		if (interval) {
			updates[startField] = today;
			updates[endField] = today;
			precision = { [startField]: 'day', [endField]: 'day' };
		} else {
			updates[dateField] = today;
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
	}, [candidates, today, app, plugin, startField, endField, dateField, enabledFormats]);

	const allDayDropProps = useDropTarget({
		onDrop: (taskId) => handleAllDayDrop(taskId),
		activeClass: 'gc-sidebar__all-day--drag-over',
	});

	const weekdayNames = i18n.t('sidebar.dailyTimeline.weekdays') as unknown as string[];
	const isEmpty = model.blocks.length === 0 && model.allday.length === 0;
	const handleRefresh = useCallback(() => refreshTasks(), [refreshTasks]);

	return (
		<>
			<div className={SidebarClasses.elements.timelineHeader}>
				{`${formatDate(today, 'MM/dd')} ${weekdayNames[today.getDay()]}`}
			</div>

			{isEmpty ? (
				<div className={SidebarClasses.elements.emptyState}>
					{i18n.t('sidebar.dailyTimeline.noTasks')}
				</div>
			) : null}

			{/* 全天区域（始终渲染为拖放目标）：day 精度命中 + 覆盖今日的 ≥24h 长区间 */}
			<div className={SidebarClasses.elements.timelineAllDay} {...allDayDropProps}>
				<div className={SidebarClasses.elements.timelineAllDayLabel}>
					{i18n.t('sidebar.dailyTimeline.allDay')}
				</div>
				<div className={SidebarClasses.elements.timelineAllDayTasks}>
					{model.allday.map(({ task, timeLabel }) => (
						<div key={`${task.filePath}:${task.lineNumber}`} className={SidebarClasses.elements.timelineAllDayItem}>
							<TaskCard task={task} config={timelineConfig} onClick={(t) => void openFileInExistingLeaf(app, t.filePath, t.lineNumber)} />
							{timeLabel ? (
								<span className={SidebarClasses.elements.timelineAllDayTime}>{timeLabel}</span>
							) : null}
						</div>
					))}
				</div>
			</div>

			{/* 连续时间画布（与周视图/日视图同语义的共享组件） */}
			<DayTimelineCanvas
				day={today}
				model={model}
				config={timelineConfig}
				tasks={candidates}
				refresh={handleRefresh}
			/>
		</>
	);
}
