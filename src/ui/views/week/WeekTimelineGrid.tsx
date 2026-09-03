import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type JSX } from 'react';
import type { Dispatch, SetStateAction, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from 'react';
import { Notice } from 'obsidian';
import type { GCTask } from '../../../types';
import type { DateFieldType } from '../../../settings/types';
import type { TaskCardConfig } from '../../../components/TaskCard/TaskCardConfig';
import { WeekViewClasses, setCssProps } from '../../../utils/bem';
import { usePlugin, useApp } from '../../pluginContext';
import { useTaskTooltip } from '../../components/TooltipProvider';
import { TaskCard } from '../../components/TaskCard';
import { Icon } from '../../components/Icon';
import { taskKey } from '../../utils/taskKey';
import { updateTaskProperties } from '../../../tasks/taskUpdater';
import { isVirtualTask } from '../../../tasks/virtualTaskGenerator';
import type { TaskUpdates } from '../../../tasks/taskSerializer';
import { openCreateTaskModal } from '../../modals/TaskFormModal';
import { i18n } from '../../../i18n/i18n';
import { Logger } from '../../../utils/logger';
import {
	type WeekTimelineModel,
	type TimeBlock,
	type TimeBlockSegment,
	type DaySegment,
	getTaskInterval,
	minutesToPx,
	pxToMinutes,
	snapMinutes,
	formatMinutes,
	DAY_PX,
	DEFAULT_POINT_DURATION_MIN,
	MIN_DURATION_MIN,
	MINUTES_PER_DAY,
} from './timelineModel';
import { useBlockResize } from './useBlockResize';

/** 全天行单行高度（卡片 24px + 间距 4px，与 CSS 令牌对应） */
const ALLDAY_ROW_PX = 28;

export interface WeekTimelineDayInfo {
	date: Date;
	isToday: boolean;
	weekday: number;
	day: number;
	lunarText?: string | null;
}

export interface WeekTimelineGridProps {
	days: WeekTimelineDayInfo[];
	dayNames: string[];
	weekStart: Date;
	model: WeekTimelineModel;
	/** 本周任务全集（真实 + 虚拟实例），用于拖放源查找 */
	tasks: GCTask[];
	config: TaskCardConfig;
	showLunar: boolean;
	refreshTasks: () => void;
	updateSeq: number;
}

/** 拖放指示线状态 */
interface DropLineState {
	dayIndex: number;
	min: number;
}

/** ghost 快速创建载荷 */
export type QuickCreate =
	| { type: 'point'; dayIndex: number; min: number }
	| { type: 'range'; dayIndex: number; startMin: number; endMin: number };

/**
 * 周视图连续时间画布：
 * 表头行 + 全天行（横跨条）+ 24 小时连续画布（按分钟绝对定位的时间块）。
 * 交互：点击/拖拽空白创建、块边缘拖拽改起止时间、HTML5 拖放整体平移。
 */
export function WeekTimelineGrid({
	days,
	dayNames,
	weekStart,
	model,
	tasks,
	config,
	showLunar,
	refreshTasks,
	updateSeq,
}: WeekTimelineGridProps): JSX.Element {
	const plugin = usePlugin();
	const app = useApp();
	const tooltip = useTaskTooltip();

	const dateField = plugin.settings.dateFilterField || 'dueDate';
	const startField = plugin.settings.ganttStartField || 'startDate';
	const endField = plugin.settings.ganttEndField || 'dueDate';
	const enabledFormats = plugin.settings.enabledTaskFormats || [];

	const [dropLine, setDropLine] = useState<DropLineState | null>(null);
	const [alldayDragDay, setAlldayDragDay] = useState<number | null>(null);
	const gridRef = useRef<HTMLDivElement | null>(null);

	const hasToday = days.some((d) => d.isToday);
	const allDayLabel = i18n.t('views.weekView.allDay');

	/** 本周第 dayIndex 天的 00:00 */
	const dayDate = useCallback((dayIndex: number): Date => {
		const d = new Date(weekStart);
		d.setDate(d.getDate() + dayIndex);
		d.setHours(0, 0, 0, 0);
		return d;
	}, [weekStart]);

	/** 当日 00:00 + 分钟偏移（min 可为 1440 = 次日 00:00） */
	const atMinutes = useCallback((base: Date, min: number): Date => {
		const d = new Date(base);
		d.setHours(0, 0, 0, 0);
		d.setMinutes(min);
		return d;
	}, []);

	// ===== 统一写回（复用 updateTaskProperties 的行号漂移校验/文件锁/保时序列化链路） =====
	const persistTaskUpdate = useCallback(async (
		task: GCTask,
		updates: TaskUpdates,
		precisionPatch: Partial<Record<DateFieldType, 'day' | 'time'>>,
		errorKey: string,
	): Promise<boolean> => {
		try {
			tooltip.cancel();
			// 浅拷贝：不变异 store 中的共享任务对象
			const taskToUpdate = { ...task, datePrecision: { ...task.datePrecision, ...precisionPatch } };
			await updateTaskProperties(app, taskToUpdate, updates, enabledFormats);
			// 立即刷新指定文件缓存（跳过文件事件防抖），再通知视图
			await plugin.taskCache.refreshFile(task.filePath);
			refreshTasks();
			return true;
		} catch (error) {
			Logger.error('WeekTimelineGrid', 'Task update failed:', error);
			new Notice(i18n.t(errorKey));
			return false;
		}
	}, [app, plugin, enabledFormats, refreshTasks, tooltip]);

	// ===== resize 提交：点任务升级为区间任务 =====
	const commitResize = useCallback((
		block: TimeBlock,
		seg: TimeBlockSegment,
		edge: 'top' | 'bottom',
		newStartMin: number,
		newEndMin: number,
		blockEl: HTMLElement,
	): void => {
		const day = dayDate(seg.dayIndex);
		const updates: Partial<Record<DateFieldType, Date>> = {};
		let precision: Partial<Record<DateFieldType, 'day' | 'time'>> = {};

		if (block.isPoint) {
			// 点任务被 resize 即升级：原时刻成为另一端，新边缘成为对应端
			if (edge === 'top') {
				updates[startField] = atMinutes(day, newStartMin);
				updates[endField] = block.start;
			} else {
				updates[startField] = block.start;
				updates[endField] = atMinutes(day, newEndMin);
			}
			precision = { [startField]: 'time', [endField]: 'time' };
		} else if (edge === 'top') {
			updates[startField] = atMinutes(day, newStartMin);
			precision = { [startField]: 'time' };
		} else {
			updates[endField] = atMinutes(day, newEndMin);
			precision = { [endField]: 'time' };
		}

		void (async () => {
			const ok = await persistTaskUpdate(block.task, updates, precision, 'views.dayView.updateTimeFailed');
			if (!ok) {
				// 写回失败：还原乐观样式
				blockEl.style.top = `${minutesToPx(seg.startMin)}px`;
				blockEl.style.height = `${minutesToPx(seg.endMin - seg.startMin)}px`;
			}
		})();
	}, [dayDate, atMinutes, startField, endField, persistTaskUpdate]);

	const beginResize = useBlockResize(commitResize);

	// ===== 拖放落点：整体平移块（保留时长与精度） =====
	const commitBlockMove = useCallback((task: GCTask, dayIndex: number, minutes: number): void => {
		const day = dayDate(dayIndex);
		const interval = getTaskInterval(task, startField, endField, dateField);
		const updates: Partial<Record<DateFieldType, Date>> = {};
		let precision: Partial<Record<DateFieldType, 'day' | 'time'>> = {};

		if (interval && interval.kind === 'point') {
			// 点任务：平移时刻
			updates[interval.pointField] = atMinutes(day, minutes);
			precision = { [interval.pointField]: 'time' };
		} else if (interval) {
			// 区间任务：以落点为新锚点整体平移，day 精度端点保持整天语义
			const durationMin = Math.round((interval.end.getTime() - interval.start.getTime()) / 60000);
			const anchorMin = durationMin <= MINUTES_PER_DAY
				? Math.max(0, Math.min(minutes, MINUTES_PER_DAY - durationMin))
				: minutes;
			const newStart = atMinutes(day, anchorMin);
			const shiftMs = newStart.getTime() - interval.start.getTime();
			const startIsTime = task.datePrecision?.[startField] === 'time';
			const endIsTime = task.datePrecision?.[endField] === 'time';
			updates[startField] = startIsTime ? newStart : atMinutes(newStart, 0);
			const shiftedEnd = new Date(interval.end.getTime() + shiftMs);
			updates[endField] = endIsTime ? shiftedEnd : atMinutes(shiftedEnd, 0);
			precision = { ...task.datePrecision };
		} else {
			// 全天任务 / 外部视图拖入：落点即时刻（dateField 转 time 精度）
			updates[dateField] = atMinutes(day, minutes);
			precision = { [dateField]: 'time' };
		}

		void persistTaskUpdate(task, updates, precision, 'views.dayView.updateTimeFailed');
	}, [dayDate, atMinutes, startField, endField, dateField, persistTaskUpdate]);

	// ===== 全天行拖放：转全天（day 精度） =====
	const commitAlldayMove = useCallback((task: GCTask, dayIndex: number): void => {
		const day = dayDate(dayIndex);
		const interval = getTaskInterval(task, startField, endField, dateField);
		const updates: Partial<Record<DateFieldType, Date>> = {};
		let precision: Partial<Record<DateFieldType, 'day' | 'time'>> = {};

		if (interval) {
			// 时间块 → 全天：起止都落到目标日（区间任务收敛为单日全天条）
			updates[startField] = day;
			updates[endField] = day;
			precision = { [startField]: 'day', [endField]: 'day' };
		} else {
			updates[dateField] = day;
			precision = { [dateField]: 'day' };
		}

		void persistTaskUpdate(task, updates, precision, 'views.dayView.updateTaskFailed');
	}, [dayDate, startField, endField, dateField, persistTaskUpdate]);

	// ===== 空白快速创建 =====
	const handleQuickCreate = useCallback((payload: QuickCreate): void => {
		const dayInfo = days[payload.dayIndex];
		if (!dayInfo) return;
		if (payload.type === 'range') {
			openCreateTaskModal({
				app,
				plugin,
				targetDate: dayInfo.date,
				targetRange: { start: atMinutes(dayInfo.date, payload.startMin), end: atMinutes(dayInfo.date, payload.endMin) },
				onSuccess: refreshTasks,
			});
			return;
		}
		const min = payload.min;
		openCreateTaskModal({
			app,
			plugin,
			targetDate: dayInfo.date,
			targetHour: Math.floor(min / 60),
			targetMinute: min % 60,
			onSuccess: refreshTasks,
		});
	}, [app, plugin, days, atMinutes, refreshTasks]);

	// ===== 当前时间指示线（按分钟直接计算，每 30s 重画） =====
	useEffect(() => {
		if (!hasToday) return;
		const draw = () => {
			const grid = gridRef.current;
			if (!grid) return;
			const line = grid.querySelector<HTMLElement>(`.${WeekViewClasses.elements.currentTimeLine}`);
			const col = grid.querySelector<HTMLElement>(`.${WeekViewClasses.elements.dayCol}`);
			if (!line || !col) return;
			const now = new Date();
			line.style.top = `${col.offsetTop + minutesToPx(now.getHours() * 60 + now.getMinutes())}px`;
			setCssProps(line, { display: 'block' });
		};
		draw();
		const timer = window.setInterval(draw, 30_000);
		return () => window.clearInterval(timer);
	}, [hasToday, updateSeq, weekStart, model]);

	// ===== 全天行高度（lane 数） =====
	const alldayLaneCount = useMemo(() => (
		model.allday.reduce((max, bar) => Math.max(max, bar.lane + 1), 1)
	), [model.allday]);

	// ===== 全天行拖放 =====
	const handleAlldayDragOver = useCallback((e: ReactDragEvent) => {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		const rect = e.currentTarget.getBoundingClientRect();
		const dayIndex = Math.max(0, Math.min(6, Math.floor(((e.clientX - rect.left) / rect.width) * 7)));
		setAlldayDragDay((prev) => (prev === dayIndex ? prev : dayIndex));
	}, []);

	const handleAlldayDragLeave = useCallback((e: ReactDragEvent) => {
		const related = e.relatedTarget as Node | null;
		if (related && e.currentTarget.contains(related)) return;
		setAlldayDragDay(null);
	}, []);

	const handleAlldayDrop = useCallback((e: ReactDragEvent) => {
		e.preventDefault();
		setAlldayDragDay(null);
		const taskId = e.dataTransfer?.getData('taskId');
		if (!taskId) return;
		const task = findTaskById(tasks, taskId);
		if (!task) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const dayIndex = Math.max(0, Math.min(6, Math.floor(((e.clientX - rect.left) / rect.width) * 7)));
		commitAlldayMove(task, dayIndex);
	}, [tasks, commitAlldayMove]);

	const handleCardRefresh = useCallback(() => refreshTasks(), [refreshTasks]);

	return (
		<div
			className={WeekViewClasses.elements.tasksGrid}
			ref={gridRef}
			style={{ '--gc-tl-hour-h': `${DAY_PX / 24}px` } as CSSProperties}
		>
			{/* 表头 */}
			<div className={WeekViewClasses.elements.headerSpacer} style={{ gridColumn: '1', gridRow: '1' }} />
			{days.map((day, dayIdx) => (
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

			{/* 全天行 */}
			<div className={WeekViewClasses.elements.alldayGutter} style={{ gridColumn: '1', gridRow: '2' }}>
				{allDayLabel}
			</div>
			<div
				className={WeekViewClasses.elements.alldayRow}
				style={{ gridColumn: '2 / -1', gridRow: '2', height: `${alldayLaneCount * ALLDAY_ROW_PX}px` }}
				onDragOver={handleAlldayDragOver}
				onDragLeave={handleAlldayDragLeave}
				onDrop={handleAlldayDrop}
			>
				{days.map((day, dayIdx) => (
					<div
						key={`week-ac-${dayIdx}`}
						className={`${WeekViewClasses.elements.alldayCell}${day.isToday ? ` ${WeekViewClasses.modifiers.alldayCellToday}` : ''}${alldayDragDay === dayIdx ? ` ${WeekViewClasses.modifiers.alldayCellDragOver}` : ''}`}
						style={{ left: `${(dayIdx / 7) * 100}%`, width: `${100 / 7}%` }}
					/>
				))}
				{model.allday.map((bar) => (
					<div
						key={`week-ab-${taskKey(bar.task)}`}
						className={`${WeekViewClasses.elements.alldayBar}${bar.continuesBefore ? ` ${WeekViewClasses.modifiers.alldayBarContinuesBefore}` : ''}${bar.continuesAfter ? ` ${WeekViewClasses.modifiers.alldayBarContinuesAfter}` : ''}${bar.stackedIndex > 0 ? ` ${WeekViewClasses.modifiers.alldayBarStacked}` : ''}`}
						style={{
							left: `calc(${(bar.startDayIndex / 7) * 100}% + 2px)`,
							width: `calc(${((bar.endDayIndex - bar.startDayIndex + 1) / 7) * 100}% - 4px)`,
							top: `${bar.lane * ALLDAY_ROW_PX + (bar.stackedIndex > 0 ? 3 : 0)}px`,
							zIndex: bar.stackedIndex > 0 ? 3 : 1,
						}}
					>
						<TaskCard
							task={bar.task}
							config={config}
							targetDate={days[bar.startDayIndex]?.date}
							onClick={() => tooltip.hide()}
							onRefresh={handleCardRefresh}
						/>
					</div>
				))}
			</div>

			{/* 时间沟槽：24 个整点标签 */}
			<div className={WeekViewClasses.elements.timeGutterSlot} style={{ gridColumn: '1', gridRow: '3' }}>
				{Array.from({ length: 24 }, (_, hour) => (
					<div key={`week-g-${hour}`} className={WeekViewClasses.elements.timeGutterLabel}>
						{`${String(hour).padStart(2, '0')}:00`}
					</div>
				))}
			</div>

			{/* 7 个日列（连续画布） */}
			{days.map((day, dayIdx) => (
				<DayColumn
					key={`week-col-${dayIdx}`}
					dayIndex={dayIdx}
					day={day}
					daySegs={model.days[dayIdx] || []}
					config={config}
					beginResize={beginResize}
					onQuickCreate={handleQuickCreate}
					onBlockMove={commitBlockMove}
					dropLine={dropLine}
					setDropLine={setDropLine}
					tasks={tasks}
					hideTooltip={() => tooltip.hide()}
					onCardRefresh={handleCardRefresh}
				/>
			))}

			{/* 当前时间指示线 */}
			{hasToday ? (
				<div className={WeekViewClasses.elements.currentTimeLine} style={{ display: 'none' }} />
			) : null}
		</div>
	);
}

// ===== 日列（连续画布 + 时间块 + ghost 创建） =====

/** 事件目标是否位于时间块内（块上的事件不触发空白创建/ghost） */
function isInsideBlock(target: EventTarget | null): boolean {
	return !!(target instanceof Element && target.closest(`.${WeekViewClasses.elements.timeBlock}`));
}

interface DayColumnProps {
	dayIndex: number;
	day: WeekTimelineDayInfo;
	daySegs: DaySegment[];
	config: TaskCardConfig;
	beginResize: ReturnType<typeof useBlockResize>;
	onQuickCreate: (payload: QuickCreate) => void;
	onBlockMove: (task: GCTask, dayIndex: number, minutes: number) => void;
	dropLine: DropLineState | null;
	setDropLine: Dispatch<SetStateAction<DropLineState | null>>;
	tasks: GCTask[];
	hideTooltip: () => void;
	onCardRefresh: () => void;
}

function DayColumn({
	dayIndex,
	day,
	daySegs,
	config,
	beginResize,
	onQuickCreate,
	onBlockMove,
	dropLine,
	setDropLine,
	tasks,
	hideTooltip,
	onCardRefresh,
}: DayColumnProps): JSX.Element {
	const colRef = useRef<HTMLDivElement | null>(null);
	const ghostRef = useRef<HTMLDivElement | null>(null);
	const ghostLabelRef = useRef<HTMLSpanElement | null>(null);
	/** 拖拽选区创建状态（mousedown 于空白处时激活） */
	const createRef = useRef<{ anchorMin: number; lastMin: number; moved: boolean } | null>(null);

	const minutesFromEvent = useCallback((clientY: number): number => {
		const col = colRef.current;
		if (!col) return 0;
		const rect = col.getBoundingClientRect();
		return snapMinutes(pxToMinutes(clientY - rect.top), false);
	}, []);

	/** 直接 DOM 更新 ghost（避免 60Hz mousemove 触发 React 重渲染）；钳制在 [0, 24:00] 内 */
	const showGhost = useCallback((startMin: number, endMin: number, dragging: boolean): void => {
		const ghost = ghostRef.current;
		const label = ghostLabelRef.current;
		if (!ghost) return;
		const clampedEnd = Math.min(Math.max(endMin, startMin + 1), MINUTES_PER_DAY);
		setCssProps(ghost, { display: 'block' });
		ghost.style.top = `${minutesToPx(startMin)}px`;
		ghost.style.height = `${minutesToPx(clampedEnd - startMin)}px`;
		ghost.classList.toggle(WeekViewClasses.modifiers.ghostDragging, dragging);
		if (label) label.textContent = dragging
			? `${formatMinutes(startMin)} – ${formatMinutes(clampedEnd)}`
			: formatMinutes(startMin);
	}, []);

	const hideGhost = useCallback((): void => {
		const ghost = ghostRef.current;
		if (ghost) setCssProps(ghost, { display: 'none' });
	}, []);

	// ===== hover ghost / 拖拽选区 =====
	const handleMouseMove = useCallback((e: ReactMouseEvent) => {
		if (isInsideBlock(e.target)) {
			// 选区拖拽中指针掠过块上：ghost 保持（选区仍跟随指针）
			if (!createRef.current) hideGhost();
			return;
		}
		const minutes = minutesFromEvent(e.clientY);
		const create = createRef.current;
		if (create) {
			create.lastMin = minutes;
			if (minutes !== create.anchorMin) create.moved = true;
			const start = Math.min(create.anchorMin, minutes);
			const end = Math.max(create.anchorMin, minutes) + (minutes === create.anchorMin ? MIN_DURATION_MIN : 0);
			showGhost(start, end, true);
			return;
		}
		// hover：默认时长 ghost + 时刻标签
		showGhost(minutes, minutes + DEFAULT_POINT_DURATION_MIN, false);
	}, [minutesFromEvent, showGhost, hideGhost]);

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
			const start = Math.min(create.anchorMin, create.lastMin);
			const end = Math.max(create.anchorMin, create.lastMin);
			onQuickCreate({ type: 'range', dayIndex, startMin: start, endMin: end });
		} else {
			onQuickCreate({ type: 'point', dayIndex, min: create.anchorMin });
		}
	}, [dayIndex, onQuickCreate, hideGhost]);

	const handleMouseDown = useCallback((e: ReactMouseEvent) => {
		if (e.button !== 0 || isInsideBlock(e.target)) return;
		e.preventDefault();
		const anchorMin = minutesFromEvent(e.clientY);
		createRef.current = { anchorMin, lastMin: anchorMin, moved: false };
		showGhost(anchorMin, anchorMin + MIN_DURATION_MIN, true);
		// 防御：上一手势未正常收尾时先解绑，避免 finishCreate 重复触发
		document.removeEventListener('mouseup', finishCreate);
		document.addEventListener('mouseup', finishCreate);
	}, [minutesFromEvent, showGhost, finishCreate]);

	// ===== HTML5 拖放（整体平移） =====
	const handleDragOver = useCallback((e: ReactDragEvent) => {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		const min = minutesFromEvent(e.clientY);
		setDropLine((prev) => (prev && prev.dayIndex === dayIndex && prev.min === min ? prev : { dayIndex, min }));
	}, [dayIndex, minutesFromEvent, setDropLine]);

	const handleDragLeave = useCallback((e: ReactDragEvent) => {
		const related = e.relatedTarget as Node | null;
		if (related && e.currentTarget.contains(related)) return;
		setDropLine(null);
	}, [setDropLine]);

	const handleDrop = useCallback((e: ReactDragEvent) => {
		e.preventDefault();
		setDropLine(null);
		const taskId = e.dataTransfer?.getData('taskId');
		if (!taskId) return;
		const task = findTaskById(tasks, taskId);
		if (!task) {
			Logger.error('WeekTimelineGrid', 'Drop source task not found:', taskId);
			return;
		}
		onBlockMove(task, dayIndex, minutesFromEvent(e.clientY));
	}, [tasks, dayIndex, minutesFromEvent, onBlockMove, setDropLine]);

	const showDropLine = dropLine?.dayIndex === dayIndex;

	return (
		<div
			ref={colRef}
			className={`${WeekViewClasses.elements.dayCol}${day.isToday ? ` ${WeekViewClasses.modifiers.dayColToday}` : ''}${showDropLine ? ` ${WeekViewClasses.modifiers.dayColDragOver}` : ''}`}
			style={{ gridColumn: `${dayIndex + 2}`, gridRow: '3', height: `${DAY_PX}px` }}
			onMouseMove={handleMouseMove}
			onMouseLeave={handleMouseLeave}
			onMouseDown={handleMouseDown}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			{daySegs.map(({ block, seg }) => {
				const durationMin = seg.endMin - seg.startMin;
				const resizable = !isVirtualTask(block.task);
				const cls = [
					WeekViewClasses.elements.timeBlock,
					seg.continuesBefore ? WeekViewClasses.modifiers.timeBlockContinuesBefore : '',
					seg.continuesAfter ? WeekViewClasses.modifiers.timeBlockContinuesAfter : '',
					seg.stackedIndex > 0 ? WeekViewClasses.modifiers.timeBlockStacked : '',
				].filter(Boolean).join(' ');
				const style: CSSProperties = {
					top: `${minutesToPx(seg.startMin)}px`,
					height: `${minutesToPx(durationMin)}px`,
					left: `calc(${(seg.lane / seg.laneCount) * 100}% + ${(seg.stackedIndex > 0 ? seg.stackedIndex * 3 : 0) + 1}px)`,
					width: `calc(${100 / seg.laneCount}% - 2px)`,
					zIndex: seg.lane + (seg.stackedIndex > 0 ? 4 : 1),
				};
				return (
					<div key={`${taskKey(block.task)}-d${dayIndex}`} className={cls} style={style}>
						{durationMin >= 30 ? (
							<span className={WeekViewClasses.elements.timeBlockTime}>
								{`${formatMinutes(seg.startMin)} – ${formatMinutes(seg.endMin)}`}
							</span>
						) : null}
						<TaskCard
							task={block.task}
							config={config}
							targetDate={day.date}
							onClick={hideTooltip}
							onRefresh={onCardRefresh}
						/>
						{/* 仅真实起止边缘有 resize 手柄（虚拟实例不可写回模板，禁编辑） */}
						{!seg.continuesBefore && resizable ? (
							<div
								className={`${WeekViewClasses.elements.handle} ${WeekViewClasses.modifiers.handleTop}`}
								onMouseDown={(e) => {
									const col = colRef.current;
									if (col && e.currentTarget.parentElement) {
										beginResize(e, block, seg, 'top', col, e.currentTarget.parentElement);
									}
								}}
							/>
						) : null}
						{!seg.continuesAfter && resizable ? (
							<div
								className={`${WeekViewClasses.elements.handle} ${WeekViewClasses.modifiers.handleBottom}`}
								onMouseDown={(e) => {
									const col = colRef.current;
									if (col && e.currentTarget.parentElement) {
										beginResize(e, block, seg, 'bottom', col, e.currentTarget.parentElement);
									}
								}}
							/>
						) : null}
					</div>
				);
			})}
			{/* 拖放吸附指示线 */}
			{showDropLine ? (
				<div
					className={WeekViewClasses.elements.dropLine}
					style={{ top: `${minutesToPx(dropLine.min)}px` }}
				/>
			) : null}
			{/* 空白快速创建 ghost */}
			<div ref={ghostRef} className={WeekViewClasses.elements.ghost} style={{ display: 'none' }}>
				<span ref={ghostLabelRef} className={WeekViewClasses.elements.ghostLabel} />
				<span className={WeekViewClasses.elements.ghostPlus}><Icon icon="plus" /></span>
			</div>
		</div>
	);
}

// ===== 工具 =====

/** dataTransfer.taskId（filePath:lineNumber）→ 任务查找 */
function findTaskById(tasks: GCTask[], taskId: string): GCTask | null {
	const [filePath, lineNum] = taskId.split(':');
	const lineNumber = parseInt(lineNum, 10);
	return tasks.find((t) => t.filePath === filePath && t.lineNumber === lineNumber) || null;
}
