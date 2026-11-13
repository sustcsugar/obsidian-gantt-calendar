/** @jest-environment jsdom */
import { attachTouchScrollGuard, TOUCH_ARM_SLOP_PX } from '../timelineTouchCreate';

/** jsdom 没有实现 TouchEvent，用原生 Event 挂上 touches 模拟触屏移动 */
function dispatchTouchMove(container: HTMLElement, x: number, y: number): Event {
	const event = new Event('touchmove', { bubbles: true, cancelable: true });
	Object.defineProperty(event, 'touches', { value: [{ clientX: x, clientY: y }] });
	container.dispatchEvent(event);
	return event;
}

describe('attachTouchScrollGuard', () => {
	// jsdom 已提供 body，直接作为容器，无需创建元素
	let container: HTMLElement;

	beforeEach(() => {
		container = document.body;
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('长按未完成且手指小幅抖动时，不放弃创建也不阻止滚动', () => {
		const onAbandon = jest.fn();
		const guard = attachTouchScrollGuard(container, {
			originX: 100,
			originY: 100,
			isArmed: () => false,
			onAbandon,
		});
		const event = dispatchTouchMove(container, 100, 100 + TOUCH_ARM_SLOP_PX - 1);
		expect(onAbandon).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(false);
		guard.dispose();
	});

	it('长按未完成且手指移动超过抖动范围时，放弃创建并继续滚动', () => {
		const onAbandon = jest.fn();
		const guard = attachTouchScrollGuard(container, {
			originX: 100,
			originY: 100,
			isArmed: () => false,
			onAbandon,
		});
		const event = dispatchTouchMove(container, 100, 100 + TOUCH_ARM_SLOP_PX + 1);
		expect(onAbandon).toHaveBeenCalledTimes(1);
		expect(event.defaultPrevented).toBe(false);
		guard.dispose();
	});

	it('长按完成后阻止后续滚动，并禁止容器的浏览器手势', () => {
		// jsdom 不认识 touch-action，只能验证样式设置调用，浏览器内会真正生效
		const setProperty = jest.spyOn(CSSStyleDeclaration.prototype, 'setProperty');
		let armed = false;
		const guard = attachTouchScrollGuard(container, {
			originX: 100,
			originY: 100,
			isArmed: () => armed,
			onAbandon: jest.fn(),
		});
		armed = true;
		guard.arm();
		expect(setProperty).toHaveBeenCalledWith('touch-action', 'none');
		const event = dispatchTouchMove(container, 100, 300);
		expect(event.defaultPrevented).toBe(true);
		guard.dispose();
	});

	it('手势结束后移除拦截监听并恢复容器原有的 touch-action', () => {
		const setProperty = jest.spyOn(CSSStyleDeclaration.prototype, 'setProperty');
		jest.spyOn(CSSStyleDeclaration.prototype, 'getPropertyValue').mockReturnValue('pan-y');
		const guard = attachTouchScrollGuard(container, {
			originX: 0,
			originY: 0,
			isArmed: () => true,
			onAbandon: jest.fn(),
		});
		guard.arm();
		guard.dispose();
		expect(setProperty).toHaveBeenLastCalledWith('touch-action', 'pan-y');
		const event = dispatchTouchMove(container, 0, 100);
		expect(event.defaultPrevented).toBe(false);
	});
});
