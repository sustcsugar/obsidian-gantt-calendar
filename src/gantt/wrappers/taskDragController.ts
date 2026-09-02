/**
 * 甘特图拖拽状态机
 *
 * 管理任务条拖拽的完整生命周期：
 * 1. setupTaskBarDragging — 为 bar/leftHandle/rightHandle 绑定 mousedown
 * 2. startDragging — 初始化状态、注册全局 mousemove/mouseup
 * 3. handleDragMove — 实时更新任务条视觉位置
 * 4. handleDragEnd — 区分点击/拖拽语义，调用 onDateChange 回调
 *
 * 状态机流转：
 *   mousedown → startDragging → mousemove → handleDragMove（视觉更新）
 *                    ↓
 *              mouseup → handleDragEnd
 *                        ├── !hasMoved → handleTaskClick（点击语义）
 *                        └── hasMoved  → onDateChange（拖拽语义）
 */

import { parseLocalDate, findStartGridUnitIndex, findEndGridUnitIndex, getGridUnitX } from './dateGeometry';
import type { IRenderContext, TaskDragState } from './renderContext';
import type { GanttChartTask } from '../types';
import { Logger } from '../../utils/logger';
import { setCssProps } from '../../utils/bem';

/**
 * 拖拽时更新任务条及其子元素的视觉位置（乐观更新）
 */
function updateTaskBarVisual(
	ctx: IRenderContext,
	newStart: Date,
	newEnd: Date,
	minDate: Date,
	dragState: TaskDragState,
): void {
	if (!dragState.task) return;
	const HANDLE_HIT_AREA = 12;
	const HANDLE_VISUAL_SIZE = 4;

	// 重新导入几何函数（ESM 静态 import，避免循环）
	const { findStartGridUnitIndex: findStart, findEndGridUnitIndex: findEnd, getGridUnitX: getX } = require('./dateGeometry') as typeof import('./dateGeometry');

	const startUnitIndex = findStartGridUnitIndex(newStart, minDate, { columnWidth: ctx.columnWidth, granularity: ctx.granularity });
	const endUnitIndex = findEndGridUnitIndex(newEnd, minDate, { columnWidth: ctx.columnWidth, granularity: ctx.granularity });
	const rowIndex = ctx.tasks.findIndex(t => t.id === dragState.task?.id);

	const x = getGridUnitX(startUnitIndex, ctx.columnWidth);
	const y = rowIndex * ctx.rowHeight + (ctx.rowHeight - 24) / 2;
	const duration = endUnitIndex - startUnitIndex;
	const barWidth = Math.max(duration * ctx.columnWidth, 20);

	// 更新任务条
	const barEl = dragState.barElement;
	if (barEl) {
		barEl.setAttribute('x', String(x));
		barEl.setAttribute('y', String(y));
		barEl.setAttribute('width', String(barWidth));
	}

	// 更新左手柄
	if (dragState.leftHandleElement) {
		dragState.leftHandleElement.setAttribute('x', String(x));
		dragState.leftHandleElement.setAttribute('y', String(y));
	}
	if (dragState.leftVisualElement) {
		dragState.leftVisualElement.setAttribute('x', String(x + 2));
		dragState.leftVisualElement.setAttribute('y', String(y + 8));
	}

	// 更新右手柄
	const rightHandleX = x + barWidth - HANDLE_HIT_AREA;
	if (dragState.rightHandleElement) {
		dragState.rightHandleElement.setAttribute('x', String(rightHandleX));
		dragState.rightHandleElement.setAttribute('y', String(y));
	}
	if (dragState.rightVisualElement) {
		dragState.rightVisualElement.setAttribute('x', String(rightHandleX + HANDLE_HIT_AREA - 2 - HANDLE_VISUAL_SIZE));
		dragState.rightVisualElement.setAttribute('y', String(y + 8));
	}

	// 同步更新引导条（创建 → 开始）
	const barGroup = barEl?.parentElement as SVGGElement | null;
	if (barGroup) {
		// 使用日期几何函数重新计算引导条位置
		const { findStartGridUnitIndex: findStart, getGridUnitX: getX } = require('./dateGeometry') as typeof import('./dateGeometry');
		const leadBar = barGroup.querySelector('.gc-gantt-view__lead-bar');
		if (leadBar) {
			const task = dragState.task;
			let leadStart = task.leadStart;
			// 实时推导：如果创建时间早于新起点，添加引导条
			if (!leadStart && task.createdDate) {
				const created = new Date(task.createdDate);
				if (!isNaN(created.getTime()) && created.getTime() < newStart.getTime()) {
					const y2 = created.getFullYear();
					const m2 = String(created.getMonth() + 1).padStart(2, '0');
					const d2 = String(created.getDate()).padStart(2, '0');
					leadStart = `${y2}-${m2}-${d2}`;
				}
			}
			if (leadStart) {
				const leadStartDate = parseLocalDate(leadStart);
				const leadUnitIdx = findStartGridUnitIndex(leadStartDate, ctx.minDate!, { columnWidth: ctx.columnWidth, granularity: ctx.granularity });
				const leadX = getGridUnitX(leadUnitIdx, ctx.columnWidth);
				const leadWidth = Math.max(x - leadX, 0);
				leadBar.setAttribute('x', String(leadX));
				leadBar.setAttribute('y', String(y));
				leadBar.setAttribute('width', String(leadWidth));
			}
		}
	}
}

/**
 * 日期加减天数
 */
function addDays(date: Date, days: number): Date {
	const result = new Date(date);
	result.setDate(result.getDate() + days);
	return result;
}

/**
 * 创建拖拽控制器
 *
 * @param ctx 渲染器共享状态
 * @param onDateChange 拖拽完成回调（task, newStart, newEnd）
 * @param onTaskClick 任务点击回调
 * @param tasks 获取当前任务列表（从 renderer.tasks 延迟读取）
 */
export function createTaskDragController(
	ctx: IRenderContext,
	getTasks: () => GanttChartTask[],
	onDateChange?: (task: GanttChartTask, start: Date, end: Date) => void | Promise<void>,
	onTaskClick?: (task: GanttChartTask) => void,
): {
	setupTaskBarDragging: (barGroup: SVGGElement, bar: SVGRectElement, leftHandle: SVGRectElement, rightHandle: SVGRectElement, task: GanttChartTask, minDate: Date) => void;
	startDragging: (task: GanttChartTask, dragType: 'move' | 'resize-left' | 'resize-right', startX: number, minDate: Date, bar: SVGRectElement, leftHandle: SVGRectElement | null, rightHandle: SVGRectElement | null) => void;
	handleDragMove: (e: MouseEvent) => void;
	handleDragEnd: (e: MouseEvent) => void;
	addDays: (date: Date, days: number) => Date;
	destroy: () => void;
} {
	const state = ctx.taskDragState;

	function setupTaskBarDragging(
		barGroup: SVGGElement,
		bar: SVGRectElement,
		leftHandle: SVGRectElement,
		rightHandle: SVGRectElement,
		task: GanttChartTask,
		minDate: Date
	): void {
		leftHandle.addEventListener('mousedown', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			startDragging(task, 'resize-left', e.clientX, minDate, bar, leftHandle, null);
		});

		rightHandle.addEventListener('mousedown', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			startDragging(task, 'resize-right', e.clientX, minDate, bar, null, rightHandle);
		});

		bar.addEventListener('mousedown', (e: MouseEvent) => {
			e.preventDefault();
			startDragging(task, 'move', e.clientX, minDate, bar, null, null);
		});
	}

	function startDragging(
		task: GanttChartTask,
		dragType: 'move' | 'resize-left' | 'resize-right',
		startX: number,
		minDate: Date,
		bar: SVGRectElement,
		leftHandle: SVGRectElement | null,
		rightHandle: SVGRectElement | null
	): void {
		const latestTask = getTasks().find(t => t.id === task.id);
		if (!latestTask) {
			Logger.warn('TaskDragController', `Task ${task.id} not found in current tasks during drag start`);
			return;
		}



		Object.assign(state, {
			isDragging: true,
			dragType,
			task: latestTask,
			startX,
			originalStart: parseLocalDate(latestTask.start),
			originalEnd: parseLocalDate(latestTask.end),
			taskMinDate: minDate,
			hasMoved: false,
			barElement: bar,
			leftHandleElement: leftHandle,
			rightHandleElement: rightHandle,
			leftVisualElement: null,
			rightVisualElement: null,
		});

		// 保存视觉元素引用（小白点，通过 pointer-events: none 识别）
		const barGroup = bar.parentElement;
		if (barGroup) {
			const allRects = Array.from(barGroup.querySelectorAll('rect'));
			const visuals = allRects.filter(r => r.style?.pointerEvents === 'none');
			const barX = parseFloat(bar.getAttribute('x') || '0');
			const barWidth = parseFloat(bar.getAttribute('width') || '0');

			state.leftVisualElement = visuals.find(v => {
				const vx = parseFloat(v.getAttribute('x') || '0');
				return vx < barX + barWidth / 2;
			}) as SVGRectElement || null;

			state.rightVisualElement = visuals.find(v => {
				const vx = parseFloat(v.getAttribute('x') || '0');
				return vx >= barX + barWidth / 2;
			}) as SVGRectElement || null;
		}

		setCssProps(activeDocument.body, {
			cursor: dragType === 'move' ? 'grabbing' : dragType === 'resize-left' ? 'w-resize' : 'e-resize',
			userSelect: 'none',
		});

		activeDocument.addEventListener('mousemove', handleDragMove);
		activeDocument.addEventListener('mouseup', handleDragEnd);
	}

	function handleDragMove(e: MouseEvent): void {
		if (!state.isDragging) return;

		const deltaX = e.clientX - state.startX;

		if (Math.abs(deltaX) > 3) {
			state.hasMoved = true;
		}

		const daysDelta = Math.round(deltaX / ctx.columnWidth);
		if (daysDelta === 0) return;

		const { dragType, originalStart, originalEnd, taskMinDate } = state;
		let newStart: Date;
		let newEnd: Date;

		switch (dragType) {
			case 'move':
				newStart = addDays(originalStart!, daysDelta);
				newEnd = addDays(originalEnd!, daysDelta);
				break;
			case 'resize-left':
				newStart = addDays(originalStart!, daysDelta);
				newEnd = originalEnd!;
				if (newStart >= newEnd) {
					newStart = new Date(newEnd);
					newStart.setDate(newStart.getDate() - 1);
				}
				break;
			case 'resize-right':
				newStart = originalStart!;
				newEnd = addDays(originalEnd!, daysDelta);
				if (newEnd <= newStart) {
					newEnd = new Date(newStart);
					newEnd.setDate(newEnd.getDate() + 1);
				}
				break;
			default:
				return;
		}

		updateTaskBarVisual(ctx, newStart, newEnd, taskMinDate!, state);
	}

	function handleDragEnd(e: MouseEvent): void {
		if (!state.isDragging) return;

		const { task, dragType, originalStart, originalEnd, startX, hasMoved } = state;

		state.isDragging = false;
		setCssProps(activeDocument.body, { cursor: '', userSelect: '' });
		activeDocument.removeEventListener('mousemove', handleDragMove);
		activeDocument.removeEventListener('mouseup', handleDragEnd);

		if (!hasMoved) {
			// 没有移动，视为点击
			state.justFinishedDragging = true;
			const dragState = state;
			window.setTimeout(() => { dragState.justFinishedDragging = false; }, 100);
			if (task!) onTaskClick?.(task);
			return;
		}

		// 有移动，设置标志位屏蔽点击事件
		state.justFinishedDragging = true;
		const dragStateRef = state;
		window.setTimeout(() => { dragStateRef.justFinishedDragging = false; }, 100);

		const daysDelta = Math.round((e.clientX - startX) / ctx.columnWidth);
		if (daysDelta === 0) return;


		const os = parseLocalDate(task!.start);
		const oe = parseLocalDate(task!.end);

		let newStart: Date;
		let newEnd: Date;

		switch (dragType) {
			case 'move':
				newStart = addDays(os, daysDelta);
				newEnd = addDays(oe, daysDelta);
				break;
			case 'resize-left':
				newStart = addDays(os, daysDelta);
				newEnd = oe;
				if (newStart >= newEnd) {
					newStart = new Date(oe);
					newStart.setDate(newStart.getDate() - 1);
				}
				break;
			case 'resize-right':
				newStart = os;
				newEnd = addDays(oe, daysDelta);
				if (newEnd <= os) {
					newEnd = new Date(os);
					newEnd.setDate(newEnd.getDate() + 1);
				}
				break;
			default:
				return;
		}

		if (onDateChange && task!) {
			Promise.resolve(onDateChange(task, newStart, newEnd)).catch((error) => {
				Logger.error('SvgGanttRenderer', 'Error updating task dates:', error);
			});
		}
	}

	/** 强制结束拖拽并清理监听器（用于 renderer destroy / 重渲染前） */
	function destroy(): void {
		activeDocument.removeEventListener('mousemove', handleDragMove);
		activeDocument.removeEventListener('mouseup', handleDragEnd);
		state.isDragging = false;
		state.justFinishedDragging = false;
		setCssProps(activeDocument.body, { cursor: '', userSelect: '' });
	}

	return { setupTaskBarDragging, startDragging, handleDragMove, handleDragEnd, addDays, destroy };
}
