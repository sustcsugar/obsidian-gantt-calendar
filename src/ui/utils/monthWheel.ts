/**
 * 月视图滚轮切月工具（纯函数，可单测）
 */

/** 切一次月所需的累计像素（一个标准滚轮刻度 ≈ 100px） */
export const WHEEL_STEP_PX = 100;
/** 切换后的冷却窗口（ms）：自由滚轮/触摸板惯性一冲十几月 */
export const WHEEL_COOLDOWN_MS = 200;

export interface MonthWheelStepOptions {
	/** 切月阈值（px，按像素模式归一化后比较） */
	stepPx?: number;
	/** 冷却窗口（ms） */
	cooldownMs?: number;
}

export type MonthWheelDirection = -1 | 0 | 1;

/**
 * 创建滚轮步进状态机：内部累计带符号 deltaY，达到阈值输出一次切月方向
 * （-1 上月 / +1 下月，方向取累计符号）；冷却窗口内吞掉全部事件，防止
 * 惯性滚动连跳多月。deltaMode 归一化：1（行）按 33px/行换算，2（页）直接视为一整步。
 */
export function createMonthWheelStep({
	stepPx = WHEEL_STEP_PX,
	cooldownMs = WHEEL_COOLDOWN_MS,
}: MonthWheelStepOptions = {}) {
	let acc = 0;
	let lastSwitchAt = -Infinity;

	return (deltaY: number, deltaMode: number, now: number): MonthWheelDirection => {
		if (now - lastSwitchAt < cooldownMs) return 0;
		if (deltaMode === 1) deltaY *= 33;
		if (deltaMode === 2) {
			const dir = Math.sign(deltaY) as MonthWheelDirection;
			if (dir !== 0) lastSwitchAt = now;
			return dir;
		}
		if (deltaY === 0) return 0;
		acc += deltaY;
		if (Math.abs(acc) < stepPx) return 0;
		const dir = Math.sign(acc) as MonthWheelDirection;
		acc = 0;
		lastSwitchAt = now;
		return dir;
	};
}

/**
 * 移动 1 个月（dir = -1 上月 / +1 下月），日号钳制到目标月最后一天，
 * 避免「1 月 31 日下月 → 3 月 3 日」的滚月跳月。
 */
export function shiftMonth(current: Date, dir: -1 | 1): Date {
	const y = current.getFullYear();
	const m = current.getMonth() + dir;
	const lastDay = new Date(y, m + 1, 0).getDate();
	return new Date(y, m, Math.min(current.getDate(), lastDay));
}

/** 月份键：'YYYY-M'（零基月），用于动画重挂 key（同月不变） */
export function getMonthKey(date: Date): string {
	return `${date.getFullYear()}-${date.getMonth()}`;
}

/**
 * 相邻月切换的位移方向：-1 上月 / +1 下月 / 0 同月或跨多月
 * （跨多月跳转不适合左右平移，动画降级为淡入淡出）
 */
export function monthTravelDir(prevKey: string, nextKey: string): -1 | 0 | 1 {
	const [py, pm] = prevKey.split('-').map(Number);
	const [ny, nm] = nextKey.split('-').map(Number);
	const diff = ny * 12 + nm - (py * 12 + pm);
	if (diff === -1) return -1;
	if (diff === 1) return 1;
	return 0;
}
