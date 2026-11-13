import { setCssProps } from '../../../utils/bem';

/**
 * 时间线空白处的触屏创建手势支持。
 *
 * 触屏按下时不能立刻接管手势，否则手指上下拖动时间线会被当成创建任务。
 * 这里把「按下」与「允许创建」分开：按下后先等待长按，期间浏览器照常滚动；
 * 长按完成后才接管手势，用于绘制创建选区。
 */

/** 长按进入创建模式的等待时间，与任务块长按拖动保持一致 */
export const LONG_PRESS_MS = 500;

/** 长按等待期间允许的手指抖动范围（像素），超过即视为滚动时间线 */
export const TOUCH_ARM_SLOP_PX = 12;

export interface TouchScrollGuardOptions {
	/** 手指按下位置，用于判断等待期间是否已经变成滚动 */
	originX: number;
	originY: number;
	/** 长按是否已完成 */
	isArmed: () => boolean;
	/** 等待期间手指移动超出抖动范围：放弃创建，滚动继续交给浏览器 */
	onAbandon: () => void;
}

export interface TouchScrollGuard {
	/** 长按完成：禁止浏览器把后续移动当作滚动 */
	arm: () => void;
	/** 手势结束：移除监听并恢复容器原有的 touch-action */
	dispose: () => void;
}

/** 空白处创建手势的状态，单日画布与周视图日列共用 */
export interface CreateGesture {
	anchorMin: number;
	anchorX: number;
	anchorY: number;
	lastMin: number;
	moved: boolean;
	/** 触屏需长按完成后才允许创建；鼠标按下即为 true */
	armed: boolean;
	/** 触屏长按定时器 */
	timer: number;
	/** 触屏滚动拦截 */
	guard: TouchScrollGuard | null;
}

/**
 * 在画布容器上绑定触屏滚动拦截。
 *
 * React 的 onTouchMove 是被动监听，调用 preventDefault 无效，
 * 所以这里使用原生监听并显式声明 passive: false。
 * 触屏的 touchmove 目标固定为按下时的元素，手指移出画布后仍能收到事件。
 */
export function attachTouchScrollGuard(
	container: HTMLElement,
	options: TouchScrollGuardOptions,
): TouchScrollGuard {
	const savedTouchAction = container.style.getPropertyValue('touch-action');
	const onTouchMove = (event: TouchEvent): void => {
		if (options.isArmed()) {
			if (event.cancelable) event.preventDefault();
			return;
		}
		const touch = event.touches[0];
		if (!touch) return;
		const movedX = Math.abs(touch.clientX - options.originX);
		const movedY = Math.abs(touch.clientY - options.originY);
		if (movedX > TOUCH_ARM_SLOP_PX || movedY > TOUCH_ARM_SLOP_PX) {
			options.onAbandon();
		}
	};
	// 长按期间部分浏览器会弹出原生菜单，挡住创建预览
	const onContextMenu = (event: MouseEvent): void => {
		event.preventDefault();
	};
	container.addEventListener('touchmove', onTouchMove, { passive: false });
	container.addEventListener('contextmenu', onContextMenu);
	return {
		arm: () => {
			setCssProps(container, { touchAction: 'none' });
		},
		dispose: () => {
			container.removeEventListener('touchmove', onTouchMove);
			container.removeEventListener('contextmenu', onContextMenu);
			setCssProps(container, { touchAction: savedTouchAction });
		},
	};
}
