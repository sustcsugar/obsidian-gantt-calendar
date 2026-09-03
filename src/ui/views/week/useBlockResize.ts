import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import type { TimeBlock, TimeBlockSegment } from './timelineModel';
import { MIN_DURATION_MIN, minutesToPx, pxToMinutes, snapMinutes, formatMinutes } from './timelineModel';
import { WeekViewClasses, setCssProps } from '../../../utils/bem';

/**
 * 时间块上下边缘 resize 鼠标状态机（参考甘特 taskDragController 模式）：
 * - mousedown 捕获（stopPropagation，避免触发卡片 HTML5 拖源）
 * - mousemove 以 15 分钟吸附（Alt = 5 分钟），钳制在本列 [00:00, 24:00]
 * - 预览走乐观 DOM 更新（block 的 top/height + 时刻标签 + 悬浮气泡），不触发 React 重渲染
 * - mouseup 提交；未产生时间变化不写回，提交失败由调用方用 blockEl 还原样式
 *
 * 监听器闭包存于 ref，add/remove 始终匹配同一引用，无泄漏。
 */
export interface BlockResizeCommit {
	(
		block: TimeBlock,
		seg: TimeBlockSegment,
		edge: 'top' | 'bottom',
		newStartMin: number,
		newEndMin: number,
		blockEl: HTMLElement,
	): void;
}

interface ActiveResize {
	block: TimeBlock;
	seg: TimeBlockSegment;
	edge: 'top' | 'bottom';
	columnEl: HTMLElement;
	blockEl: HTMLElement;
	newStartMin: number;
	newEndMin: number;
	changed: boolean;
	tipEl: HTMLElement;
}

interface DragHandlers {
	move: (e: MouseEvent) => void;
	end: (e: MouseEvent) => void;
}

export function useBlockResize(onCommit: BlockResizeCommit) {
	const activeRef = useRef<ActiveResize | null>(null);
	const handlersRef = useRef<DragHandlers | null>(null);
	const commitRef = useRef(onCommit);
	commitRef.current = onCommit;

	const detach = useCallback(() => {
		const handlers = handlersRef.current;
		if (handlers) {
			document.removeEventListener('mousemove', handlers.move);
			document.removeEventListener('mouseup', handlers.end);
			handlersRef.current = null;
		}
		if (activeRef.current) {
			activeRef.current.tipEl.remove();
			activeRef.current = null;
		}
		setCssProps(document.body, { cursor: '', userSelect: '' });
	}, []);

	/**
	 * 在块手柄 mousedown 时调用（仅主键）。
	 * 返回 true 表示已接管该手势。
	 */
	const beginResize = useCallback((
		e: ReactMouseEvent,
		block: TimeBlock,
		seg: TimeBlockSegment,
		edge: 'top' | 'bottom',
		columnEl: HTMLElement,
		blockEl: HTMLElement,
	): boolean => {
		if (e.button !== 0) return false;
		e.preventDefault();
		e.stopPropagation();
		detach(); // 防御：上一次手势未正常收尾时先解绑

		const tipEl = createDiv(WeekViewClasses.elements.resizeTip);
		document.body.appendChild(tipEl);

		const active: ActiveResize = {
			block,
			seg,
			edge,
			columnEl,
			blockEl,
			newStartMin: seg.startMin,
			newEndMin: seg.endMin,
			changed: false,
			tipEl,
		};
		activeRef.current = active;

		const move = (ev: MouseEvent) => {
			const rect = active.columnEl.getBoundingClientRect();
			const minutes = snapMinutes(pxToMinutes(ev.clientY - rect.top), ev.altKey);

			if (active.edge === 'top') {
				// 上边缘：钳制 [0, 段终点 - 最小时长]
				active.newStartMin = Math.max(0, Math.min(minutes, active.seg.endMin - MIN_DURATION_MIN));
			} else {
				// 下边缘：钳制 [段起点 + 最小时长, 24:00]
				active.newEndMin = Math.min(24 * 60, Math.max(minutes, active.seg.startMin + MIN_DURATION_MIN));
			}

			if (active.newStartMin === active.seg.startMin && active.newEndMin === active.seg.endMin) return;
			active.changed = true;

			// 乐观 DOM 预览
			active.blockEl.style.top = `${minutesToPx(active.newStartMin)}px`;
			active.blockEl.style.height = `${minutesToPx(active.newEndMin - active.newStartMin)}px`;
			const label = active.blockEl.querySelector(`.${WeekViewClasses.elements.timeBlockTime}`);
			if (label) label.textContent = `${formatMinutes(active.newStartMin)} – ${formatMinutes(active.newEndMin)}`;
			active.tipEl.style.left = `${ev.clientX + 12}px`;
			active.tipEl.style.top = `${ev.clientY - 28}px`;
			active.tipEl.textContent = `${formatMinutes(active.newStartMin)} – ${formatMinutes(active.newEndMin)}`;
		};

		const end = () => {
			const finished = activeRef.current;
			detach();
			if (!finished || !finished.changed) return; // 未产生时间变化：样式未被改写，无需提交
			commitRef.current(finished.block, finished.seg, finished.edge, finished.newStartMin, finished.newEndMin, finished.blockEl);
		};

		handlersRef.current = { move, end };
		setCssProps(document.body, { cursor: 'ns-resize', userSelect: 'none' });
		document.addEventListener('mousemove', move);
		document.addEventListener('mouseup', end);
		return true;
	}, [detach]);

	// 组件卸载时强制解绑（甘特控制器的 destroy 模式）
	useEffect(() => () => detach(), [detach]);

	return beginResize;
}
