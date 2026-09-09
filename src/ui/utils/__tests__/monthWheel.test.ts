/**
 * monthWheel 单元测试（月视图滚轮切月工具）
 *
 * 覆盖面：步进累计与方向、冷却窗口、deltaMode 归一化（行/页）、
 * 月份位移的跨年与日号钳制（防 1/31 → 3/3 跳月）。
 */

import { createMonthWheelStep, shiftMonth, WHEEL_STEP_PX, WHEEL_COOLDOWN_MS } from '../monthWheel';

describe('createMonthWheelStep（滚轮步进状态机）', () => {
	it('未达阈值返回 0', () => {
		const step = createMonthWheelStep();
		expect(step(60, 0, 1000)).toBe(0);
	});

	it('一个标准刻度（100px）下滚 → 下月 +1', () => {
		const step = createMonthWheelStep();
		expect(step(WHEEL_STEP_PX, 0, 1000)).toBe(1);
	});

	it('上滚 → 上月 -1', () => {
		const step = createMonthWheelStep();
		expect(step(-WHEEL_STEP_PX, 0, 1000)).toBe(-1);
	});

	it('多次小步累计达标后才切一次', () => {
		const step = createMonthWheelStep();
		expect(step(60, 0, 1000)).toBe(0);
		expect(step(60, 0, 1000)).toBe(1); // 累计 120px 达标
	});

	it('累计在当前符号内，反向滚动可归零不切月', () => {
		const step = createMonthWheelStep();
		expect(step(80, 0, 1000)).toBe(0);
		expect(step(-60, 0, 1000)).toBe(0); // 累计 20px，未达阈值
		expect(step(100, 0, 2000)).toBe(1);
	});

	it('deltaY 为 0（横向滚轮）返回 0', () => {
		const step = createMonthWheelStep();
		expect(step(0, 0, 1000)).toBe(0);
	});

	it('冷却窗口内吞掉事件', () => {
		const step = createMonthWheelStep();
		expect(step(100, 0, 1000)).toBe(1);
		expect(step(100, 0, 1000 + WHEEL_COOLDOWN_MS - 1)).toBe(0);
		expect(step(100, 0, 1000 + WHEEL_COOLDOWN_MS + 50)).toBe(1);
	});

	it('行模式（deltaMode=1）：每行按 33px 换算，多次累积达标', () => {
		const step = createMonthWheelStep();
		expect(step(3, 1, 1000)).toBe(0); // 99px < 100px
		expect(step(3, 1, 2000)).toBe(1); // 累加 198px 达标
	});

	it('页模式（deltaMode=2）：任意非零直接视为一整步', () => {
		const step = createMonthWheelStep();
		expect(step(1, 2, 1000)).toBe(1);
		expect(step(-1, 2, 3000)).toBe(-1);
	});
});

describe('shiftMonth（月份位移 + 日号钳制）', () => {
	it('普通月份平移：9/15 → 10/15 → 8/15', () => {
		expect(shiftMonth(new Date(2026, 8, 15), 1)).toEqual(new Date(2026, 9, 15));
		expect(shiftMonth(new Date(2026, 8, 15), -1)).toEqual(new Date(2026, 7, 15));
	});

	it('跨年：12/20 +1 → 次年 1/20', () => {
		expect(shiftMonth(new Date(2026, 11, 20), 1)).toEqual(new Date(2027, 0, 20));
		expect(shiftMonth(new Date(2026, 0, 20), -1)).toEqual(new Date(2025, 11, 20));
	});

	it('日号钳制：1/31 +1 → 2/28（平年）；闰年 → 2/29', () => {
		expect(shiftMonth(new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 28));
		expect(shiftMonth(new Date(2024, 0, 31), 1)).toEqual(new Date(2024, 1, 29));
	});

	it('回滚钳制：3/31 -1 → 2/28', () => {
		expect(shiftMonth(new Date(2026, 2, 31), -1)).toEqual(new Date(2026, 1, 28));
	});

	it('闰日 2/29 +1 → 3/29（钳制保留日号，不虚构 3/29 不存在的问题）', () => {
		expect(shiftMonth(new Date(2024, 1, 29), 1)).toEqual(new Date(2024, 2, 29));
	});
});
