import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type JSX } from 'react';
import type { Dispatch, SetStateAction, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from 'react';
import { Notice } from 'obsidian';
import type { GCTask } from '../../types';
import type { DateFieldType } from '../../settings/types';
import { i18n } from '../../i18n/i18n';
import { SidebarClasses, ContextMenuClasses, setCssProps } from '../../utils/bem';
import { buildSidebarConfig } from '../../components/TaskCard';
import { getTodayInTimezone } from '../../dateUtils/timezone';
import { formatDate } from '../../dateUtils/dateUtilsIndex';
import { updateTaskProperties } from '../../tasks/taskUpdater';
import type { TaskUpdates } from '../../tasks/taskSerializer';
import { isVirtualTask } from '../../tasks/virtualTaskGenerator';
import { openCreateTaskModal } from '../modals/TaskFormModal';
import { Logger } from '../../utils/logger';
import { usePlugin, useApp } from '../pluginContext';
import { useCalendarStore } from '../store/calendarStore';
import { useDropTarget } from '../utils/useDragAndDrop';
import { TaskCard } from '../components/TaskCard';
import { Icon } from '../components/Icon';
import {
	type TimeBlock,
	type TimeBlockSegment,
	buildDayTimelineModel,
	getTaskInterval,
	minutesToPx,
	pxToMinutes,
	snapMinutes,
	formatMinutes,
	DAY_PX,
	DEFAULT_POINT_DURATION_MIN,
	MIN_DURATION_MIN,
	MINUTES_PER_DAY,
} from '../views/week/timelineModel';
import { useBlockResize, isBlockResizing, setBlockDragMeta, getBlockDragMeta, clearBlockDragMeta } from '../views/week/useBlockResize';

/**
 * 创建手势的像素位移阈值（与周视图一致）：超过才视为拖拽选区，
 * 点击抖动不让吸附值跳格导致 1 小时预览坍缩
 */
const CREATE_DRAG_THRESHOLD_PX = 5;

/** 事件目标是否位于时间块内 */
function isInsideBlock(target: EventTarget | null): boolean {
	return !!(target instanceof Element && target.closest(`.${SidebarClasses.elements.timelineBlock}`));
}

/** 页面上是否存在打开的右键菜单（ContextMenuTrigger 会截断冒泡，只能直接探测 DOM） */
function isContextMenuOpen(): boolean {
	return !!document.querySelector(`.${ContextMenuClasses.container}`);
}

/** dataTransfer.taskId（filePath:lineNumber）→ 任务查找 */
function findTaskById(tasks: GCTask[], taskId: string): GCTask | null {
	const [filePath, lineNum] = taskId.split(':');
	const lineNumber = parseInt(lineNum, 10);
	return tasks.find((t) => t.filePath === filePath && t.lineNumber === lineNumber) || null;
}

/** 快速创建载荷 */
type QuickCreate =
	| { type: 'point'; min: number }
	| { type: 'range'; startMin: number; endMin: number };

/**
 * 侧边栏 — 今日时间线 Tab（连续画布版，与周视图同语义）
 * 全天区域（含 ≥24h 长区间任务）+ 24 小时连续画布：
 * 分钟级定位、点击/拖拽空白创建、边缘拖拽改起止时间、按块边缘落点的拖放
 */
export function DailyTimelinePanel(): JSX.Element {
	const plugin = usePlugin();
	const app = useApp();
	const tasks = useCalendarStore((s) => s.tasks);

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

	/** 当日 00:00 + 分钟偏移（可超 1440 = 次日 00:00） */
	const atMinutes = useCallback((min: number): Date => {
		const d = new Date(today);
		d.setMinutes(min);
		return d;
	}, [today]);

	// ===== 统一写回 =====
	const persistTaskUpdate = useCallback(async (
		task: GCTask,
		updates: TaskUpdates,
		precisionPatch: Partial<Record<DateFieldType, 'day' | 'time'>>,
		errorKey: string,
	): Promise<boolean> => {
		try {
			const taskToUpdate = { ...task, datePrecision: { ...task.datePrecision, ...precisionPatch } };
			await updateTaskProperties(app, taskToUpdate, updates, enabledFormats);
			await plugin.taskCache.refreshFile(task.filePath);
			useCalendarStore.getState().notifyTasksUpdated(plugin.taskCache.getAllTasks(), task.filePath);
			return true;
		} catch (error) {
			Logger.error('DailyTimelinePanel', 'Task update failed:', error);
			new Notice(i18n.t(errorKey));
			return false;
		}
	}, [app, plugin, enabledFormats]);

	// ===== resize 提交（WYSIWYG，与周视图同规则） =====
	const commitResize = useCallback((
		block: TimeBlock,
		seg: TimeBlockSegment,
		edge: 'top' | 'bottom',
		newStartMin: number,
		newEndMin: number,
		blockEl: HTMLElement,
	): void => {
		const updates: Partial<Record<DateFieldType, Date>> = {};
		let precision: Partial<Record<DateFieldType, 'day' | 'time'>> = {};

		if (block.isPoint) {
			// 点任务 resize 即升级为区间任务：提交拖拽预览所见的边界
			if (edge === 'top') {
				updates[startField] = atMinutes(newStartMin);
				updates[endField] = block.end;
			} else {
				updates[startField] = block.start;
				updates[endField] = atMinutes(newEndMin);
			}
			precision = { [startField]: 'time', [endField]: 'time' };
		} else if (edge === 'top') {
			updates[startField] = atMinutes(newStartMin);
			precision = { [startField]: 'time' };
		} else {
			updates[endField] = atMinutes(newEndMin);
			precision = { [endField]: 'time' };
		}

		void (async () => {
			const ok = await persistTaskUpdate(block.task, updates, precision, 'views.dayView.updateTimeFailed');
			if (!ok) {
				blockEl.style.top = `${minutesToPx(seg.startMin)}px`;
				blockEl.style.height = `${minutesToPx(seg.endMin - seg.startMin)}px`;
			}
		})();
	}, [atMinutes, startField, endField, persistTaskUpdate]);

	const beginResize = useBlockResize(commitResize);

	// ===== 整块拖放落点（minutes = 块上边缘吸附时刻） =====
	const commitBlockMove = useCallback((task: GCTask, minutes: number): void => {
		const interval = getTaskInterval(task, startField, endField, dateField);
		const updates: Partial<Record<DateFieldType, Date>> = {};
		let precision: Partial<Record<DateFieldType, 'day' | 'time'>> = {};

		if (interval && interval.kind === 'point') {
			// 后向点任务锚在下边缘：写入截止 = 上边缘 + 时长
			const durationMin = Math.round((interval.end.getTime() - interval.start.getTime()) / 60000);
			const anchorMin = interval.pointDirection === 'backward' ? minutes + durationMin : minutes;
			updates[interval.pointField] = atMinutes(anchorMin);
			precision = { [interval.pointField]: 'time' };
		} else if (interval) {
			// 仅原本同日的区间做当日容纳钳制，跨夜区间允许继续跨夜
			const durationMin = Math.round((interval.end.getTime() - interval.start.getTime()) / 60000);
			const dayMsOf = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
			const dayStartOf = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
			const sameDayOrigin = dayMsOf(interval.start) === dayMsOf(interval.end);
			const anchorMin = sameDayOrigin && durationMin <= MINUTES_PER_DAY
				? Math.max(0, Math.min(minutes, MINUTES_PER_DAY - durationMin))
				: minutes;
			const newStart = atMinutes(anchorMin);
			const shiftMs = newStart.getTime() - interval.start.getTime();
			const startIsTime = task.datePrecision?.[startField] === 'time';
			const endIsTime = task.datePrecision?.[endField] === 'time';
			updates[startField] = startIsTime ? newStart : dayStartOf(newStart);
			const shiftedEnd = new Date(interval.end.getTime() + shiftMs);
			updates[endField] = endIsTime ? shiftedEnd : dayStartOf(shiftedEnd);
			precision = { ...task.datePrecision };
		} else {
			// 全天任务 / 外部视图拖入：落点即时刻
			updates[dateField] = atMinutes(minutes);
			precision = { [dateField]: 'time' };
		}

		void persistTaskUpdate(task, updates, precision, 'views.dayView.updateTimeFailed');
	}, [atMinutes, startField, endField, dateField, persistTaskUpdate]);

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
		void persistTaskUpdate(task, updates, precision, 'views.dayView.updateTaskFailed');
	}, [candidates, today, startField, endField, dateField, persistTaskUpdate]);

	// ===== 空白快速创建（点击 = 前向 1 小时区间，拖拽 = 选区） =====
	const handleQuickCreate = useCallback((payload: QuickCreate): void => {
		if (payload.type === 'range') {
			openCreateTaskModal({
				app,
				plugin,
				targetDate: today,
				targetRange: { start: atMinutes(payload.startMin), end: atMinutes(payload.endMin) },
				onSuccess: () => {},
			});
			return;
		}
		const endMin = Math.min(payload.min + DEFAULT_POINT_DURATION_MIN, MINUTES_PER_DAY);
		openCreateTaskModal({
			app,
			plugin,
			targetDate: today,
			targetRange: { start: atMinutes(payload.min), end: atMinutes(endMin) },
			onSuccess: () => {},
		});
	}, [app, plugin, today, atMinutes]);

	// ===== 拖放 UI 状态 =====
	const [dropLine, setDropLine] = useState<number | null>(null);
	const [dropPreview, setDropPreview] = useState<{ startMin: number; endMin: number } | null>(null);
	const [dragOver, setDragOver] = useState(false);

	// 全天区拖放目标（hook 必须在组件顶层调用，不能内联在 JSX 属性里）
	const allDayDropProps = useDropTarget({
		onDrop: (taskId) => handleAllDayDrop(taskId),
		activeClass: 'gc-sidebar__all-day--drag-over',
	});

	const weekdayNames = i18n.t('sidebar.dailyTimeline.weekdays') as unknown as string[];
	const isEmpty = model.blocks.length === 0 && model.allday.length === 0;

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
							<TaskCard task={task} config={timelineConfig} />
							{timeLabel ? (
								<span className={SidebarClasses.elements.timelineAllDayTime}>{timeLabel}</span>
							) : null}
						</div>
					))}
				</div>
			</div>

			{/* 连续时间画布（与周视图同语义） */}
			<TimelineCanvas
				model={model}
				config={timelineConfig}
				tasks={candidates}
				beginResize={beginResize}
				onQuickCreate={handleQuickCreate}
				onBlockMove={commitBlockMove}
				dropLine={dropLine}
				setDropLine={setDropLine}
				dropPreview={dropPreview}
				setDropPreview={setDropPreview}
				dragOver={dragOver}
				setDragOver={setDragOver}
			/>
		</>
	);
}

// ===== 连续画布（单日版，交互与周视图 DayColumn 同源） =====

interface TimelineCanvasProps {
	model: ReturnType<typeof buildDayTimelineModel>;
	config: ReturnType<typeof buildSidebarConfig>;
	tasks: GCTask[];
	beginResize: ReturnType<typeof useBlockResize>;
	onQuickCreate: (payload: QuickCreate) => void;
	onBlockMove: (task: GCTask, minutes: number) => void;
	dropLine: number | null;
	setDropLine: Dispatch<SetStateAction<number | null>>;
	dropPreview: { startMin: number; endMin: number } | null;
	setDropPreview: Dispatch<SetStateAction<{ startMin: number; endMin: number } | null>>;
	dragOver: boolean;
	setDragOver: Dispatch<SetStateAction<boolean>>;
}

function TimelineCanvas({
	model,
	config,
	tasks,
	beginResize,
	onQuickCreate,
	onBlockMove,
	dropLine,
	setDropLine,
	dropPreview,
	setDropPreview,
	dragOver,
	setDragOver,
}: TimelineCanvasProps): JSX.Element {
	const canvasRef = useRef<HTMLDivElement | null>(null);
	const ghostRef = useRef<HTMLDivElement | null>(null);
	const ghostLabelRef = useRef<HTMLSpanElement | null>(null);
	const createRef = useRef<{ anchorMin: number; anchorY: number; lastMin: number; moved: boolean } | null>(null);

	// 当前时间指示线（30s 刷新）
	const [nowTop, setNowTop] = useState<number | null>(null);
	useEffect(() => {
		const update = () => {
			const now = new Date();
			setNowTop(minutesToPx(now.getHours() * 60 + now.getMinutes()));
		};
		update();
		const timer = window.setInterval(update, 30_000);
		return () => window.clearInterval(timer);
	}, [model]);

	const minutesFromEvent = useCallback((clientY: number): number => {
		const canvas = canvasRef.current;
		if (!canvas) return 0;
		const rect = canvas.getBoundingClientRect();
		return snapMinutes(pxToMinutes(clientY - rect.top), false);
	}, []);

	const showGhost = useCallback((startMin: number, endMin: number, dragging: boolean): void => {
		const ghost = ghostRef.current;
		const label = ghostLabelRef.current;
		if (!ghost) return;
		const clampedEnd = Math.min(Math.max(endMin, startMin + 1), MINUTES_PER_DAY);
		setCssProps(ghost, { display: 'block' });
		ghost.style.top = `${minutesToPx(startMin)}px`;
		ghost.style.height = `${minutesToPx(clampedEnd - startMin)}px`;
		ghost.classList.toggle(SidebarClasses.modifiers.timelineGhostDragging, dragging);
		if (label) label.textContent = dragging
			? `${formatMinutes(startMin)} – ${formatMinutes(clampedEnd)}`
			: formatMinutes(startMin);
	}, []);

	const hideGhost = useCallback((): void => {
		const ghost = ghostRef.current;
		if (ghost) setCssProps(ghost, { display: 'none' });
	}, []);

	/** hover 时段是否与任一已有块重叠 */
	const isTimeBusy = useCallback((min: number): boolean => {
		return model.blocks.some((s) => min < s.seg.endMin && min + DEFAULT_POINT_DURATION_MIN > s.seg.startMin);
	}, [model.blocks]);

	// ===== hover ghost / 拖拽选区 =====
	const handleMouseMove = useCallback((e: ReactMouseEvent) => {
		if (isInsideBlock(e.target)) {
			if (!createRef.current) hideGhost();
			return;
		}
		const minutes = minutesFromEvent(e.clientY);
		const create = createRef.current;
		if (create) {
			create.lastMin = minutes;
			if (!create.moved && Math.abs(e.clientY - create.anchorY) > CREATE_DRAG_THRESHOLD_PX) {
				create.moved = true;
			}
			if (!create.moved) {
				showGhost(create.anchorMin, create.anchorMin + DEFAULT_POINT_DURATION_MIN, true);
				return;
			}
			showGhost(Math.min(create.anchorMin, minutes), Math.max(create.anchorMin, minutes), true);
			return;
		}
		const canvas = canvasRef.current;
		if (!canvas || !canvas.contains(e.target as Node)) {
			hideGhost();
			return;
		}
		if (isContextMenuOpen() || isBlockResizing() || isTimeBusy(minutes)) {
			hideGhost();
			return;
		}
		showGhost(minutes, minutes + DEFAULT_POINT_DURATION_MIN, false);
	}, [minutesFromEvent, showGhost, hideGhost, isTimeBusy]);

	const handleMouseLeave = useCallback(() => {
		if (!createRef.current) hideGhost();
	}, [hideGhost]);

	const finishCreate = useCallback((): void => {
		const create = createRef.current;
		createRef.current = null;
		document.removeEventListener('mouseup', finishCreate);
		hideGhost();
		if (!create) return;
		if (create.moved && Math.abs(create.lastMin - create.anchorMin) >= MIN_DURATION_MIN) {
			onQuickCreate({
				type: 'range',
				startMin: Math.min(create.anchorMin, create.lastMin),
				endMin: Math.max(create.anchorMin, create.lastMin),
			});
		} else {
			onQuickCreate({ type: 'point', min: create.anchorMin });
		}
	}, [onQuickCreate, hideGhost]);

	const handleMouseDown = useCallback((e: ReactMouseEvent) => {
		if (e.button !== 0 || isInsideBlock(e.target)) return;
		if (isContextMenuOpen()) return;
		const canvas = canvasRef.current;
		if (!canvas || !canvas.contains(e.target as Node)) return;
		e.preventDefault();
		const anchorMin = minutesFromEvent(e.clientY);
		createRef.current = { anchorMin, anchorY: e.clientY, lastMin: anchorMin, moved: false };
		showGhost(anchorMin, anchorMin + DEFAULT_POINT_DURATION_MIN, true);
		document.removeEventListener('mouseup', finishCreate);
		document.addEventListener('mouseup', finishCreate);
	}, [minutesFromEvent, showGhost, finishCreate]);

	// ===== HTML5 拖放（块拖动按块边缘落点 + 预览块；外部拖入按指针 + 指示线） =====
	const handleDragOver = useCallback((e: ReactDragEvent) => {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		setDragOver(true);
		const meta = getBlockDragMeta();
		if (meta) {
			setDropLine(null);
			const canvas = canvasRef.current;
			if (!canvas) return;
			const topMin = snapMinutes(pxToMinutes(e.clientY - meta.offsetPx - canvas.getBoundingClientRect().top), false);
			const endMin = Math.min(topMin + meta.durationMin, MINUTES_PER_DAY);
			setDropPreview((prev) => (prev && prev.startMin === topMin ? prev : { startMin: topMin, endMin }));
			return;
		}
		setDropPreview(null);
		setDropLine(minutesFromEvent(e.clientY));
	}, [minutesFromEvent, setDropLine, setDropPreview, setDragOver]);

	const handleDragLeave = useCallback((e: ReactDragEvent) => {
		const related = e.relatedTarget as Node | null;
		if (related && e.currentTarget.contains(related)) return;
		setDropLine(null);
		setDropPreview(null);
		setDragOver(false);
	}, [setDropLine, setDropPreview, setDragOver]);

	const handleDrop = useCallback((e: ReactDragEvent) => {
		e.preventDefault();
		setDropLine(null);
		setDropPreview(null);
		setDragOver(false);
		const taskId = e.dataTransfer?.getData('taskId');
		if (!taskId) return;
		const task = findTaskById(tasks, taskId);
		if (!task) {
			Logger.error('DailyTimelinePanel', 'Drop source task not found:', taskId);
			return;
		}
		const meta = getBlockDragMeta();
		const topEdgeClientY = meta ? e.clientY - meta.offsetPx : e.clientY;
		onBlockMove(task, minutesFromEvent(topEdgeClientY));
	}, [tasks, minutesFromEvent, onBlockMove, setDropLine, setDropPreview, setDragOver]);

	const canvasCls = [
		SidebarClasses.elements.timelineCanvas,
		dragOver ? SidebarClasses.modifiers.timelineCanvasDragOver : '',
	].filter(Boolean).join(' ');

	return (
		<div className={SidebarClasses.elements.timelineBody}>
			{/* 时间沟槽 */}
			<div className={SidebarClasses.elements.timelineGutter}>
				{Array.from({ length: 24 }, (_, hour) => (
					<div key={hour} className={SidebarClasses.elements.timelineTimeLabel}>
						{`${String(hour).padStart(2, '0')}:00`}
					</div>
				))}
			</div>
			{/* 连续画布 */}
			<div
				ref={canvasRef}
				className={canvasCls}
				style={{ height: `${DAY_PX}px`, '--gc-tl-hour-h': `${DAY_PX / 24}px` } as CSSProperties}
				onMouseMove={handleMouseMove}
				onMouseLeave={handleMouseLeave}
				onMouseDown={handleMouseDown}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
			>
				{model.blocks.map(({ block, seg }) => {
					const durationMin = seg.endMin - seg.startMin;
					const resizable = !isVirtualTask(block.task);
					const cls = [
						SidebarClasses.elements.timelineBlock,
						seg.continuesBefore ? SidebarClasses.modifiers.timelineBlockContinuesBefore : '',
						seg.continuesAfter ? SidebarClasses.modifiers.timelineBlockContinuesAfter : '',
						seg.stackedIndex > 0 ? SidebarClasses.modifiers.timelineBlockStacked : '',
					].filter(Boolean).join(' ');
					const style: CSSProperties = {
						top: `${minutesToPx(seg.startMin)}px`,
						height: `${minutesToPx(durationMin)}px`,
						left: `calc(${(seg.lane / seg.laneCount) * 100}% + ${(seg.stackedIndex > 0 ? seg.stackedIndex * 3 : 0) + 1}px)`,
						width: `calc(${100 / seg.laneCount}% - 2px)`,
						zIndex: seg.lane + (seg.stackedIndex > 0 ? 4 : 1),
					};
					return (
						<div
							key={`${block.task.filePath}:${block.task.lineNumber}`}
							className={cls}
							style={style}
							onDragStart={(e) => {
								const rect = e.currentTarget.getBoundingClientRect();
								setBlockDragMeta({
									offsetPx: e.clientY - rect.top,
									durationMin: Math.round((block.end.getTime() - block.start.getTime()) / 60000),
								});
							}}
							onDragEnd={() => {
								clearBlockDragMeta();
								setDropPreview(null);
							}}
						>
							{durationMin >= 30 ? (
								<span className={SidebarClasses.elements.timelineBlockTime}>
									{`${formatMinutes(seg.startMin)} – ${formatMinutes(seg.endMin)}`}
								</span>
							) : null}
							<TaskCard task={block.task} config={config} />
							{!seg.continuesBefore && resizable ? (
								<div
									className={`${SidebarClasses.elements.timelineHandle} ${SidebarClasses.modifiers.timelineHandleTop}`}
									onMouseDown={(e) => {
										const canvas = canvasRef.current;
										if (canvas && e.currentTarget.parentElement) {
											beginResize(e, block, seg, 'top', canvas, e.currentTarget.parentElement);
										}
									}}
								/>
							) : null}
							{!seg.continuesAfter && resizable ? (
								<div
									className={`${SidebarClasses.elements.timelineHandle} ${SidebarClasses.modifiers.timelineHandleBottom}`}
									onMouseDown={(e) => {
										const canvas = canvasRef.current;
										if (canvas && e.currentTarget.parentElement) {
											beginResize(e, block, seg, 'bottom', canvas, e.currentTarget.parentElement);
										}
									}}
								/>
							) : null}
						</div>
					);
				})}
				{/* 拖放吸附指示线（外部来源） */}
				{dropLine !== null ? (
					<div className={SidebarClasses.elements.timelineDropLine} style={{ top: `${minutesToPx(dropLine)}px` }} />
				) : null}
				{/* 整块拖动落点预览 */}
				{dropPreview ? (
					<div
						className={SidebarClasses.elements.timelineDropPreview}
						style={{ top: `${minutesToPx(dropPreview.startMin)}px`, height: `${minutesToPx(dropPreview.endMin - dropPreview.startMin)}px` }}
					>
						<span className={SidebarClasses.elements.timelineGhostLabel}>
							{`${formatMinutes(dropPreview.startMin)} – ${formatMinutes(dropPreview.endMin)}`}
						</span>
					</div>
				) : null}
				{/* 当前时间指示线 */}
				{nowTop !== null ? (
					<div className={SidebarClasses.elements.timelineCurrentTime} style={{ top: nowTop }} />
				) : null}
				{/* 空白快速创建 ghost */}
				<div ref={ghostRef} className={SidebarClasses.elements.timelineGhost} style={{ display: 'none' }}>
					<span ref={ghostLabelRef} className={SidebarClasses.elements.timelineGhostLabel} />
					<span className={SidebarClasses.elements.timelineGhostPlus}><Icon icon="plus" /></span>
				</div>
			</div>
		</div>
	);
}
