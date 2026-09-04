import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

/**
 * 分割线拖拽 hook：鼠标按住分割线拖拽，调整两个相邻面板的尺寸
 * 替换 activeDocument.addEventListener 命令式实现
 */

export interface ResizeDividerOptions {
	/** 主轴方向：'horizontal' 为左右分栏（改宽度），'vertical' 为上下分栏（改高度） */
	direction: 'horizontal' | 'vertical';
	/** 第一个面板 ref（拖拽时修改其 flex-basis） */
	firstRef: RefObject<HTMLDivElement | null>;
	/** 第二个面板 ref */
	secondRef: RefObject<HTMLDivElement | null>;
	/** 最小尺寸（px），默认 100 */
	minSize?: number;
	/** 分隔条宽度（px），用于尺寸计算，默认 8 */
	gap?: number;
}

/**
 * 返回分割线 onPointerDown 处理器（pointer 事件统一鼠标与触摸）
 */
export function useResizeDivider(options: ResizeDividerOptions): (e: ReactPointerEvent<HTMLElement>) => void {
	const { direction, firstRef, secondRef, minSize = 100, gap = 8 } = options;
	const optsRef = useRef(options);
	optsRef.current = options;

	return useCallback((e: ReactPointerEvent<HTMLElement>) => {
		const first = firstRef.current;
		const second = secondRef.current;
		const container = (e.currentTarget).parentElement;
		if (!first || !second || !container) return;

		const isHorizontal = direction === 'horizontal';
		const startPos = isHorizontal ? e.clientX : e.clientY;
		const startFirst = isHorizontal ? first.offsetWidth : first.offsetHeight;
		const total = isHorizontal ? container.offsetWidth : container.offsetHeight;

		const handleMove = (moveEvent: PointerEvent) => {
			const delta = moveEvent[isHorizontal ? 'clientX' : 'clientY'] - startPos;
			const newFirst = Math.max(minSize, startFirst + delta);
			const newSecond = Math.max(minSize, total - newFirst - gap);
			first.style.flex = `0 0 ${newFirst}px`;
			second.style.flex = `0 0 ${newSecond}px`;
		};

		const handleUp = () => {
			document.removeEventListener('pointermove', handleMove);
			document.removeEventListener('pointerup', handleUp);
		};

		document.addEventListener('pointermove', handleMove);
		document.addEventListener('pointerup', handleUp);
	}, [direction, firstRef, secondRef, minSize, gap]);
}