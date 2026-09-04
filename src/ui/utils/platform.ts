import { useEffect, useState } from 'react';
import { Platform } from 'obsidian';

/**
 * 平台/输入方式探测（移动端适配的统一入口）
 *
 * - isPhone：Obsidian Platform.isPhone，辅以宽度断点兜底（平板横屏/窄桌面窗）
 * - isTouch：主输入为粗指针（无 hover）——触屏交互分支与 CSS `@media (hover: none)` 对齐
 *
 * React 侧用 hook（订阅 matchMedia 变化，旋屏/分屏实时生效）；
 * 非 React 场景用同步函数（只读当前值）
 */

const PHONE_WIDTH_QUERY = '(max-width: 520px)';
const TOUCH_QUERY = '(hover: none), (pointer: coarse)';

/** 当前是否为手机形态（同步读取，非响应式） */
export function isPhoneNow(): boolean {
	if (Platform.isPhone) return true;
	if (Platform.isTablet) return false;
	return window.matchMedia(PHONE_WIDTH_QUERY).matches;
}

/** 当前主输入是否为触屏（同步读取，非响应式） */
export function isTouchNow(): boolean {
	return window.matchMedia(TOUCH_QUERY).matches;
}

/** 手机形态（响应式 hook） */
export function useIsPhone(): boolean {
	const [isPhone, setIsPhone] = useState(isPhoneNow);
	useEffect(() => {
		const mql = window.matchMedia(PHONE_WIDTH_QUERY);
		const onChange = () => setIsPhone(isPhoneNow());
		mql.addEventListener('change', onChange);
		return () => mql.removeEventListener('change', onChange);
	}, []);
	return isPhone;
}

/** 触屏主输入（响应式 hook） */
export function useIsTouch(): boolean {
	const [isTouch, setIsTouch] = useState(isTouchNow);
	useEffect(() => {
		const mql = window.matchMedia(TOUCH_QUERY);
		const onChange = () => setIsTouch(isTouchNow());
		mql.addEventListener('change', onChange);
		return () => mql.removeEventListener('change', onChange);
	}, []);
	return isTouch;
}
