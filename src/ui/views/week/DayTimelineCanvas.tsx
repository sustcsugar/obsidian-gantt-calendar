import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type JSX } from 'react';
import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from 'react';
import { Notice } from 'obsidian';
import type { GCTask } from '../../../types';
import type { DateFieldType } from '../../../settings/types';
import type { TaskCardConfig } from '../../../components/TaskCard/TaskCardConfig';
import { DayCanvasClasses, ContextMenuClasses, setCssProps } from '../../../utils/bem';
import { usePlugin, useApp } from '../../pluginContext';
import { TaskCard } from '../../components/TaskCard';
import { Icon } from '../../components/Icon';
import { updateTaskProperties } from '../../../tasks/taskUpdater';
import type { TaskUpdates } from '../../../tasks/taskSerializer';
import { isVirtualTask } from '../../../tasks/virtualTaskGenerator';
import { openCreateTaskModal } from '../../modals/TaskFormModal';
import { i18n } from '../../../i18n/i18n';
import { Logger } from '../../../utils/logger';
import {
	type TimeBlock,
	type TimeBlockSegment,
	type DayTimelineModel,
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
import { useBlockResize, isBlockResizing, setBlockDragMeta, getBlockDragMeta, clearBlockDragMeta } from './useBlockResize';
import { useCanvasTouchDrag } from './useCanvasTouchDrag';

/**
 * 创建手势的像素位移阈值（与周视图一致）：超过才视为拖拽选区
 */
const CREATE_DRAG_THRESHOLD_PX = 5;

/** 事件目标是否位于时间块内 */
function isInsideBlock(target: EventTarget | null): boolean {
	return !!(target instanceof Element && target.closest(`.${DayCanvasClasses.elements.block}`));
}

/** 页面上是否存在打开的右键菜单（trigger 截断冒泡，只能直接探测 DOM） */
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

export interface DayTimelineCanvasProps {
	/** 画布呈现的日期（00:00） */
	day: Date;
	/** 单日时间线模型（buildDayTimelineModel 产物） */
	model: DayTimelineModel;
	/** 画布内卡片配置（timeline 变体） */
	config: TaskCardConfig;
	/** 任务全集（拖放源查找） */
	tasks: GCTask[];
	/** 写回成功后的刷新回调 */
	refresh: () => void;
}

/**
 * 单日连续时间画布（共享组件：日视图任务区 + 侧栏今日时间线）。
 * 与周视图同语义：分钟级定位、点击/拖选空白创建、边缘拖拽改起止时间、
 * 块边缘落点的 HTML5 拖放 + 触屏长按拖动、落点预览、当前时间线。
 */
export function DayTimelineCanvas({ day, model, config, tasks, refresh }: DayTimelineCanvasProps): JSX.Element {
	const plugin = usePlugin();
	const app = useApp();

	const dateField = 'dueDate';
	const startField = plugin.settings.ganttStartField || 'startDate';
	const endField = plugin.settings.ganttEndField || 'dueDate';
	const enabledFormats = plugin.settings.enabledTaskFormats || [];

	const canvasRef = useRef<HTMLDivElement | null>(null);
	const ghostRef = useRef<HTMLDivElement | null>(null);
	const ghostLabelRef = useRef<HTMLSpanElement | null>(null);
	const createRef = useRef<{ anchorMin: number; anchorY: number; lastMin: number; moved: boolean } | null>(null);
	/** pointercancel 清理经 ref 桥接，避免与 finishCreate 形成循环推断 */
	const cancelCreateRef = useRef<() => void>(() => {});

	// ===== 拖放 UI 状态 =====
	const [dropLine, setDropLine] = useState<number | null>(null);
	const [dropPreview, setDropPreview] = useState<{ startMin: number; endMin: number } | null>(null);
	const [dragOver, setDragOver] = useState(false);

	/** 当日 00:00 + 分钟偏移（可超 1440 = 次日 00:00） */
	const atMinutes = useCallback((min: number): Date => {
		const d = new Date(day);
		d.setMinutes(min);
		return d;
	}, [day]);

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
			refresh();
			return true;
		} catch (error) {
			Logger.error('DayTimelineCanvas', 'Task update failed:', error);
			new Notice(i18n.t(errorKey));
			return false;
		}
	}, [app, plugin, enabledFormats, refresh]);

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
			// 拖动点任务 = 双写起止并自动升级为区间任务（与周视图同语义）
			const durationMin = Math.round((interval.end.getTime() - interval.start.getTime()) / 60000);
			const anchorMin = Math.max(0, Math.min(minutes, MINUTES_PER_DAY - durationMin));
			updates[startField] = atMinutes(anchorMin);
			updates[endField] = atMinutes(anchorMin + durationMin);
			precision = { [startField]: 'time', [endField]: 'time' };
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

	// 触屏整块拖动（长按 500ms 起拖；单日画布 dayIndex 恒为 0）
	const beginBlockTouchPress = useCanvasTouchDrag({
		onCommit: (task, _dayIndex, minutes) => commitBlockMove(task, minutes),
		setPreview: (prev) => setDropPreview(prev && { startMin: prev.startMin, endMin: prev.endMin }),
		columnSelector: `.${DayCanvasClasses.elements.canvas}`,
	});

	// ===== 空白快速创建（单击 = 前向 1 小时区间，拖拽 = 选区） =====
	const handleQuickCreate = useCallback((payload: QuickCreate): void => {
		if (payload.type === 'range') {
			openCreateTaskModal({
				app,
				plugin,
				targetDate: day,
				targetRange: { start: atMinutes(payload.startMin), end: atMinutes(payload.endMin) },
				onSuccess: () => {},
			});
			return;
		}
		const endMin = Math.min(payload.min + DEFAULT_POINT_DURATION_MIN, MINUTES_PER_DAY);
		openCreateTaskModal({
			app,
			plugin,
			targetDate: day,
			targetRange: { start: atMinutes(payload.min), end: atMinutes(endMin) },
			onSuccess: () => {},
		});
	}, [app, plugin, day, atMinutes]);

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
		ghost.classList.toggle(DayCanvasClasses.modifiers.ghostDragging, dragging);
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
	const handlePointerMove = useCallback((e: ReactPointerEvent) => {
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
		// portal 浮层冒泡 / 菜单与 resize 进行中 / 时段被占用：不出 hover 提示
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

	const handlePointerLeave = useCallback(() => {
		if (!createRef.current) hideGhost();
	}, [hideGhost]);

	const finishCreate = useCallback((): void => {
		const create = createRef.current;
		createRef.current = null;
		document.removeEventListener('pointerup', finishCreate);
		document.removeEventListener('pointercancel', cancelCreateRef.current);
		hideGhost();
		if (!create) return;
		if (create.moved && Math.abs(create.lastMin - create.anchorMin) >= MIN_DURATION_MIN) {
			onQuickCreateRange(create.anchorMin, create.lastMin);
		} else {
			handleQuickCreate({ type: 'point', min: create.anchorMin });
		}
		// eslint 未配置 exhaustive-deps；依赖经下方 ref 桥接
	}, [hideGhost, handleQuickCreate]);

	/** 触屏滚动接管手势（pointercancel）：静默放弃创建，不弹窗 */
	const cancelCreate = useCallback((): void => {
		createRef.current = null;
		document.removeEventListener('pointerup', finishCreate);
		document.removeEventListener('pointercancel', cancelCreateRef.current);
		hideGhost();
	}, [finishCreate, hideGhost]);
	cancelCreateRef.current = cancelCreate;

	/** 选区创建（独立函数避免 finishCreate 循环依赖） */
	const onQuickCreateRange = useCallback((anchor: number, last: number) => {
		handleQuickCreate({
			type: 'range',
			startMin: Math.min(anchor, last),
			endMin: Math.max(anchor, last),
		});
	}, [handleQuickCreate]);

	const handlePointerDown = useCallback((e: ReactPointerEvent) => {
		if (e.button !== 0 || isInsideBlock(e.target)) return;
		if (isContextMenuOpen()) return;
		const canvas = canvasRef.current;
		if (!canvas || !canvas.contains(e.target as Node)) return;
		e.preventDefault();
		const anchorMin = minutesFromEvent(e.clientY);
		createRef.current = { anchorMin, anchorY: e.clientY, lastMin: anchorMin, moved: false };
		showGhost(anchorMin, anchorMin + DEFAULT_POINT_DURATION_MIN, true);
		document.removeEventListener('pointerup', finishCreate);
		document.removeEventListener('pointercancel', cancelCreateRef.current);
		document.addEventListener('pointerup', finishCreate);
		document.addEventListener('pointercancel', cancelCreateRef.current);
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
	}, [minutesFromEvent, setDropLine, setDropPreview]);

	const handleDragLeave = useCallback((e: ReactDragEvent) => {
		const related = e.relatedTarget as Node | null;
		if (related && e.currentTarget.contains(related)) return;
		setDropLine(null);
		setDropPreview(null);
		setDragOver(false);
	}, [setDropLine, setDropPreview]);

	const handleDrop = useCallback((e: ReactDragEvent) => {
		e.preventDefault();
		setDropLine(null);
		setDropPreview(null);
		setDragOver(false);
		const taskId = e.dataTransfer?.getData('taskId');
		if (!taskId) return;
		const task = findTaskById(tasks, taskId);
		if (!task) {
			Logger.error('DayTimelineCanvas', 'Drop source task not found:', taskId);
			return;
		}
		const meta = getBlockDragMeta();
		const topEdgeClientY = meta ? e.clientY - meta.offsetPx : e.clientY;
		commitBlockMove(task, minutesFromEvent(topEdgeClientY));
	}, [tasks, minutesFromEvent, commitBlockMove]);

	// ===== 当前时间指示线（仅画布日为今天时显示；30s 刷新） =====
	const isToday = useMemo(() => {
		const now = new Date();
		const d0 = new Date(day);
		return now.getFullYear() === d0.getFullYear() && now.getMonth() === d0.getMonth() && now.getDate() === d0.getDate();
	}, [day]);

	const [nowTop, setNowTop] = useState<number | null>(null);
	useEffect(() => {
		if (!isToday) {
			setNowTop(null);
			return;
		}
		const update = () => {
			const now = new Date();
			setNowTop(minutesToPx(now.getHours() * 60 + now.getMinutes()));
		};
		update();
		const timer = window.setInterval(update, 30_000);
		return () => window.clearInterval(timer);
	}, [isToday, model]);

	const canvasCls = [
		DayCanvasClasses.elements.canvas,
		dragOver ? DayCanvasClasses.modifiers.canvasDragOver : '',
	].filter(Boolean).join(' ');

	return (
		<div className={DayCanvasClasses.elements.body}>
			{/* 时间沟槽 */}
			<div className={DayCanvasClasses.elements.gutter}>
				{Array.from({ length: 24 }, (_, hour) => (
					<div key={hour} className={DayCanvasClasses.elements.timeLabel}>
						{`${String(hour).padStart(2, '0')}:00`}
					</div>
				))}
			</div>
			{/* 连续画布 */}
			<div
				ref={canvasRef}
				data-day-idx={0}
				className={canvasCls}
				style={{ height: `${DAY_PX}px`, '--gc-tl-hour-h': `${DAY_PX / 24}px` } as CSSProperties}
				onPointerMove={handlePointerMove}
				onPointerLeave={handlePointerLeave}
				onPointerDown={handlePointerDown}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
			>
				{model.blocks.map(({ block, seg }) => {
					const durationMin = seg.endMin - seg.startMin;
					const resizable = !isVirtualTask(block.task);
					const cls = [
						DayCanvasClasses.elements.block,
						seg.continuesBefore ? DayCanvasClasses.modifiers.blockContinuesBefore : '',
						seg.continuesAfter ? DayCanvasClasses.modifiers.blockContinuesAfter : '',
						seg.stackedIndex > 0 ? DayCanvasClasses.modifiers.blockStacked : '',
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
							onPointerDown={(e) => beginBlockTouchPress(e, block, e.currentTarget)}
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
								<span className={DayCanvasClasses.elements.blockTime}>
									{`${formatMinutes(seg.startMin)} – ${formatMinutes(seg.endMin)}`}
								</span>
							) : null}
							<TaskCard task={block.task} config={config} disableLongPressMenu />
							{!seg.continuesBefore && resizable ? (
								<div
									className={`${DayCanvasClasses.elements.handle} ${DayCanvasClasses.modifiers.handleTop}`}
									onPointerDown={(e) => {
										const canvas = canvasRef.current;
										if (canvas && e.currentTarget.parentElement) {
											beginResize(e, block, seg, 'top', canvas, e.currentTarget.parentElement);
										}
									}}
								/>
							) : null}
							{!seg.continuesAfter && resizable ? (
								<div
									className={`${DayCanvasClasses.elements.handle} ${DayCanvasClasses.modifiers.handleBottom}`}
									onPointerDown={(e) => {
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
					<div className={DayCanvasClasses.elements.dropLine} style={{ top: `${minutesToPx(dropLine)}px` }} />
				) : null}
				{/* 整块拖动落点预览 */}
				{dropPreview ? (
					<div
						className={DayCanvasClasses.elements.dropPreview}
						style={{ top: `${minutesToPx(dropPreview.startMin)}px`, height: `${minutesToPx(dropPreview.endMin - dropPreview.startMin)}px` }}
					>
						<span className={DayCanvasClasses.elements.ghostLabel}>
							{`${formatMinutes(dropPreview.startMin)} – ${formatMinutes(dropPreview.endMin)}`}
						</span>
					</div>
				) : null}
				{/* 当前时间指示线 */}
				{nowTop !== null ? (
					<div className={DayCanvasClasses.elements.currentTime} style={{ top: nowTop }} />
				) : null}
				{/* 空白快速创建 ghost */}
				<div ref={ghostRef} className={DayCanvasClasses.elements.ghost} style={{ display: 'none' }}>
					<span ref={ghostLabelRef} className={DayCanvasClasses.elements.ghostLabel} />
					<span className={DayCanvasClasses.elements.ghostPlus}><Icon icon="plus" /></span>
				</div>
			</div>
		</div>
	);
}
