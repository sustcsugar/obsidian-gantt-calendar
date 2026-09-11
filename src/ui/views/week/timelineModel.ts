import type { GCTask } from '../../../types';
import { getTaskDateField } from '../../../types';
import type { DateFieldType } from '../../../settings/types';

/**
 * 周视图时间线「连续画布」数据模型（纯函数，无副作用）
 *
 * 时间块按分钟绝对定位：1 小时 = HOUR_PX 像素（单一来源，
 * 由组件以 CSS 变量 --gc-tl-hour-h 注入样式）。
 * 任务在时间线内分三类：
 * 1. 区间任务（ganttStartField+ganttEndField 都有值且至少一个带时刻）→ 时间网格块
 * 2. 点任务（仅 dateFilterField 带时刻）→ 默认时长的块，resize 时升级为区间任务
 * 3. 全天任务（day 精度）→ 全天行横跨条
 */

/** 1 小时的像素高度（改这里即可全局调整，勿在 CSS 中硬编码） */
export const HOUR_PX = 50;
export const DAY_PX = HOUR_PX * 24;
export const MINUTES_PER_DAY = 24 * 60;

/** 吸附粒度：默认 15 分钟，按住 Alt 精调 5 分钟 */
export const SNAP_MINUTES = 15;
export const FINE_SNAP_MINUTES = 5;
/** 最小块时长（一个吸附步长） */
export const MIN_DURATION_MIN = 15;
/** 点任务（单时刻字段）的默认展示时长 */
export const DEFAULT_POINT_DURATION_MIN = 60;
/** 同簇重叠块最多分 3 列，第 4 条起叠加偏移 */
export const MAX_LANE = 3;

/**
 * 快速创建（前向默认时长）的可用终点：钳到当日 24:00 与下一个块的起点。
 * ghost 悬浮预览与点击创建共用此判定，保证所见即所得——
 * 下方空隙不足默认时长时按空隙收缩（例：9:00 有块、光标 8:30 → 终点 9:00）。
 * 返回值等于 min 表示光标处即下一个块起点（无可用空隙），调用方应抑制。
 */
export function clampForwardPointEnd(
	min: number,
	segs: ReadonlyArray<{ startMin: number }>,
	durationMin: number = DEFAULT_POINT_DURATION_MIN,
): number {
	let end = Math.min(min + durationMin, MINUTES_PER_DAY);
	for (const seg of segs) {
		if (seg.startMin >= min && seg.startMin < end) {
			end = seg.startMin;
		}
	}
	return end;
}

/** lane 布局信息（叠加在时间块分段/全天条上） */
export interface LaneInfo {
	lane: number;
	laneCount: number;
	/** 超出 MAX_LANE 的块叠加在最后一列上（渲染时加偏移与阴影，从 1 起） */
	stackedIndex: number;
}

/** 时间网格中某任务在单日内的渲染段 */
export interface TimeBlockSegment extends LaneInfo {
	/** 本周第几天（0 = 周首日） */
	dayIndex: number;
	/** 段起点相对当日 00:00 的分钟偏移 [0, 1440] */
	startMin: number;
	/** 段终点（≤ 1440，1440 = 次日 00:00） */
	endMin: number;
	/** 段起点非真实起点（延续自前一日或周外） */
	continuesBefore: boolean;
	/** 段终点非真实终点（延续至后一日或周外） */
	continuesAfter: boolean;
}

/** 时间网格块（一个任务的完整渲染数据，含各日分段与 lane 布局结果） */
export interface TimeBlock {
	task: GCTask;
	/** 真实起止（点任务的一端为锚、另一端为默认时长推算） */
	start: Date;
	end: Date;
	/** 点任务：仅单时刻字段，无显式区间（resize 后写回时升级） */
	isPoint: boolean;
	/** 点任务的时刻所在字段（写回用） */
	pointField: DateFieldType;
	/** 点任务锚定方向：前向=锚是块起点；后向=锚是块终点（区间任务无） */
	pointDirection?: PointDirection;
	segments: TimeBlockSegment[];
}

/** 全天行横跨条 */
export interface AlldayBar extends LaneInfo {
	task: GCTask;
	/** 钳制到本周的日起（0-6，闭区间） */
	startDayIndex: number;
	endDayIndex: number;
	/** 延续自上周 */
	continuesBefore: boolean;
	/** 延续至下周 */
	continuesAfter: boolean;
	/** 长区间任务的起止时刻标注（如 "09:00 → 18:00"、"22:00 →"），day 精度无标注 */
	timeLabel?: string;
}

/** 点任务锚定方向：前向=锚是块起点（时刻为开始语义）；后向=锚是块终点（时刻为截止语义，闭包） */
export type PointDirection = 'forward' | 'backward';

/** 任务区间分类结果 */
export interface TaskInterval {
	kind: 'interval' | 'point';
	start: Date;
	end: Date;
	pointField: DateFieldType;
	/** 仅点任务：锚定方向（区间任务无） */
	pointDirection?: PointDirection;
}

// ===== 分钟 <-> 像素 =====

export function minutesToPx(minutes: number): number {
	return (minutes / 60) * HOUR_PX;
}

export function pxToMinutes(px: number): number {
	return (px / HOUR_PX) * 60;
}

/** 吸附到 15（或 Alt 精调 5）分钟网格，钳制在 [0, 1440] */
export function snapMinutes(minutes: number, fine: boolean): number {
	const step = fine ? FINE_SNAP_MINUTES : SNAP_MINUTES;
	const snapped = Math.round(minutes / step) * step;
	return Math.max(0, Math.min(MINUTES_PER_DAY, snapped));
}

/** 分钟数格式化为 HH:mm（1440 → "24:00"） */
export function formatMinutes(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = Math.round(minutes % 60);
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ===== 区间提取 =====

function dayStart(d: Date): Date {
	const r = new Date(d);
	r.setHours(0, 0, 0, 0);
	return r;
}

/** 当日终结点（次日 00:00，供 24:00 语义与差值计算使用） */
function nextDayStart(d: Date): Date {
	const r = dayStart(d);
	r.setDate(r.getDate() + 1);
	return r;
}

/**
 * 终点角色字段：时刻为截止语义（闭包），块结束边压在时刻上。
 * ganttEndField 或 dueDate 视为终点角色
 */
function isEndRoleField(field: DateFieldType, endField: DateFieldType): boolean {
	return field === endField || field === 'dueDate';
}

/**
 * 单字段写回的对称钳制（防倒置）：拖拽落点只写 dateField 时另一端点留在原地，
 * 落点越过对端点所在日即产生倒置数据。写终点角色字段（endField/dueDate）钳到
 * 不早于对端点日；写起点角色字段钳到不晚于对端点日；钳制保留落点的时刻部分。
 */
export function clampSingleFieldWrite(
	task: GCTask,
	field: DateFieldType,
	value: Date,
	startField: DateFieldType,
	endField: DateFieldType,
): Date {
	const endRole = isEndRoleField(field, endField);
	const counterpart = getTaskDateField(task, endRole ? startField : endField);
	if (!counterpart || isNaN(counterpart.getTime())) return value;
	const counterpartDay = dayStart(counterpart);
	const valueDay = dayStart(value);
	const inverted = endRole ? valueDay < counterpartDay : valueDay > counterpartDay;
	if (!inverted) return value;
	const clamped = new Date(counterpartDay);
	clamped.setHours(value.getHours(), value.getMinutes(), value.getSeconds(), 0);
	return clamped;
}

/** 前向点任务：锚为块起点 [t, t+60)，终点钳制在当日 24:00 */
function forwardPoint(anchorVal: Date, field: DateFieldType): TaskInterval {
	const start = new Date(anchorVal);
	const dayEnd = nextDayStart(start);
	const end = new Date(start);
	end.setMinutes(end.getMinutes() + DEFAULT_POINT_DURATION_MIN);
	return { kind: 'point', start, end: end > dayEnd ? dayEnd : end, pointField: field, pointDirection: 'forward' };
}

/** 后向点任务：锚为块终点 [t-60, t)，起点钳制在当日 00:00 */
function backwardPoint(anchorVal: Date, field: DateFieldType): TaskInterval {
	const end = new Date(anchorVal);
	const dayBeg = dayStart(end);
	const start = new Date(end);
	start.setMinutes(start.getMinutes() - DEFAULT_POINT_DURATION_MIN);
	return { kind: 'point', start: start < dayBeg ? dayBeg : start, end, pointField: field, pointDirection: 'backward' };
}

/**
 * 提取任务在时间线中的区间语义。
 * 核心原则：day 精度端点不含时刻信息，不得虚构 00:00/24:00 参与时间网格定位。
 *
 * - SF时刻 + EF时刻 → 区间（<24h 分段块 / ≥24h 全天条，由上层路由）
 * - SF时刻 + EF时刻且倒置（EF < SF）→ 前向点任务 [SF, SF+60)（倒置数据以开始为锚容错）
 * - SF时刻 + EF同日仅日期 → 前向点任务 [SF, SF+60)（EF 的 day 无时刻信息）
 * - SF时刻 + EF跨日仅日期 → 区间 [SF, EF 24:00]（必 ≥24h → 全天条 "H:mm →"）
 * - SF仅日期 + EF同日时刻 → 后向点任务 [EF-60, EF)（SF 的 day 无时刻信息）
 * - SF仅日期 + EF跨日时刻 → 区间 [SF 00:00, EF]（必 ≥24h → 全天条 "→ H:mm"）
 * - 双 day → null（全天横跨条）
 * - 单字段（dateFilterField）带时刻：终点角色 → 后向点；其余 → 前向点
 */
export function getTaskInterval(
	task: GCTask,
	startField: DateFieldType,
	endField: DateFieldType,
	dateField: DateFieldType,
): TaskInterval | null {
	const startVal = getTaskDateField(task, startField);
	const endVal = getTaskDateField(task, endField);

	if (startVal && endVal) {
		const startPrecision = task.datePrecision?.[startField];
		const endPrecision = task.datePrecision?.[endField];
		// 两个端点都是 day 精度 → 全天横跨条，不进时间网格
		if (startPrecision !== 'time' && endPrecision !== 'time') return null;

		// day 起点 + 时刻终点（遗留数据常见：🛫 仅日期 + 📅 带时刻）
		if (startPrecision !== 'time') {
			const startDay = dayStart(startVal);
			const endDay = dayStart(endVal);
			if (startDay.getTime() >= endDay.getTime()) {
				// 同日（或数据倒置）：截止时刻为锚的后向点任务
				return backwardPoint(endVal, endField);
			}
			// 跨日：[起点日 00:00, 截止时刻]，时长必 ≥24h → 全天横跨条
			return { kind: 'interval', start: startDay, end: new Date(endVal), pointField: startField };
		}

		// 起点带时刻 + 终点 day
		if (endPrecision !== 'time') {
			const startDay = dayStart(startVal);
			const endDay = dayStart(endVal);
			if (startDay.getTime() >= endDay.getTime()) {
				// 同日（或数据倒置）：day 终点无时刻信息 → 起点为锚的前向点任务
				return forwardPoint(startVal, startField);
			}
			// 跨日：[SF 时刻, EF 当日 24:00]，必 ≥24h → 全天横跨条
			return { kind: 'interval', start: new Date(startVal), end: nextDayStart(endVal), pointField: startField };
		}

		// 双端带时刻且倒置（end < start）：降级为开始时刻的前向点任务——
		// 甘特钳为开始日单条、月视图锚开始日格内卡，画布侧 [t, t+60) 可见，三视图一致
		// （此前钳成零时长区间，画布渲染 0px 高度块不可见）
		const start = new Date(startVal);
		const end = new Date(endVal);
		if (end < start) return forwardPoint(startVal, startField);
		return { kind: 'interval', start, end, pointField: startField };
	}

	// 单字段点任务：dateFilterField 带时刻，方向取决于字段角色
	const dateVal = getTaskDateField(task, dateField);
	if (dateVal && task.datePrecision?.[dateField] === 'time') {
		if (isEndRoleField(dateField, endField)) return backwardPoint(dateVal, dateField);
		return forwardPoint(dateVal, dateField);
	}

	return null;
}

// ===== 周内分段 =====

/**
 * 将 [start, end] 与一周 7 天求交，产出各日分段（lane 信息由 assignLanes 填充）。
 * weekStart 为本周首日 00:00。周外延续用 continuesBefore/After 标记。
 */
export function splitWeekSegments(start: Date, end: Date, weekStart: Date): TimeBlockSegment[] {
	const weekEnd = dayStart(weekStart);
	weekEnd.setDate(weekEnd.getDate() + 7);

	// 与本周无交集
	if (end.getTime() <= weekStart.getTime() || start.getTime() >= weekEnd.getTime()) return [];

	const segments: TimeBlockSegment[] = [];
	for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
		const segDayStart = new Date(weekStart);
		segDayStart.setDate(segDayStart.getDate() + dayIndex);
		const segDayEnd = new Date(segDayStart);
		segDayEnd.setDate(segDayEnd.getDate() + 1);

		// 段与该日无交集
		if (end.getTime() <= segDayStart.getTime() || start.getTime() >= segDayEnd.getTime()) continue;

		const segStart = start.getTime() < segDayStart.getTime() ? segDayStart : start;
		const segEnd = end.getTime() > segDayEnd.getTime() ? segDayEnd : end;

		segments.push({
			dayIndex,
			startMin: Math.round((segStart.getTime() - segDayStart.getTime()) / 60000),
			endMin: Math.round((segEnd.getTime() - segDayStart.getTime()) / 60000),
			continuesBefore: start.getTime() < segDayStart.getTime(),
			continuesAfter: end.getTime() > segDayEnd.getTime(),
			lane: 0,
			laneCount: 1,
			stackedIndex: 0,
		});
	}
	return segments;
}

// ===== lane 布局 =====

interface LaneInput {
	startMin: number;
	endMin: number;
}

/**
 * 贪心 lane 分配（Google Calendar 式重叠分列）：
 * 按 startMin 升序（同时刻长者优先），装入最早可用的 lane；
 * 以"传递重叠簇"为单位计算簇内 lane 总数，簇内等宽分列。
 * 超过 maxLane 的块钳制到最后一列并标记叠加序号。
 * 时间网格（横向分列，列宽有限）用默认 MAX_LANE=3；
 * 全天行（纵向堆行，行高自适应）传 Infinity 不设上限。
 */
export function assignLanes<T extends LaneInput & LaneInfo>(items: T[], maxLane: number = MAX_LANE): void {
	if (items.length === 0) return;

	const sorted = [...items].sort((a, b) =>
		a.startMin - b.startMin || (b.endMin - a.startMin) - (a.endMin - a.startMin)
	);

	const cluster: T[] = [];
	let clusterEnd = -Infinity;
	let clusterMaxLane = 0;
	const laneEnds: number[] = [];

	const flushCluster = () => {
		if (cluster.length === 0) return;
		const laneCount = Math.min(clusterMaxLane + 1, maxLane);
		for (const item of cluster) {
			if (item.lane >= laneCount) {
				// 超出的块叠加在最后一列：stackedIndex 从 1 起
				item.stackedIndex = item.lane - laneCount + 1;
				item.lane = laneCount - 1;
			}
			item.laneCount = laneCount;
		}
		cluster.length = 0;
		clusterEnd = -Infinity;
		clusterMaxLane = 0;
		laneEnds.length = 0;
	};

	for (const item of sorted) {
		// 与当前簇不再传递重叠 → 关簇开新簇
		if (cluster.length > 0 && item.startMin >= clusterEnd) flushCluster();

		// 找最早可用 lane
		let lane = laneEnds.findIndex((end) => end <= item.startMin);
		if (lane === -1) {
			lane = laneEnds.length;
			laneEnds.push(item.endMin);
		} else {
			laneEnds[lane] = item.endMin;
		}

		item.lane = lane;
		item.laneCount = 1;
		item.stackedIndex = 0;
		cluster.push(item);
		clusterEnd = Math.max(clusterEnd, item.endMin);
		clusterMaxLane = Math.max(clusterMaxLane, lane);
	}
	flushCluster();
}

// ===== 主入口：构建一周的时间块与全天条 =====

/** 某日列内待渲染的（块, 段）配对，已按开始时间排序 */
export interface DaySegment {
	block: TimeBlock;
	seg: TimeBlockSegment;
}

export interface WeekTimelineModel {
	/** 每日的时间块分段（含 lane），dayIndex 0-6 */
	days: DaySegment[][];
	/** 本周全部时间块（每任务一份，供拖拽/resize 查询） */
	blocks: TimeBlock[];
	/** 全天行（单日卡 + 跨日横跨条，含 lane 与时刻标注） */
	allday: AlldayBar[];
}

/** 区间任务的时刻标注：两端带时刻 "09:00 → 18:00"，单端 "22:00 →" / "→ 03:00"，纯日期无标注 */
export function buildIntervalTimeLabel(start: Date, end: Date, startTimed: boolean, endTimed: boolean): string | undefined {
	if (!startTimed && !endTimed) return undefined;
	const parts: string[] = [];
	if (startTimed) parts.push(formatMinutes(start.getHours() * 60 + start.getMinutes()));
	parts.push('→');
	if (endTimed) parts.push(formatMinutes(end.getHours() * 60 + end.getMinutes()));
	return parts.join(' ');
}

/** 区间端点恰为某日 00:00 时，最后覆盖日为前一日（如 day 精度结束端=次日 00:00） */
function lastCoveredDay(end: Date, start: Date): Date {
	const e = new Date(end);
	if (e.getHours() === 0 && e.getMinutes() === 0 && e.getSeconds() === 0 && e.getTime() > start.getTime()) {
		e.setDate(e.getDate() - 1);
	}
	return dayStart(e);
}

/** 由起止日构建钳制到本周的横跨条（与本周无交集返回 null） */
function buildSpanBar(
	task: GCTask,
	startDay: Date,
	endDay: Date,
	weekStart: Date,
	weekEndDay: Date,
	timeLabel?: string,
): AlldayBar | null {
	const clampedStart = startDay < weekStart ? new Date(weekStart) : startDay;
	const clampedEnd = endDay > weekEndDay ? weekEndDay : endDay;
	if (clampedStart.getTime() > clampedEnd.getTime()) return null;
	return {
		task,
		startDayIndex: Math.round((clampedStart.getTime() - weekStart.getTime()) / 86400000),
		endDayIndex: Math.round((clampedEnd.getTime() - weekStart.getTime()) / 86400000),
		continuesBefore: startDay < weekStart,
		continuesAfter: endDay > weekEndDay,
		lane: 0,
		laneCount: 1,
		stackedIndex: 0,
		timeLabel,
	};
}

/**
 * 将本周任务分类为时间块与全天条。
 *
 * 区间路由规则（消除"中间日整列被占满"）：
 * - 时长 < 24h（含跨午夜，如 22:00 → 次日 03:00）→ 时间网格分段块
 * - 时长 ≥ 24h（含"🛫带时刻 + 📅仅日期"的多日任务）→ 全天行横跨条 + 时刻标注，不进时间网格
 * - 双端 day 精度 → 全天行横跨条（无时刻标注）
 * - 点任务（单时刻字段）→ 时间网格默认时长块
 *
 * @param tasks  已经过筛选/排序、包含虚拟周期实例的任务列表
 */
export function buildWeekTimelineModel(
	tasks: GCTask[],
	weekStart: Date,
	startField: DateFieldType,
	endField: DateFieldType,
	dateField: DateFieldType,
): WeekTimelineModel {
	const blocks: TimeBlock[] = [];
	const alldayTasks: GCTask[] = [];

	const weekEndDay = new Date(weekStart);
	weekEndDay.setDate(weekEndDay.getDate() + 6);
	const allday: AlldayBar[] = [];

	for (const task of tasks) {
		const interval = getTaskInterval(task, startField, endField, dateField);
		if (interval) {
			const durationMin = Math.round((interval.end.getTime() - interval.start.getTime()) / 60000);
			// 长区间任务（≥24h）：全天行横跨条，时刻标注取自两端精度
			if (interval.kind === 'interval' && durationMin >= MINUTES_PER_DAY) {
				const bar = buildSpanBar(
					task,
					dayStart(interval.start),
					lastCoveredDay(interval.end, interval.start),
					weekStart,
					weekEndDay,
					buildIntervalTimeLabel(
						interval.start, interval.end,
						task.datePrecision?.[startField] === 'time',
						task.datePrecision?.[endField] === 'time',
					),
				);
				if (bar) allday.push(bar);
				continue;
			}
			const segments = splitWeekSegments(interval.start, interval.end, weekStart);
			if (segments.length > 0) {
				blocks.push({
					task,
					start: interval.start,
					end: interval.end,
					isPoint: interval.kind === 'point',
					pointField: interval.pointField,
					pointDirection: interval.pointDirection,
					segments,
				});
			}
			continue;
		}

		// 全天任务：按 dateFilterField 的命中日出现（维持现有语义）
		const dateVal = getTaskDateField(task, dateField);
		if (dateVal && !isNaN(dateVal.getTime())) {
			alldayTasks.push(task);
		}
	}

	// 每日分段 lane 布局（列内互不影响）
	const days: DaySegment[][] = Array.from({ length: 7 }, () => []);
	for (const block of blocks) {
		for (const seg of block.segments) {
			days[seg.dayIndex].push({ block, seg });
		}
	}
	for (const daySegs of days) {
		assignLanes(daySegs.map((d) => d.seg));
		daySegs.sort((a, b) => a.seg.startMin - b.seg.startMin || b.seg.lane - a.seg.lane);
	}

	// 全天行：day 精度跨日渲染横跨条，单日维持 dateFilterField 命中日
	for (const task of alldayTasks) {
		const startVal = getTaskDateField(task, startField);
		const endVal = getTaskDateField(task, endField);
		let bar: AlldayBar | null = null;

		if (startVal && endVal) {
			const startDay = dayStart(startVal);
			const endDay = dayStart(endVal);
			if (startDay < weekStart || endDay > weekEndDay || startDay.getTime() !== endDay.getTime()) {
				bar = buildSpanBar(task, startDay, endDay, weekStart, weekEndDay);
			}
		}

		if (!bar) {
			// 单日全天：按 dateFilterField 命中日
			const dateVal = getTaskDateField(task, dateField);
			if (!dateVal) continue;
			const d = dayStart(dateVal);
			const dayIndex = Math.round((d.getTime() - weekStart.getTime()) / 86400000);
			if (dayIndex < 0 || dayIndex > 6) continue;
			bar = {
				task,
				startDayIndex: dayIndex,
				endDayIndex: dayIndex,
				continuesBefore: false,
				continuesAfter: false,
				lane: 0,
				laneCount: 1,
				stackedIndex: 0,
			};
		}
		allday.push(bar);
	}

	// 全天行 lane 布局：以"天"为最小单位映射到分钟轴（endDay + 1 使相邻日的条正确分列）
	const laneProxy = allday.map((bar) => ({
		bar,
		startMin: bar.startDayIndex * MINUTES_PER_DAY,
		endMin: (bar.endDayIndex + 1) * MINUTES_PER_DAY,
		lane: 0,
		laneCount: 1,
		stackedIndex: 0,
	}));
	// 全天行为纵向堆行（行高自适应），不设 lane 上限——横向 3 列上限仅适用于时间网格
	assignLanes(laneProxy, Infinity);
	for (const proxy of laneProxy) {
		proxy.bar.lane = proxy.lane;
		proxy.bar.laneCount = proxy.laneCount;
		proxy.bar.stackedIndex = proxy.stackedIndex;
	}

	return { days, blocks, allday };
}

// ===== 单日时间线（侧边栏每日时间线） =====

/** 全天列表项（单日无横跨条，纵向卡片 + 可选时刻标注） */
export interface DayAlldayItem {
	task: GCTask;
	/** 长区间任务的起止时刻标注（如 "22:00 → 03:00"） */
	timeLabel?: string;
}

/** 单日时间线模型 */
export interface DayTimelineModel {
	/** 今日时段块（含 lane），按开始时间排序 */
	blocks: DaySegment[];
	/** 全天列表：day 精度命中 + 覆盖今日的 ≥24h 长区间 */
	allday: DayAlldayItem[];
}

/** 区间与单日求交（无交集返回 null），周外/日外延续用 continues 标记 */
function clipToDay(start: Date, end: Date, dayStart: Date): TimeBlockSegment | null {
	const dayEnd = new Date(dayStart);
	dayEnd.setDate(dayEnd.getDate() + 1);
	if (end.getTime() <= dayStart.getTime() || start.getTime() >= dayEnd.getTime()) return null;
	const segStart = start.getTime() < dayStart.getTime() ? dayStart : start;
	const segEnd = end.getTime() > dayEnd.getTime() ? dayEnd : end;
	return {
		dayIndex: 0,
		startMin: Math.round((segStart.getTime() - dayStart.getTime()) / 60000),
		endMin: Math.round((segEnd.getTime() - dayStart.getTime()) / 60000),
		continuesBefore: start.getTime() < dayStart.getTime(),
		continuesAfter: end.getTime() > dayEnd.getTime(),
		lane: 0,
		laneCount: 1,
		stackedIndex: 0,
	};
}

/**
 * 构建单日时间线模型（与周视图同语义）：
 * - <24h 区间/点任务 → 裁剪到当日的时段块（lane 布局，延续边标记）
 * - ≥24h 长区间（覆盖当日）→ 全天列表 + 时刻标注，不进时间网格
 * - day 精度：gantt 区间覆盖当日，或 dateField 命中当日 → 全天列表
 * @param tasks  未过滤取消态的任务全集（模型不筛 cancelled，由调用方决定）
 */
export function buildDayTimelineModel(
	tasks: GCTask[],
	day: Date,
	startField: DateFieldType,
	endField: DateFieldType,
	dateField: DateFieldType,
): DayTimelineModel {
	// 注意：参数名用 day，避免遮蔽模块级 dayStart() 工具函数
	const dayEnd = new Date(day);
	dayEnd.setDate(dayEnd.getDate() + 1);
	const coversDay = (s: Date, e: Date) => s.getTime() < dayEnd.getTime() && e.getTime() > day.getTime();

	const blocks: TimeBlock[] = [];
	const allday: DayAlldayItem[] = [];

	for (const task of tasks) {
		const interval = getTaskInterval(task, startField, endField, dateField);
		if (interval) {
			const durationMin = Math.round((interval.end.getTime() - interval.start.getTime()) / 60000);
			if (interval.kind === 'interval' && durationMin >= MINUTES_PER_DAY) {
				// 覆盖当日的长区间 → 全天列表（带时刻标注）
				if (coversDay(interval.start, interval.end)) {
					allday.push({
						task,
						timeLabel: buildIntervalTimeLabel(
							interval.start, interval.end,
							task.datePrecision?.[startField] === 'time',
							task.datePrecision?.[endField] === 'time',
						),
					});
				}
				continue;
			}
			const seg = clipToDay(interval.start, interval.end, day);
			if (seg) {
				blocks.push({
					task,
					start: interval.start,
					end: interval.end,
					isPoint: interval.kind === 'point',
					pointField: interval.pointField,
					pointDirection: interval.pointDirection,
					segments: [seg],
				});
			}
			continue;
		}

		// day 精度：gantt 双字段区间覆盖当日，或 dateField 命中当日
		const startVal = getTaskDateField(task, startField);
		const endVal = getTaskDateField(task, endField);
		if (startVal && endVal && coversDay(dayStart(startVal), nextDayStart(endVal))) {
			allday.push({ task });
			continue;
		}
		const dateVal = getTaskDateField(task, dateField);
		if (dateVal && dayStart(dateVal).getTime() === day.getTime()) {
			allday.push({ task });
		}
	}

	const daySegs: DaySegment[] = [];
	for (const block of blocks) {
		for (const seg of block.segments) daySegs.push({ block, seg });
	}
	assignLanes(daySegs.map((d) => d.seg));
	daySegs.sort((a, b) => a.seg.startMin - b.seg.startMin || b.seg.lane - a.seg.lane);

	return { blocks: daySegs, allday };
}

// ===== 月视图时间线模型（跨日横跨条 + 格内任务，与周/日视图同语义） =====

/** 月网格周行的横跨条（跨日区间任务） */
export interface MonthSpanBar extends LaneInfo {
	task: GCTask;
	/** 周行内的起始列（0-6，钳制到本周） */
	startCol: number;
	/** 周行内的结束列（0-6，含当日，钳制到本周） */
	endCol: number;
	/** 延续自上月（或上月开始的区间截断） */
	continuesBefore: boolean;
	/** 延续至下月 */
	continuesAfter: boolean;
	/** 长区间任务的起止时刻标注 */
	timeLabel?: string;
}

/** 月网格单行（一周）模型 */
export interface MonthWeekModel {
	/** 该周的横跨条（已 lane 布局） */
	spanBars: MonthSpanBar[];
	/** 横跨条占用行数（决定条带高度） */
	spanLaneCount: number;
	/** 格内任务（单日任务/定时任务锚日），key = toISOStringLocal(date) */
	cells: Map<string, GCTask[]>;
}

/**
 * 构建月视图模型，语义与周/日视图对齐：
 * - 双字段 day 精度区间 / ≥24h 长区间 → 每周横跨条（周内钳制 + 延续标记 + 时刻标注）
 * - <24h 定时任务（点/区间）→ 锚日格内（前向锚=开始日，后向锚=截止日）
 * - 单字段 day 精度 → dateField 命中日格内（维持现状）
 * @param weeks 月网格的周数组（含跨月补齐日），days 为该周 7 天
 * @param maxSpanLanes 横跨条每周最大行数（月视图无滚动，行数须受控防撑高格子；
 *   超出的条叠加到最后一行 stackedIndex，周视图全天行纵向不设上限是因其行高自适应可滚动）
 */
export function buildMonthTimelineModel(
	tasks: GCTask[],
	weeks: Array<{ days: Array<{ date: Date }> }>,
	startField: DateFieldType,
	endField: DateFieldType,
	dateField: DateFieldType,
	maxSpanLanes: number = Infinity,
): MonthWeekModel[] {
	// 预分类：跨日区间任务与锚日格内任务
	const spans: Array<{ task: GCTask; startDay: Date; endDay: Date; timeLabel?: string }> = [];
	const anchored: Array<{ task: GCTask; day: Date }> = [];

	for (const task of tasks) {
		const interval = getTaskInterval(task, startField, endField, dateField);
		if (interval) {
			const durationMin = Math.round((interval.end.getTime() - interval.start.getTime()) / 60000);
			if (interval.kind === 'interval' && durationMin >= MINUTES_PER_DAY) {
				spans.push({
					task,
					startDay: dayStart(interval.start),
					endDay: lastCoveredDay(interval.end, interval.start),
					timeLabel: buildIntervalTimeLabel(
						interval.start, interval.end,
						task.datePrecision?.[startField] === 'time',
						task.datePrecision?.[endField] === 'time',
					),
				});
				continue;
			}
			// <24h 定时任务：锚日入格——前向锚=开始日，后向锚（截止语义）=结束日
			const anchor = interval.pointDirection === 'backward' ? interval.end : interval.start;
			anchored.push({ task, day: dayStart(anchor) });
			continue;
		}

		// 双字段 day 精度区间 → 横跨条
		const startVal = getTaskDateField(task, startField);
		const endVal = getTaskDateField(task, endField);
		if (startVal && endVal) {
			const s = dayStart(startVal);
			const e = dayStart(endVal);
			if (e.getTime() >= s.getTime()) {
				spans.push({ task, startDay: s, endDay: e });
				continue;
			}
		}

		// 单字段：dateField 命中日
		const dateVal = getTaskDateField(task, dateField);
		if (dateVal && !isNaN(dateVal.getTime())) {
			anchored.push({ task, day: dayStart(dateVal) });
		}
	}

	return weeks.map((week) => {
		const weekStart = dayStart(week.days[0].date);
		const weekEnd = dayStart(week.days[6].date);

		// 周内格内任务
		const cells = new Map<string, GCTask[]>();
		for (const day of week.days) {
			const key = dayToKey(day.date);
			cells.set(key, []);
		}
		for (const a of anchored) {
			if (a.day.getTime() >= weekStart.getTime() && a.day.getTime() <= weekEnd.getTime()) {
				cells.get(dayToKey(a.day))?.push(a.task);
			}
		}

		// 周内横跨条：区间与周求交，钳制到列
		const weekBars: MonthSpanBar[] = [];
		for (const s of spans) {
			if (s.endDay.getTime() < weekStart.getTime() || s.startDay.getTime() > weekEnd.getTime()) continue;
			const startCol = Math.round((Math.max(s.startDay.getTime(), weekStart.getTime()) - weekStart.getTime()) / 86400000);
			const endCol = Math.round((Math.min(s.endDay.getTime(), weekEnd.getTime()) - weekStart.getTime()) / 86400000);
			weekBars.push({
				task: s.task,
				startCol,
				endCol,
				continuesBefore: s.startDay < weekStart,
				continuesAfter: s.endDay > weekEnd,
				timeLabel: s.timeLabel,
				lane: 0, laneCount: 1, stackedIndex: 0,
			});
		}

		// lane 布局：月视图行高固定不可滚动，行数受 maxSpanLanes 上限，
		// 超出的条叠加到最后一行（stackedIndex，渲染层加偏移与阴影提示）
		const laneProxy = weekBars.map((bar) => ({
			bar,
			startMin: bar.startCol * MINUTES_PER_DAY,
			endMin: (bar.endCol + 1) * MINUTES_PER_DAY,
			lane: 0, laneCount: 1, stackedIndex: 0,
		}));
		assignLanes(laneProxy, Math.max(1, maxSpanLanes));
		for (const p of laneProxy) {
			p.bar.lane = p.lane;
			p.bar.laneCount = p.laneCount;
			p.bar.stackedIndex = p.stackedIndex;
		}

		return {
			spanBars: weekBars,
			spanLaneCount: weekBars.reduce((max, b) => Math.max(max, b.lane + 1), 0),
			cells,
		};
	});
}

/** Date → 本地日期 key（YYYY-MM-DD，与组件层 toISOStringLocal 一致的天粒度） */
function dayToKey(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}
