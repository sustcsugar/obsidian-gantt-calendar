/**
 * 甘特图 TaskBar 任务条渲染
 *
 * 职责：为每个任务绘制 lead-in 引导条、主任务条（颜色按优先级）、
 * 进度条、左右拖拽手柄，以及拖拽/点击/悬停事件注册。
 */

import type { TimeGranularity } from '../types';
import { GanttClasses } from '../../utils/bem';
import { parseLocalDate, findStartGridUnitIndex, findEndGridUnitIndex, getGridUnitX } from './dateGeometry';
import type { IRenderContext } from './renderContext';

function addSvgClass(element: Element, className: string): void {
	const existing = element.getAttribute('class');
	if (existing) {
		if (!existing.split(' ').includes(className)) {
			element.setAttribute('class', `${existing} ${className}`);
		}
	} else {
		element.setAttribute('class', className);
	}
}

export interface TaskBarRenderOptions {
	svg: SVGSVGElement;
	ns: string;
	minDate: Date;
	granularity: TimeGranularity;
	columnWidth: number;
	rowHeight: number;
	tasks: Array<{
		id: string;
		start: string;
		end: string;
		leadStart?: string;
		progress: number;
		completed?: boolean;
		custom_class?: string;
	}>;
	/** setupTaskBarDragging 回调，用于注册拖拽事件 */
	onSetupDragging: (barGroup: any, bar: any, leftHandle: any, rightHandle: any, task: unknown, minDate: Date) => void;
	/** 任务点击回调 */
	onTaskClick: (task: unknown) => void;
	/** 鼠标悬停回调 */
	onMouseEnter: (task: unknown, element: Element, mousePos?: { x: number; y: number }) => void;
	onMouseLeave: () => void;
	/** 任务列表：用于渲染任务名称 */
	taskNames: Map<string, string>;
}

/**
 * 渲染所有任务条
 * 为每个任务创建：leadBar + 主条 + 进度条 + 左右手柄 + 小白点 + 事件监听
 */
export function renderTaskBars(
	opts: TaskBarRenderOptions,
	ge: { columnWidth: number; rowHeight: number; granularity: TimeGranularity },
): void {
	const { svg, ns, minDate, tasks, onSetupDragging, onTaskClick, onMouseEnter, onMouseLeave } = opts;

	const tasksGroup = activeDocument.createElementNS(ns, 'g');
	addSvgClass(tasksGroup, GanttClasses.elements.tasks);

	tasks.forEach((task, index) => {
		const taskStart = parseLocalDate(task.start);
		const taskEnd = parseLocalDate(task.end);

		const startUnitIndex = findStartGridUnitIndex(taskStart, minDate, ge);
		const endUnitIndex = findEndGridUnitIndex(taskEnd, minDate, ge);
		const x = getGridUnitX(startUnitIndex, ge.columnWidth);
		const y = index * ge.rowHeight + (ge.rowHeight - 24) / 2;
		const duration = endUnitIndex - startUnitIndex;
		const barWidth = Math.max(duration * ge.columnWidth, 20);

		// 任务条组
		const barGroup = activeDocument.createElementNS(ns, 'g');
		addSvgClass(barGroup, GanttClasses.elements.barGroup);
		barGroup.setAttribute('data-task-bar', task.id);

		// Lead-in segment（创建→开始引导条）
		let leadBar: SVGRectElement | null = null;
		if (task.leadStart) {
			const leadStartDate = parseLocalDate(task.leadStart);
			const leadUnitIdx = findStartGridUnitIndex(leadStartDate, minDate, ge);
			const leadX = getGridUnitX(leadUnitIdx, ge.columnWidth);
			const leadWidth = Math.max(x - leadX, 0);
			if (leadWidth > 0) {
				leadBar = activeDocument.createElementNS(ns, 'rect') as SVGRectElement;
				leadBar.setAttribute('x', String(leadX));
				leadBar.setAttribute('y', String(y));
				leadBar.setAttribute('width', String(leadWidth));
				leadBar.setAttribute('height', '24');
				leadBar.setAttribute('rx', '4');
				leadBar.classList.add(GanttClasses.elements.leadBar);
			}
		}

		// 主任务条
		const bar = activeDocument.createElementNS(ns, 'rect');
		bar.setAttribute('x', String(x));
		bar.setAttribute('y', String(y));
		bar.setAttribute('width', String(Math.max(barWidth, 20)));
		bar.setAttribute('height', '24');
		bar.setAttribute('rx', '4');

		// 颜色：根据优先级/完成状态
		let fillColor = 'var(--interactive-accent)';
		if (task.progress === 100) {
			fillColor = 'var(--gc-task-completed, #52c41a)';
		} else if (task.custom_class) {
			const priorityMap: Record<string, string> = {
				'priority-highest': 'var(--gc-color-red, #ef4444)',
				'priority-high': 'var(--gc-color-orange, #f97316)',
				'priority-medium': 'var(--gc-color-yellow, #eab308)',
				'priority-low': 'var(--gc-color-green, #22c55e)',
			};
			for (const [cls, color] of Object.entries(priorityMap)) {
				if (task.custom_class.includes(cls)) { fillColor = color; break; }
			}
		}
		bar.setAttribute('fill', fillColor);
		bar.setAttribute('opacity', '0.85');
		bar.setAttribute('cursor', 'pointer');
		bar.classList.add('task-bar');

		// 进度条
		let progressEl: SVGRectElement | null = null;
		if (task.progress > 0 && task.progress < 100) {
			const pw = barWidth * task.progress / 100;
			progressEl = activeDocument.createElementNS(ns, 'rect') as SVGRectElement;
			progressEl.setAttribute('x', String(x));
			progressEl.setAttribute('y', String(y));
			progressEl.setAttribute('width', String(Math.max(pw - 8, 0)));
			progressEl.setAttribute('height', '24');
			progressEl.setAttribute('rx', '4');
			progressEl.setAttribute('fill', fillColor);
			progressEl.setAttribute('opacity', '0.4');
		}

		// 左手柄
		const HANDLE_HIT = 12;
		const leftHandle = activeDocument.createElementNS(ns, 'rect') as SVGRectElement;
		leftHandle.setAttribute('x', String(x));
		leftHandle.setAttribute('y', String(y));
		leftHandle.setAttribute('width', String(HANDLE_HIT));
		leftHandle.setAttribute('height', '24');
		leftHandle.setAttribute('rx', '2');
		leftHandle.setAttribute('fill', 'transparent');
		leftHandle.setAttribute('cursor', 'w-resize');
		leftHandle.classList.add(GanttClasses.elements.handleLeft);

		// 右手柄
		const rightHandleX = x + barWidth - HANDLE_HIT;
		const rightHandle = activeDocument.createElementNS(ns, 'rect') as SVGRectElement;
		rightHandle.setAttribute('x', String(rightHandleX));
		rightHandle.setAttribute('y', String(y));
		rightHandle.setAttribute('width', String(HANDLE_HIT));
		rightHandle.setAttribute('height', '24');
		rightHandle.setAttribute('rx', '2');
		rightHandle.setAttribute('fill', 'transparent');
		rightHandle.setAttribute('cursor', 'e-resize');
		rightHandle.classList.add(GanttClasses.elements.handleRight);

		// 拖拽事件
		onSetupDragging(barGroup, bar, leftHandle, rightHandle, task, minDate);

		// 点击/悬停事件
		bar.addEventListener('click', () => {
			// 拖拽控制器的 justFinishedDragging 屏蔽了拖拽后的点击
			onTaskClick(task);
		});
		bar.addEventListener('mouseenter', () => {
			bar.setAttribute('opacity', '1');
			onMouseEnter(task, bar);
		});
		bar.addEventListener('mouseleave', () => {
			bar.setAttribute('opacity', '0.85');
			onMouseLeave();
		});

		// 按顺序添加元素（确保 z-order 正确）
		if (leadBar) barGroup.appendChild(leadBar);
		if (progressEl) barGroup.appendChild(progressEl);
		barGroup.appendChild(bar);
		barGroup.appendChild(leftHandle);
		barGroup.appendChild(rightHandle);
		tasksGroup.appendChild(barGroup);
	});

	svg.appendChild(tasksGroup);
}
