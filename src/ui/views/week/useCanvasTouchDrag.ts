import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { GCTask } from '../../../types';
import type { TimeBlock } from './timelineModel';
import { pxToMinutes, snapMinutes } from './timelineModel';
import { setCssProps } from '../../../utils/bem';

/**
 * 时间画布的触屏整块拖动（HTML5 DnD 在触屏不可用的替代）：
 * - 块上长按 500ms 进入拖动模式（震动 + 浮起 + 跟随指针的悬浮标签）
 * - pointermove 经 elementFromPoint 命中目标日列，落点 = 指针 - 抓取偏移（块上边缘，吸附 15min）
 * - 松手提交（走各画布现有 commitBlockMove 写回链路）；pointercancel 静默放弃
 * - 长按后未移动即松手 → 派发合成 contextmenu 打开长按菜单（复用 ContextMenuTrigger）
 * - 仅接管 pointerType === 'touch'，桌面鼠标路径零影响
 */
export interface CanvasTouchDragDeps {
	/** 落点提交：task + 目标日索引 + 块上边缘吸附分钟 */
	onCommit: (task: GCTask, dayIndex: number, topEdgeMin: number) => void;
	/** 落点预览（各画布的 dropPreview 状态） */
	setPreview: (p: { dayIndex: number; startMin: number; endMin: number } | null) => void;
	/** 落点列的容器选择器（含 data-day-idx 属性） */
	columnSelector: string;
}

interface PressState {
	timer: number;
	x: number;
	y: number;
	task: GCTask;
	block: TimeBlock;
	blockEl: HTMLElement;
	offsetPx: number;
	durationMin: number;
	dragging: boolean;
	moved: boolean;
	chipEl: HTMLElement | null;
	landing: { dayIndex: number; topMin: number } | null;
}

const LONG_PRESS_MS = 500;
const ARM_SLOP_PX = 12;

export function useCanvasTouchDrag(deps: CanvasTouchDragDeps) {
	const pressRef = useRef<PressState | null>(null);
	const depsRef = useRef(deps);
	depsRef.current = deps;

	const cleanup = useCallback(() => {
		const p = pressRef.current;
		pressRef.current = null;
		document.removeEventListener('pointermove', onPointerMove);
		document.removeEventListener('pointerup', onPointerUp);
		document.removeEventListener('pointercancel', onPointerCancel);
		if (!p) return;
		window.clearTimeout(p.timer);
		p.chipEl?.remove();
		setCssProps(p.blockEl, { opacity: '' });
		depsRef.current.setPreview(null);
	}, []);

	// document 级处理器（经 ref 引用保持稳定）
	const onPointerMove = useCallback((ev: PointerEvent) => {
		const p = pressRef.current;
		if (!p) return;
		if (!p.dragging) {
			// 未武装完成时的位移：超过阈值视为滚动，取消长按
			if (Math.abs(ev.clientX - p.x) > ARM_SLOP_PX || Math.abs(ev.clientY - p.y) > ARM_SLOP_PX) cleanup();
			return;
		}
		p.moved = true;
		// 悬浮标签跟随指针
		if (p.chipEl) {
			p.chipEl.style.left = `${ev.clientX}px`;
			p.chipEl.style.top = `${ev.clientY - 28}px`;
		}
		// 命中目标日列 → 计算落点预览
		const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(depsRef.current.columnSelector) as HTMLElement | null;
		if (!hit) {
			p.landing = null;
			depsRef.current.setPreview(null);
			return;
		}
		const dayIndex = Number(hit.dataset.dayIdx);
		if (Number.isNaN(dayIndex)) { p.landing = null; return; }
		const rect = hit.getBoundingClientRect();
		const topMin = snapMinutes(pxToMinutes(ev.clientY - p.offsetPx - rect.top), false);
		p.landing = { dayIndex, topMin };
		depsRef.current.setPreview({ dayIndex, startMin: topMin, endMin: Math.min(topMin + p.durationMin, 24 * 60) });
	}, [cleanup]);

	const onPointerUp = useCallback((ev: PointerEvent) => {
		const p = pressRef.current;
		cleanup();
		if (!p) return;
		if (p.dragging && p.moved && p.landing) {
			depsRef.current.onCommit(p.task, p.landing.dayIndex, p.landing.topMin);
			return;
		}
		if (p.dragging && !p.moved) {
			// 长按后未移动：打开长按菜单（合成 contextmenu 复用 ContextMenuTrigger 的打开逻辑）
			p.blockEl.dispatchEvent(new MouseEvent('contextmenu', { clientX: p.x, clientY: p.y, bubbles: true, cancelable: true }));
		}
	}, [cleanup]);

	const onPointerCancel = useCallback(() => cleanup(), [cleanup]);

	/**
	 * 块容器 onPointerDown 调用（仅触屏接管；返回 true 表示已记录按压）。
	 * 与 resize 手柄互斥（手柄 stopPropagation 在先），与 HTML5 拖拽互斥（触屏不触发 dragstart）
	 */
	const beginBlockTouchPress = useCallback((e: ReactPointerEvent, block: TimeBlock, blockEl: HTMLElement): void => {
		if (e.pointerType === 'mouse') return; // 桌面走 HTML5 拖拽/右键
		cleanup(); // 防御：上一按压未收尾
		const rect = blockEl.getBoundingClientRect();
		const press: PressState = {
			timer: 0,
			x: e.clientX,
			y: e.clientY,
			task: block.task,
			block,
			blockEl,
			offsetPx: e.clientY - rect.top,
			durationMin: Math.round((block.end.getTime() - block.start.getTime()) / 60000),
			dragging: false,
			moved: false,
			chipEl: null,
			landing: null,
		};
		press.timer = window.setTimeout(() => {
			press.dragging = true;
			navigator.vibrate?.(10);
			setCssProps(blockEl, { opacity: '0.35' });
			// 悬浮标签：跟随指针的任务名条
			const chip = createDiv();
			chip.textContent = block.task.description || '';
			chip.className = 'gc-canvas-drag-chip';
			chip.style.left = `${press.x}px`;
			chip.style.top = `${press.y - 28}px`;
			document.body.appendChild(chip);
			press.chipEl = chip;
		}, LONG_PRESS_MS);
		pressRef.current = press;
		document.addEventListener('pointermove', onPointerMove);
		document.addEventListener('pointerup', onPointerUp);
		document.addEventListener('pointercancel', onPointerCancel);
	}, [cleanup, onPointerMove, onPointerUp, onPointerCancel]);

	// 卸载兜底
	useEffect(() => () => cleanup(), [cleanup]);

	return beginBlockTouchPress;
}
