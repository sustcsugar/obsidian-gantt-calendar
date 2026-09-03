import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Notice } from 'obsidian';
import type { GCTask } from '../../types';
import { i18n } from '../../i18n/i18n';
import { SidebarClasses } from '../../utils/bem';
import { buildSidebarConfig } from '../../components/TaskCard';
import { getTodayInTimezone, isTodayInTimezone } from '../../dateUtils/timezone';
import { formatDate } from '../../dateUtils/dateUtilsIndex';
import { openFileInExistingLeaf } from '../../utils/fileOpener';
import { updateTaskDateField } from '../../tasks/taskUpdater';
import { openCreateTaskModal } from '../modals/TaskFormModal';
import { Logger } from '../../utils/logger';
import { usePlugin, useApp } from '../pluginContext';
import { useCalendarStore } from '../store/calendarStore';
import { useDropTarget } from '../utils/useDragAndDrop';
import { TaskCard } from '../components/TaskCard';
import { Icon } from '../components/Icon';

const TIMELINE_SLOT_CLASS = SidebarClasses.elements.timelineTimeSlot;
const TIMELINE_CURRENT_TIME_CLASS = SidebarClasses.elements.timelineCurrentTime;

function getDatePrecision(task: GCTask): 'day' | 'time' {
	return task.datePrecision?.dueDate === 'time' ? 'time' : 'day';
}

function getTaskTime(task: GCTask): number | null {
	if (task.dueDate && task.datePrecision?.dueDate === 'time') {
		return task.dueDate.getHours() * 60 + task.dueDate.getMinutes();
	}
	return null;
}

/**
 * 侧边栏 — 今日时间线 Tab（React 版）
 * 全天区域 + 24 小时格，支持拖放改期/改时间、空槽点击创建任务
 */
export function DailyTimelinePanel(): JSX.Element {
	const plugin = usePlugin();
	const app = useApp();
	const tasks = useCalendarStore((s) => s.tasks);

	const today = useMemo(() => getTodayInTimezone(), []);
	const allTasks = tasks;
	const config = useMemo(() => buildSidebarConfig(plugin.settings), [plugin.settings]);

	// 今天的任务（未取消 + dueDate 今天）
	const todayTasks = useMemo(
		() => allTasks.filter(t => !t.cancelled && t.dueDate && isTodayInTimezone(t.dueDate)),
		[allTasks]
	);

	const { allDayTasks, timedTasks } = useMemo(() => {
		const allDay: GCTask[] = [];
		const timed: GCTask[] = [];
		for (const task of todayTasks) {
			if (getDatePrecision(task) === 'time') {
				timed.push(task);
			} else {
				allDay.push(task);
			}
		}
		timed.sort((a, b) => {
			const timeA = getTaskTime(a);
			const timeB = getTaskTime(b);
			if (timeA === null && timeB === null) return 0;
			if (timeA === null) return 1;
			if (timeB === null) return -1;
			return timeA - timeB;
		});
		return { allDayTasks: allDay, timedTasks: timed };
	}, [todayTasks]);

	// 按时段分组
	const hourGroups = useMemo(() => {
		const groups = new Map<number, GCTask[]>();
		for (const task of timedTasks) {
			const time = getTaskTime(task);
			if (time === null) continue;
			const hour = Math.floor(time / 60);
			if (!groups.has(hour)) groups.set(hour, []);
			groups.get(hour)!.push(task);
		}
		return groups;
	}, [timedTasks]);

	const dateFieldName = plugin.settings.dateFilterField || 'dueDate';

	// ===== 拖放：时间格 =====
	const handleSlotDrop = (hour: number, taskId: string): void => {
		const [filePath, lineNum] = taskId.split(':');
		const lineNumber = parseInt(lineNum, 10);
		const sourceTask = allTasks.find(t => t.filePath === filePath && t.lineNumber === lineNumber);
		if (!sourceTask) {
			Logger.error('DailyTimelinePanel', 'Source task not found:', taskId);
			return;
		}

		void (async () => {
			try {
				const newDate = new Date(today);
				newDate.setHours(hour, 0, 0, 0);
				// 浅拷贝而非变异 store 中的共享对象
				const timedTask = { ...sourceTask, datePrecision: { ...sourceTask.datePrecision, [dateFieldName]: 'time' } };
				await updateTaskDateField(app, timedTask, dateFieldName, newDate, plugin.settings.enabledTaskFormats);
				// 写回后立即刷新缓存并推送数据（跳过 125ms 防抖回流）
				await plugin.taskCache.refreshFile(sourceTask.filePath);
				useCalendarStore.getState().notifyTasksUpdated(
					plugin.taskCache.getAllTasks(), sourceTask.filePath
				);
				Logger.debug('DailyTimelinePanel', 'Task time updated via drag-drop', { taskId, hour });
			} catch (error) {
				Logger.error('DailyTimelinePanel', 'Error updating task time:', error);
				new Notice(i18n.t('views.dayView.updateTimeFailed'));
			}
		})();
	};

	// ===== 拖放：全天区域 =====
	const handleAllDayDrop = (taskId: string): void => {
		const [filePath, lineNum] = taskId.split(':');
		const lineNumber = parseInt(lineNum, 10);
		const sourceTask = allTasks.find(t => t.filePath === filePath && t.lineNumber === lineNumber);
		if (!sourceTask) return;

		void (async () => {
			try {
				const dayTask = { ...sourceTask, datePrecision: { ...sourceTask.datePrecision, [dateFieldName]: 'day' } };
				await updateTaskDateField(app, dayTask, dateFieldName, today, plugin.settings.enabledTaskFormats);
				await plugin.taskCache.refreshFile(sourceTask.filePath);
				useCalendarStore.getState().notifyTasksUpdated(
					plugin.taskCache.getAllTasks(), sourceTask.filePath
				);
				Logger.debug('DailyTimelinePanel', 'Task set to all-day via drag-drop', { taskId });
			} catch (error) {
				Logger.error('DailyTimelinePanel', 'Error setting task to all-day:', error);
				new Notice(i18n.t('views.dayView.updateTaskFailed'));
			}
		})();
	};

	// ===== 当前时间指示线（React 组件化替代 renderCurrentTimeLine） =====
	const timelineRef = useRef<HTMLDivElement | null>(null);
	const [currentLineTop, setCurrentLineTop] = useState<number | null>(null);

	useEffect(() => {
		const update = () => {
			if (!timelineRef.current) return;
			const now = new Date();
			const currentHour = now.getHours();
			if (currentHour < 0 || currentHour >= 24) {
				setCurrentLineTop(null);
				return;
			}
			const slots = timelineRef.current.querySelectorAll(`.${TIMELINE_SLOT_CLASS}`);
			const slot = slots[currentHour] as HTMLElement | undefined;
			if (!slot) {
				setCurrentLineTop(null);
				return;
			}
			const minuteOffset = (now.getMinutes() / 60) * slot.offsetHeight;
			setCurrentLineTop(slot.offsetTop + minuteOffset);
		};
		update();
		const interval = window.setInterval(update, 60000);
		return () => window.clearInterval(interval);
	}, [timelineRef, allDayTasks, timedTasks]);

	// ===== 渲染 =====
	const weekdayNames = i18n.t('sidebar.dailyTimeline.weekdays') as unknown as string[];

	return (
		<>
			<div className={SidebarClasses.elements.timelineHeader}>
				{`${formatDate(today, 'MM/dd')} ${weekdayNames[today.getDay()]}`}
			</div>

			{allDayTasks.length === 0 && timedTasks.length === 0 ? (
				<div className={SidebarClasses.elements.emptyState}>
					{i18n.t('sidebar.dailyTimeline.noTasks')}
				</div>
			) : null}

			{/* 全天区域（始终渲染为拖放目标） */}
			<AllDayDropZone
				onDropTask={handleAllDayDrop}
				renderTasks={(onCardClick) => (
					<>
						{allDayTasks.map((task) => (
							<TaskCard
								key={`${task.filePath}:${task.lineNumber}`}
								task={task}
								config={config}
								onClick={onCardClick}
							/>
						))}
					</>
				)}
				openFile={(task) => void openFileInExistingLeaf(app, task.filePath, task.lineNumber)}
			/>

			{/* 时段时间线 */}
			<div ref={timelineRef} className={SidebarClasses.elements.timeline} style={{ position: 'relative' }}>
				{Array.from({ length: 24 }, (_, hour) => {
					const hourTasks = hourGroups.get(hour) || [];
					const now = new Date();
					const isCurrentHour = now.getHours() === hour && isTodayInTimezone(today);
					return (
						<TimeSlot
							key={hour}
							hour={hour}
							isCurrentHour={isCurrentHour}
							tasks={hourTasks}
							config={config}
							onDropTask={(taskId) => handleSlotDrop(hour, taskId)}
							onCreateTask={() => {
								openCreateTaskModal({
									app,
									plugin,
									targetDate: today,
									targetHour: hour,
									onSuccess: () => {
										// vault modify event triggers incremental update automatically
									},
								});
							}}
							openFile={(task) => void openFileInExistingLeaf(app, task.filePath, task.lineNumber)}
						/>
					);
				})}
				{currentLineTop !== null ? (
					<div className={TIMELINE_CURRENT_TIME_CLASS} style={{ top: currentLineTop }} />
				) : null}
			</div>
		</>
	);
}

interface TimeSlotProps {
	hour: number;
	isCurrentHour: boolean;
	tasks: GCTask[];
	config: ReturnType<typeof buildSidebarConfig>;
	onDropTask: (taskId: string) => void;
	onCreateTask: () => void;
	openFile: (task: GCTask) => void;
}

function TimeSlot({ hour, isCurrentHour, tasks, config, onDropTask, onCreateTask, openFile }: TimeSlotProps): JSX.Element {
	const dropProps = useDropTarget({
		onDrop: (taskId) => onDropTask(taskId),
		activeClass: 'gc-sidebar__time-slot--drag-over',
	});

	const className = [
		TIMELINE_SLOT_CLASS,
		isCurrentHour ? 'is-current-hour' : '',
	].filter(Boolean).join(' ');

	return (
		<div className={className} {...dropProps}>
			<div className={SidebarClasses.elements.timelineTimeLabel}>
				{`${String(hour).padStart(2, '0')}:00`}
			</div>
			{tasks.length > 0 ? (
				<div className={SidebarClasses.elements.timelineTimeTasks}>
					{tasks.map((task) => (
						<TaskCard
							key={`${task.filePath}:${task.lineNumber}`}
							task={task}
							config={config}
							onClick={openFile}
						/>
					))}
				</div>
			) : (
				<SlotCreateButton onCreateTask={onCreateTask} />
			)}
		</div>
	);
}

function SlotCreateButton({ onCreateTask }: { onCreateTask: () => void }): JSX.Element {
	const [hover, setHover] = useState(false);
	return (
		<div
			className={SidebarClasses.elements.timelineSlotCreate}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			onClick={(e) => {
				e.stopPropagation();
				onCreateTask();
			}}
		>
			{hover ? <Icon icon="plus" /> : null}
		</div>
	);
}

interface AllDayDropZoneProps {
	onDropTask: (taskId: string) => void;
	renderTasks: (openFile: (task: GCTask) => void) => JSX.Element;
	openFile: (task: GCTask) => void;
}

function AllDayDropZone({ onDropTask, renderTasks, openFile }: AllDayDropZoneProps): JSX.Element {
	const dropProps = useDropTarget({
		onDrop: (taskId) => onDropTask(taskId),
		activeClass: 'gc-sidebar__all-day--drag-over',
	});

	return (
		<div className={SidebarClasses.elements.timelineAllDay} {...dropProps}>
			<div className={SidebarClasses.elements.timelineAllDayLabel}>
				{i18n.t('sidebar.dailyTimeline.allDay')}
			</div>
			{renderTasks(openFile)}
		</div>
	);
}