/**
 * timelineModel 单元测试（周视图/日视图/侧栏每日时间线共用的连续画布数据模型）
 *
 * 覆盖面：吸附与换算、点任务锚定方向体系（前向/后向）、day 精度不虚构时刻、
 * 跨日路由（≥24h 全天条 / <24h 分段）、周内分段延续标记、lane 布局（含上限与
 * 全天行不设上限）、周/单日模型构建的端到端语义、月模型横跨条行数上限。
 */

import {
	snapMinutes,
	formatMinutes,
	minutesToPx,
	pxToMinutes,
	getTaskInterval,
	clampSingleFieldWrite,
	clampForwardPointEnd,
	splitWeekSegments,
	assignLanes,
	buildWeekTimelineModel,
	buildDayTimelineModel,
	buildMonthTimelineModel,
	HOUR_PX,
	MINUTES_PER_DAY,
	type TimeBlockSegment,
	type LaneInfo,
} from '../timelineModel';
import type { GCTask } from '../../../../types';

// ===== 测试工具 =====

/** 2026-09-07（周一）为一周之始 */
const WEEK_START = new Date(2026, 8, 7);
const DAY = (m: number, d: number, h = 0, min = 0): Date => new Date(2026, m, d, h, min);

const mkTask = (over: Partial<GCTask>): GCTask => ({
	filePath: 'a.md',
	fileName: 'a',
	lineNumber: 1,
	content: '',
	description: 'x',
	completed: false,
	priority: 'normal',
	...over,
});

const mkPoint = (startMin: number, endMin: number, continuesBefore = false, continuesAfter = false): TimeBlockSegment & LaneInfo => ({
	dayIndex: 0,
	startMin,
	endMin,
	continuesBefore,
	continuesAfter,
	lane: 0,
	laneCount: 1,
	stackedIndex: 0,
});

// ===== 吸附与换算 =====

describe('snapMinutes / formatMinutes / px 换算', () => {
	it('15 分钟吸附：越过半步向上取', () => {
		expect(snapMinutes(37, false)).toBe(30);
		expect(snapMinutes(38, false)).toBe(45);
		expect(snapMinutes(7, false)).toBe(0);
		expect(snapMinutes(8, false)).toBe(15);
	});

	it('Alt 精调 5 分钟吸附', () => {
		expect(snapMinutes(7, true)).toBe(5);
		expect(snapMinutes(8, true)).toBe(10);
	});

	it('钳制在 [0, 24:00]', () => {
		expect(snapMinutes(-10, false)).toBe(0);
		expect(snapMinutes(2000, false)).toBe(MINUTES_PER_DAY);
	});

	it('formatMinutes：1440 → "24:00"', () => {
		expect(formatMinutes(0)).toBe('00:00');
		expect(formatMinutes(870)).toBe('14:30');
		expect(formatMinutes(1440)).toBe('24:00');
	});

	it('分钟↔像素互逆，1 小时 = HOUR_PX', () => {
		expect(minutesToPx(60)).toBe(HOUR_PX);
		expect(pxToMinutes(HOUR_PX)).toBe(60);
		expect(pxToMinutes(minutesToPx(137))).toBe(137);
	});
});

// ===== 点任务锚定方向体系 =====

describe('getTaskInterval：任务区间语义', () => {
	const F = { startField: 'startDate', endField: 'dueDate', dateField: 'dueDate' } as const;

	it('仅 📅 带时刻（终点角色）→ 后向点 [t-60, t)，锚定方向 backward', () => {
		const t = mkTask({ dueDate: DAY(8, 4, 14, 0), datePrecision: { dueDate: 'time' } });
		const it = getTaskInterval(t, F.startField, F.endField, F.dateField)!;
		expect(it.kind).toBe('point');
		expect(it.pointDirection).toBe('backward');
		expect(it.start).toEqual(DAY(8, 4, 13, 0));
		expect(it.end).toEqual(DAY(8, 4, 14, 0));
	});

	it('仅 🛫 带时刻（起点角色，作为 dateField）→ 前向点 [t, t+60)', () => {
		const t = mkTask({ startDate: DAY(8, 4, 9, 0), datePrecision: { startDate: 'time' } });
		const it = getTaskInterval(t, F.startField, F.endField, 'startDate')!;
		expect(it.kind).toBe('point');
		expect(it.pointDirection).toBe('forward');
		expect(it.start).toEqual(DAY(8, 4, 9, 0));
		expect(it.end).toEqual(DAY(8, 4, 10, 0));
	});

	it('🛫 仅日期 + 📅 同日时刻 → 后向点（day 起点不虚构 00:00）', () => {
		const t = mkTask({
			startDate: DAY(8, 4), dueDate: DAY(8, 4, 14, 0),
			datePrecision: { startDate: 'day', dueDate: 'time' },
		});
		const it = getTaskInterval(t, F.startField, F.endField, F.dateField)!;
		expect(it.kind).toBe('point');
		expect(it.pointDirection).toBe('backward');
		expect(it.start.getHours()).toBe(13);
	});

	it('🛫 时刻 + 📅 同日仅日期 → 前向点（day 终点不虚构 24:00）', () => {
		const t = mkTask({
			startDate: DAY(8, 4, 9, 0), dueDate: DAY(8, 4),
			datePrecision: { startDate: 'time', dueDate: 'day' },
		});
		const it = getTaskInterval(t, F.startField, F.endField, F.dateField)!;
		expect(it.kind).toBe('point');
		expect(it.pointDirection).toBe('forward');
		expect(it.start.getHours()).toBe(9);
		expect(it.end.getHours()).toBe(10);
	});

	it('🛫 仅日期 + 📅 跨日时刻 → 区间 [起点日 00:00, 截止时刻]（必 ≥24h）', () => {
		const t = mkTask({
			startDate: DAY(8, 1), dueDate: DAY(8, 4, 14, 0),
			datePrecision: { startDate: 'day', dueDate: 'time' },
		});
		const it = getTaskInterval(t, F.startField, F.endField, F.dateField)!;
		expect(it.kind).toBe('interval');
		expect(it.start).toEqual(DAY(8, 1, 0, 0));
		expect(it.end).toEqual(DAY(8, 4, 14, 0));
	});

	it('双端带时刻 → 真实区间；倒置时降级为开始时刻的前向点任务', () => {
		const t = mkTask({
			startDate: DAY(8, 1, 22, 0), dueDate: DAY(8, 2, 3, 0),
			datePrecision: { startDate: 'time', dueDate: 'time' },
		});
		const it = getTaskInterval(t, F.startField, F.endField, F.dateField)!;
		expect(it.kind).toBe('interval');
		expect(it.end.getTime() - it.start.getTime()).toBe(5 * 3600 * 1000);

		// 倒置（截止早于开始）：以开始为锚的前向点任务 [SF, SF+60)，
		// 不再钳成零时长区间（画布 0px 高度块不可见），与甘特钳到开始日、月视图锚开始日一致
		const bad = mkTask({
			startDate: DAY(8, 2, 10, 0), dueDate: DAY(8, 1, 9, 0),
			datePrecision: { startDate: 'time', dueDate: 'time' },
		});
		const point = getTaskInterval(bad, F.startField, F.endField, F.dateField)!;
		expect(point.kind).toBe('point');
		expect(point.start).toEqual(DAY(8, 2, 10, 0));
		expect(point.end.getTime() - point.start.getTime()).toBe(60 * 60000);
	});

	it('双端仅日期 → null（全天条）', () => {
		const t = mkTask({
			startDate: DAY(8, 1), dueDate: DAY(8, 5),
			datePrecision: { startDate: 'day', dueDate: 'day' },
		});
		expect(getTaskInterval(t, F.startField, F.endField, F.dateField)).toBeNull();
	});

	it('前向点午夜钳制：23:30 起点 → 终点 = 24:00（时长缩短）', () => {
		const t = mkTask({ startDate: DAY(8, 4, 23, 30), datePrecision: { startDate: 'time' } });
		const it = getTaskInterval(t, F.startField, F.endField, 'startDate')!;
		expect(it.start.getHours()).toBe(23);
		expect(it.start.getMinutes()).toBe(30);
		expect(it.end).toEqual(new Date(2026, 8, 5, 0, 0));
	});

	it('后向点午夜钳制：00:30 截止 → 起点 = 00:00（时长缩短）', () => {
		const t = mkTask({ dueDate: DAY(8, 4, 0, 30), datePrecision: { dueDate: 'time' } });
		const it = getTaskInterval(t, F.startField, F.endField, F.dateField)!;
		expect(it.start).toEqual(DAY(8, 4, 0, 0));
		expect(it.end.getMinutes()).toBe(30);
	});
});

// ===== 单字段写回对端钳制 =====

describe('clampSingleFieldWrite（拖拽单字段写回防倒置）', () => {
	it('终点角色落到对端点之前 → 钳到对端点日并保留落点时刻', () => {
		const t = mkTask({ startDate: DAY(8, 10) });
		const clamped = clampSingleFieldWrite(t, 'dueDate', DAY(8, 8, 14, 30), 'startDate', 'dueDate');
		expect(clamped).toEqual(DAY(8, 10, 14, 30));
	});

	it('终点角色落到对端点之后 → 原样返回（有序）', () => {
		const t = mkTask({ startDate: DAY(8, 10) });
		const value = DAY(8, 12, 9, 0);
		expect(clampSingleFieldWrite(t, 'dueDate', value, 'startDate', 'dueDate')).toBe(value);
	});

	it('起点角色落到对端点之后 → 钳到对端点日并保留落点时刻', () => {
		const t = mkTask({ dueDate: DAY(8, 10) });
		const clamped = clampSingleFieldWrite(t, 'startDate', DAY(8, 12, 8, 0), 'startDate', 'dueDate');
		expect(clamped).toEqual(DAY(8, 10, 8, 0));
	});

	it('无对端点 → 原样返回', () => {
		const t = mkTask({});
		const value = DAY(8, 8, 14, 30);
		expect(clampSingleFieldWrite(t, 'dueDate', value, 'startDate', 'dueDate')).toBe(value);
	});
});

// ===== 快速创建可用终点（ghost 与创建同源） =====

describe('clampForwardPointEnd', () => {
	const seg = (startMin: number) => ({ startMin });

	it('下方无块：默认 1 小时', () => {
		expect(clampForwardPointEnd(510, [])).toBe(570); // 8:30 → 9:30
	});

	it('下方空隙不足 1 小时：钳到下一个块起点（8:30 光标 + 9:00 块 → 9:00）', () => {
		expect(clampForwardPointEnd(510, [seg(540)])).toBe(540);
	});

	it('空隙充足：维持默认 1 小时（下一块在 1 小时之外）', () => {
		expect(clampForwardPointEnd(510, [seg(580)])).toBe(570);
	});

	it('多个块取最近的起点', () => {
		expect(clampForwardPointEnd(510, [seg(600), seg(545), seg(700)])).toBe(545);
	});

	it('光标上方开始的块不参与钳制（并行 lane 场景）', () => {
		expect(clampForwardPointEnd(510, [seg(480)])).toBe(570);
	});

	it('日末钳制：23:30 光标 → 24:00', () => {
		expect(clampForwardPointEnd(1410, [])).toBe(1440);
	});

	it('光标处即块起点：返回值等于 min（无空隙，调用方抑制）', () => {
		expect(clampForwardPointEnd(540, [seg(540)])).toBe(540);
	});
});

// ===== 周内分段 =====

describe('splitWeekSegments', () => {
	it('跨午夜区间切两段，延续边标记正确', () => {
		const segs = splitWeekSegments(DAY(8, 8, 22, 0), DAY(8, 9, 3, 0), WEEK_START);
		expect(segs).toHaveLength(2);
		expect(segs[0]).toMatchObject({ dayIndex: 1, startMin: 1320, endMin: 1440, continuesBefore: false, continuesAfter: true });
		expect(segs[1]).toMatchObject({ dayIndex: 2, startMin: 0, endMin: 180, continuesBefore: true, continuesAfter: false });
	});

	it('周外延续：上周日开始 → 周一段带 continuesBefore', () => {
		const segs = splitWeekSegments(DAY(8, 6, 20, 0), DAY(8, 8, 2, 0), WEEK_START);
		expect(segs[0]).toMatchObject({ dayIndex: 0, startMin: 0, endMin: 1440, continuesBefore: true, continuesAfter: true });
		expect(segs[1]).toMatchObject({ dayIndex: 1, startMin: 0, endMin: 120, continuesBefore: true, continuesAfter: false });
	});

	it('与本周无交集 → 空数组', () => {
		expect(splitWeekSegments(DAY(7, 1), DAY(7, 5), WEEK_START)).toHaveLength(0);
		expect(splitWeekSegments(DAY(8, 20), DAY(8, 25), WEEK_START)).toHaveLength(0);
	});
});

// ===== lane 布局 =====

describe('assignLanes', () => {
	it('传递重叠簇等宽分列；簇结束互不影响', () => {
		const a = mkPoint(540, 660); // 9:00-11:00
		const b = mkPoint(570, 630); // 9:30-10:30
		assignLanes([a, b]);
		expect(a.laneCount).toBe(2);
		expect(b.laneCount).toBe(2);
		expect(a.lane + b.lane).toBe(1); // 分占 0/1

		const c = mkPoint(700, 720); // 独立时段，另一簇
		assignLanes([a, b, c]);
		expect(c.lane).toBe(0);
		expect(c.laneCount).toBe(1);
	});

	it('同时刻重叠按"长者优先"占首列', () => {
		const long = mkPoint(540, 720);
		const short = mkPoint(540, 600);
		assignLanes([short, long]); // 传入顺序与排序无关
		expect(long.lane).toBe(0);
		expect(short.lane).toBe(1);
	});

	it('默认上限 MAX_LANE=3：第 4 条钳到最后一列并标记叠加', () => {
		const items = [
			mkPoint(540, 660), mkPoint(570, 630), mkPoint(600, 720), mkPoint(615, 645),
		];
		assignLanes(items);
		const stacked = items.filter((i) => i.stackedIndex > 0);
		expect(stacked).toHaveLength(1);
		expect(stacked[0].lane).toBe(2);
		expect(stacked[0].laneCount).toBe(3);
	});

	it('全天行语义：maxLane=Infinity 不设上限', () => {
		const items = Array.from({ length: 5 }, (_, i) => mkPoint(0, 1440));
		assignLanes(items, Infinity);
		items.forEach((it, i) => {
			expect(it.lane).toBe(i);
			expect(it.laneCount).toBe(5);
			expect(it.stackedIndex).toBe(0);
		});
	});
});

// ===== 周模型端到端 =====

describe('buildWeekTimelineModel', () => {
	it('三类任务路由：点/区间进网格，≥24h 与双 day 进全天行', () => {
		const model = buildWeekTimelineModel([
			// 后向点：仅 📅 周四 14:00
			mkTask({ lineNumber: 1, dueDate: DAY(8, 10, 14, 0), datePrecision: { dueDate: 'time' } }),
			// <24h 跨夜区间：周三 22:00 → 周四 03:00
			mkTask({
				lineNumber: 2, startDate: DAY(8, 9, 22, 0), dueDate: DAY(8, 10, 3, 0),
				datePrecision: { startDate: 'time', dueDate: 'time' },
			}),
			// ≥24h 混合精度：周二 22:00 → 周四 当日（day）→ 全天条
			mkTask({
				lineNumber: 3, startDate: DAY(8, 8, 22, 0), dueDate: DAY(8, 10),
				datePrecision: { startDate: 'time', dueDate: 'day' },
			}),
			// 双 day 跨日 → 全天条
			mkTask({
				lineNumber: 4, startDate: DAY(8, 8), dueDate: DAY(8, 12),
				datePrecision: { startDate: 'day', dueDate: 'day' },
			}),
		], WEEK_START, 'startDate', 'dueDate', 'dueDate');

		// 周四（dayIndex 3）：后向点 [780, 840)（截止 14:00 为块终点）+ 跨夜区间的尾段 [0, 180)
		const thursday = model.days[3].map((d) => d.seg);
		expect(thursday).toContainEqual(expect.objectContaining({ startMin: 780, endMin: 840 }));
		expect(thursday).toContainEqual(expect.objectContaining({ startMin: 0, endMin: 180, continuesBefore: true }));

		// 全天行 2 条；≥24h 条带时刻标注，双 day 条无标注
		expect(model.allday).toHaveLength(2);
		const withLabel = model.allday.find((b) => b.timeLabel !== undefined)!;
		expect(withLabel.timeLabel).toBe('22:00 →');
		expect(withLabel.startDayIndex).toBe(1);
		expect(withLabel.endDayIndex).toBe(3);
		const plain = model.allday.find((b) => b.timeLabel === undefined)!;
		expect([plain.startDayIndex, plain.endDayIndex]).toEqual([1, 5]);
	});

	it('单日全天按 dateField 命中日进全天行', () => {
		const model = buildWeekTimelineModel([
			mkTask({ lineNumber: 5, dueDate: DAY(8, 11), datePrecision: { dueDate: 'day' } }),
		], WEEK_START, 'startDate', 'dueDate', 'dueDate');
		expect(model.blocks).toHaveLength(0);
		expect(model.allday).toHaveLength(1);
		expect(model.allday[0].startDayIndex).toBe(4);
		expect(model.allday[0].endDayIndex).toBe(4);
	});

	it('同簇 4 块：网格 lane 上限 3 + 叠加；全天行 Infinity 全展开', () => {
		const four = [0, 1, 2, 3].map((i) => mkTask({
			lineNumber: 10 + i,
			startDate: DAY(8, 8, 9, i * 15), dueDate: DAY(8, 8, 11, 0),
			datePrecision: { startDate: 'time', dueDate: 'time' },
		}));
		const model = buildWeekTimelineModel(four, WEEK_START, 'startDate', 'dueDate', 'dueDate');
		const lanes = model.days[1].map((d) => d.seg.lane);
		expect(Math.max(...lanes)).toBe(2); // 上限 3 列
		expect(model.days[1].some((d) => d.seg.stackedIndex > 0)).toBe(true);

		const fiveBars = [0, 1, 2, 3, 4].map((i) => mkTask({
			lineNumber: 20 + i,
			startDate: DAY(8, 8), dueDate: DAY(8, 10),
			datePrecision: { startDate: 'day', dueDate: 'day' },
		}));
		const m2 = buildWeekTimelineModel(fiveBars, WEEK_START, 'startDate', 'dueDate', 'dueDate');
		const barLanes = m2.allday.map((b) => b.lane);
		expect(Math.max(...barLanes)).toBe(4); // 全天行无上限
	});
});

// ===== 单日模型（侧栏/日视图） =====

describe('buildDayTimelineModel', () => {
	const TODAY = DAY(8, 10); // 2026-09-10 周四

	it('裁剪到当日：跨夜尾段 cb=true；≥24h 覆盖当日进全天列表带标注', () => {
		const model = buildDayTimelineModel([
			// 昨夜跨入：周三 22:00 → 周四 03:00
			mkTask({
				lineNumber: 1, startDate: DAY(8, 9, 22, 0), dueDate: DAY(8, 10, 3, 0),
				datePrecision: { startDate: 'time', dueDate: 'time' },
			}),
			// ≥24h 长区间覆盖今日
			mkTask({
				lineNumber: 2, startDate: DAY(8, 8, 9, 0), dueDate: DAY(8, 12, 18, 0),
				datePrecision: { startDate: 'time', dueDate: 'time' },
			}),
			// 与当日无关
			mkTask({ lineNumber: 3, dueDate: DAY(8, 11, 14, 0), datePrecision: { dueDate: 'time' } }),
		], TODAY, 'startDate', 'dueDate', 'dueDate');

		expect(model.blocks).toHaveLength(1);
		expect(model.blocks[0].seg).toMatchObject({ startMin: 0, endMin: 180, continuesBefore: true });
		expect(model.allday).toHaveLength(1);
		expect(model.allday[0].timeLabel).toBe('09:00 → 18:00');
	});

	it('day 精度：gantt 区间覆盖当日 或 dateField 命中日 → 全天列表', () => {
		const model = buildDayTimelineModel([
			mkTask({ lineNumber: 1, startDate: DAY(8, 8), dueDate: DAY(8, 12), datePrecision: { startDate: 'day', dueDate: 'day' } }),
			mkTask({ lineNumber: 2, dueDate: DAY(8, 10), datePrecision: { dueDate: 'day' } }),
			mkTask({ lineNumber: 3, dueDate: DAY(8, 11), datePrecision: { dueDate: 'day' } }),
		], TODAY, 'startDate', 'dueDate', 'dueDate');
		expect(model.blocks).toHaveLength(0);
		expect(model.allday).toHaveLength(2); // 覆盖日 + 命中日；命中 09-11 的不算
	});
});

// ===== 月模型（横跨条行数上限） =====

describe('buildMonthTimelineModel maxSpanLanes', () => {
	/** 以 2026-09-07（周一）为始的一周 */
	const mkWeek = (start: Date): Array<{ days: Array<{ date: Date }> }> => [
		{ days: Array.from({ length: 7 }, (_, i) => ({ date: DAY(8, start.getDate() + i) })) },
	];
	/** day 精度跨日区间任务（🛫~📅 全周横跨条） */
	const mkSpan = (n: number, from: number, to: number): GCTask => mkTask({
		lineNumber: n,
		content: `span${n}`,
		startDate: DAY(8, 7 + from),
		dueDate: DAY(8, 7 + to),
		datePrecision: { startDate: 'day', dueDate: 'day' },
	});

	it('重叠横跨条超过上限：lane 钳到最后一行并标记叠加，spanLaneCount 不超上限', () => {
		const tasks = [0, 1, 2, 3, 4].map((i) => mkSpan(i + 1, 0, 6)); // 5 条全周重叠
		const model = buildMonthTimelineModel(tasks, mkWeek(WEEK_START), 'startDate', 'dueDate', 'dueDate', 3);

		const bars = model[0].spanBars;
		expect(bars).toHaveLength(5);
		expect(model[0].spanLaneCount).toBe(3);
		// 全部条仍在渲染集内，lane 不越界，超出的两条叠加在最后一行
		expect(bars.every((b) => b.lane <= 2)).toBe(true);
		expect(bars.filter((b) => b.stackedIndex > 0)).toHaveLength(2);
	});

	it('不传上限（默认 Infinity）：行为与历史一致，全部各占一行不叠加', () => {
		const tasks = [0, 1, 2, 3, 4].map((i) => mkSpan(i + 1, 0, 6));
		const model = buildMonthTimelineModel(tasks, mkWeek(WEEK_START), 'startDate', 'dueDate', 'dueDate');

		expect(model[0].spanLaneCount).toBe(5);
		expect(model[0].spanBars.every((b) => b.stackedIndex === 0)).toBe(true);
	});

	it('按簇分列：行数取最大簇，簇内未超上限不叠加', () => {
		const tasks = [
			mkSpan(1, 0, 2), // 簇1：周一~周三
			mkSpan(2, 1, 3), // 簇1：周二~周四（与上一条重叠）
			mkSpan(3, 4, 6), // 簇2：周五~周日
		];
		const model = buildMonthTimelineModel(tasks, mkWeek(WEEK_START), 'startDate', 'dueDate', 'dueDate', 3);

		const bars = model[0].spanBars;
		expect(model[0].spanLaneCount).toBe(2);
		expect(bars.every((b) => b.stackedIndex === 0)).toBe(true);
		expect(bars.find((b) => b.task.content === 'span3')?.lane).toBe(0);
	});

	it('跨周横跨条钳制到本周列并标记延续，不影响行数上限', () => {
		const tasks = [mkSpan(1, -3, 10), mkSpan(2, -5, 12)]; // 两周以上的长任务
		const model = buildMonthTimelineModel(tasks, mkWeek(WEEK_START), 'startDate', 'dueDate', 'dueDate', 1);

		const bars = model[0].spanBars;
		expect(bars).toHaveLength(2);
		expect(bars.every((b) => b.startCol === 0 && b.endCol === 6)).toBe(true);
		expect(bars.every((b) => b.continuesBefore && b.continuesAfter)).toBe(true);
		// 上限 1：第一条占 lane 0，第二条叠加
		expect(model[0].spanLaneCount).toBe(1);
		expect(bars.filter((b) => b.stackedIndex > 0)).toHaveLength(1);
	});
});
