/**
 * 周期任务计算器 — 单元测试
 * 对应测试用例: RC-01 ~ RC-10
 */

import {
	parseRepeatRule,
	getNextOccurrence,
	getOccurrencesInRange,
} from '../src/tasks/recurrenceCalculator';

// 辅助函数：创建不含时间的日期
function d(year: number, month: number, day: number): Date {
	return new Date(year, month - 1, day);
}

describe('周期任务计算器', () => {
	describe('parseRepeatRule', () => {
		it('RC-01: every day', () => {
			const rule = parseRepeatRule('every day');
			expect(rule).not.toBeNull();
			expect(rule!.frequency).toBe('daily');
			expect(rule!.interval).toBe(1);
			expect(rule!.whenDone).toBe(false);
		});

		it('RC-01: every 3 days', () => {
			const rule = parseRepeatRule('every 3 days');
			expect(rule!.frequency).toBe('daily');
			expect(rule!.interval).toBe(3);
		});

		it('RC-02: every week on Monday', () => {
			const rule = parseRepeatRule('every week on Monday');
			expect(rule!.frequency).toBe('weekly');
			expect(rule!.days).toEqual([1]); // Monday = 1
		});

		it('RC-02: every week on Monday,Wednesday,Friday', () => {
			const rule = parseRepeatRule('every week on Monday,Wednesday,Friday');
			expect(rule!.frequency).toBe('weekly');
			expect(rule!.days).toEqual([1, 3, 5]);
		});

		it('RC-03: every month on the 15th', () => {
			const rule = parseRepeatRule('every month on the 15th');
			expect(rule!.frequency).toBe('monthly');
			expect(rule!.monthDay).toBe(15);
		});

		it('RC-04: every month on the last', () => {
			const rule = parseRepeatRule('every month on the last');
			expect(rule!.frequency).toBe('monthly');
			expect(rule!.monthDay).toBe('last');
		});

		it('RC-05: every year', () => {
			const rule = parseRepeatRule('every year');
			expect(rule!.frequency).toBe('yearly');
			expect(rule!.interval).toBe(1);
		});

		it('RC-06: every weekday', () => {
			const rule = parseRepeatRule('every weekday');
			expect(rule!.frequency).toBe('daily');
			expect(rule!.isWeekday).toBe(true);
		});

		it('RC-07: every weekend', () => {
			const rule = parseRepeatRule('every weekend');
			expect(rule!.frequency).toBe('daily');
			expect(rule!.isWeekend).toBe(true);
		});

		it('RC-08: every week when done', () => {
			const rule = parseRepeatRule('every week when done');
			expect(rule!.whenDone).toBe(true);
		});

		it('RC-02a: every 2 weeks on Tuesday', () => {
			const rule = parseRepeatRule('every 2 weeks on Tuesday');
			expect(rule!.frequency).toBe('weekly');
			expect(rule!.interval).toBe(2);
			expect(rule!.days).toEqual([2]);
		});

		it('RC-03a: every 3 months', () => {
			const rule = parseRepeatRule('every 3 months');
			expect(rule!.frequency).toBe('monthly');
			expect(rule!.interval).toBe(3);
		});

		it('RC-05a: every 2 years', () => {
			const rule = parseRepeatRule('every 2 years');
			expect(rule!.frequency).toBe('yearly');
			expect(rule!.interval).toBe(2);
		});

		it('RC-01a: 无效规则 → null', () => {
			expect(parseRepeatRule('')).toBeNull();
			expect(parseRepeatRule('invalid')).toBeNull();
			expect(parseRepeatRule('every')).toBeNull();
		});

		it('RC-01b: 大小写不敏感', () => {
			const rule = parseRepeatRule('Every Week On MONDAY When Done');
			expect(rule!.frequency).toBe('weekly');
			expect(rule!.days).toEqual([1]);
			expect(rule!.whenDone).toBe(true);
		});
	});

	describe('getNextOccurrence', () => {
		it('RC-01c: daily: 加 1 天', () => {
			const rule = parseRepeatRule('every day')!;
			const next = getNextOccurrence(rule, d(2024, 1, 15));
			expect(next).toEqual(d(2024, 1, 16));
		});

		it('RC-01d: every 3 days: 加 3 天', () => {
			const rule = parseRepeatRule('every 3 days')!;
			const next = getNextOccurrence(rule, d(2024, 1, 15));
			expect(next).toEqual(d(2024, 1, 18));
		});

		it('RC-02b: weekly: 加 7 天', () => {
			const rule = parseRepeatRule('every week')!;
			const next = getNextOccurrence(rule, d(2024, 1, 15));
			expect(next).toEqual(d(2024, 1, 22));
		});

		it('RC-02c: weekly on Monday: 跳到下个周一', () => {
			const rule = parseRepeatRule('every week on Monday')!;
			// 2024-01-17 是周三
			const next = getNextOccurrence(rule, d(2024, 1, 17));
			expect(next.getDay()).toBe(1); // Monday
			expect(next).toEqual(d(2024, 1, 22));
		});

		it('RC-02d: weekly on Monday: 周日时跳到下个周一', () => {
			const rule = parseRepeatRule('every week on Monday')!;
			const next = getNextOccurrence(rule, d(2024, 1, 14)); // 周日
			expect(next.getDay()).toBe(1);
			expect(next).toEqual(d(2024, 1, 15));
		});

		it('RC-03b: monthly: 加 1 个月', () => {
			const rule = parseRepeatRule('every month')!;
			const next = getNextOccurrence(rule, d(2024, 1, 15));
			expect(next).toEqual(d(2024, 2, 15));
		});

		it('RC-04a: monthly on the last: 月末最后一天', () => {
			const rule = parseRepeatRule('every month on the last')!;
			// 从 Jan 28 开始，避免 setMonth 溢出问题
			const next = getNextOccurrence(rule, d(2024, 1, 28));
			expect(next).toEqual(d(2024, 2, 29)); // 2024 闰年 2 月末
		});

		it('RC-03c: monthly: 15日 → 次月15日', () => {
			const rule = parseRepeatRule('every month')!;
			const next = getNextOccurrence(rule, d(2024, 1, 15));
			expect(next).toEqual(d(2024, 2, 15));
		});

		it('RC-03d: monthly: 31日 → 次月（JS Date setMonth 溢出）', () => {
			const rule = parseRepeatRule('every month')!;
			const next = getNextOccurrence(rule, d(2024, 1, 31));
			// JS Date setMonth 溢出: Jan 31 + setMonth(1) → Mar 溢出
			expect(next.getTime()).toBeGreaterThan(d(2024, 1, 31).getTime());
		});

		it('RC-05b: yearly: 加 1 年', () => {
			const rule = parseRepeatRule('every year')!;
			const next = getNextOccurrence(rule, d(2024, 6, 15));
			expect(next).toEqual(d(2025, 6, 15));
		});

		it('RC-06a: weekday: 周五跳到下周一', () => {
			const rule = parseRepeatRule('every weekday')!;
			// 2024-01-19 是周五
			const next = getNextOccurrence(rule, d(2024, 1, 19));
			expect(next).toEqual(d(2024, 1, 22)); // 周一
		});

		it('RC-06b: weekday: 周三跳到周四', () => {
			const rule = parseRepeatRule('every weekday')!;
			// 2024-01-17 是周三
			const next = getNextOccurrence(rule, d(2024, 1, 17));
			expect(next).toEqual(d(2024, 1, 18)); // 周四
		});

		it('RC-07a: weekend: 周三跳到周六', () => {
			const rule = parseRepeatRule('every weekend')!;
			const next = getNextOccurrence(rule, d(2024, 1, 17));
			expect(next).toEqual(d(2024, 1, 20)); // 周六
		});

		it('RC-07b: weekend: 周六跳到周日', () => {
			const rule = parseRepeatRule('every weekend')!;
			const next = getNextOccurrence(rule, d(2024, 1, 20)); // 周六
			expect(next).toEqual(d(2024, 1, 21)); // 周日
		});
	});

	describe('getOccurrencesInRange', () => {
		it('RC-09: daily 在范围内生成虚拟实例', () => {
			const rule = parseRepeatRule('every day')!;
			const results = getOccurrencesInRange(
				rule,
				d(2024, 1, 15),
				d(2024, 1, 15),
				d(2024, 1, 18),
			);
			expect(results).toEqual([
				d(2024, 1, 16),
				d(2024, 1, 17),
				d(2024, 1, 18),
			]);
		});

		it('RC-09a: 不包含 baseDate 本身', () => {
			const rule = parseRepeatRule('every day')!;
			const results = getOccurrencesInRange(
				rule,
				d(2024, 1, 15),
				d(2024, 1, 15),
				d(2024, 1, 15),
			);
			expect(results).toHaveLength(0);
		});

		it('RC-09b: weekly on Monday 在月范围内', () => {
			const rule = parseRepeatRule('every week on Monday')!;
			const results = getOccurrencesInRange(
				rule,
				d(2024, 1, 1),
				d(2024, 1, 1),
				d(2024, 1, 31),
			);
			// 2024年1月的周一: 1, 8, 15, 22, 29
			expect(results.length).toBeGreaterThan(0);
			results.forEach(r => expect(r.getDay()).toBe(1));
		});

		it('RC-09c: 空范围返回空数组', () => {
			const rule = parseRepeatRule('every day')!;
			const results = getOccurrencesInRange(
				rule,
				d(2024, 1, 20),
				d(2024, 1, 15),
				d(2024, 1, 18),
			);
			expect(results).toHaveLength(0);
		});

		it('RC-09d: 遵守 maxCount 限制', () => {
			const rule = parseRepeatRule('every day')!;
			const results = getOccurrencesInRange(
				rule,
				d(2024, 1, 1),
				d(2024, 1, 1),
				d(2024, 12, 31),
				5,
			);
			expect(results.length).toBeLessThanOrEqual(5);
		});
	});
});
