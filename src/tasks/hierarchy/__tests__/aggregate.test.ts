import type { GCTask } from '../../../types';
import type { DateFieldType } from '../../../settings/types';
import { buildTaskHierarchy } from '../taskHierarchy';
import { computeAggregateDates, computeGroupStats } from '../aggregate';

function makeTask(lineNumber: number, overrides: Partial<GCTask> = {}): GCTask {
	return {
		filePath: 'a.md',
		fileName: 'a',
		lineNumber,
		content: `- [ ] 任务 ${lineNumber}`,
		description: `任务 ${lineNumber}`,
		completed: false,
		priority: 'normal',
		...overrides,
	};
}

function rel(tid?: string, parent?: string): Partial<GCTask> {
	return { tid, parentTid: parent };
}

const getField = (task: GCTask, field: DateFieldType): Date | undefined => {
	if (field === 'startDate') return task.startDate;
	if (field === 'dueDate') return task.dueDate;
	return undefined;
};

describe('computeGroupStats', () => {
	it('10 个子任务完成 3 个 → 30%', () => {
		const parent = makeTask(1, rel('pppp1111'));
		const children = Array.from({ length: 10 }, (_, i) =>
			makeTask(i + 2, { ...rel(undefined, 'pppp1111'), completed: i < 3 })
		);
		const index = buildTaskHierarchy([parent, ...children]);

		expect(computeGroupStats(index, 'pppp1111')).toEqual({
			leafTotal: 10,
			leafDone: 3,
			progress: 30,
			hasChildren: true,
		});
	});

	it('递归到叶子：孙任务不被算两次', () => {
		const root = makeTask(1, rel('r0000001'));
		const mid = makeTask(2, rel('m0000002', 'r0000001'));
		const leaf1 = makeTask(3, { ...rel(undefined, 'm0000002'), completed: true });
		const leaf2 = makeTask(4, rel(undefined, 'm0000002'));

		const index = buildTaskHierarchy([root, mid, leaf1, leaf2]);
		expect(computeGroupStats(index, 'r0000001')).toEqual({
			leafTotal: 2,
			leafDone: 1,
			progress: 50,
			hasChildren: true,
		});
	});

	it('取消任务计入分母、不计入分子', () => {
		const parent = makeTask(1, rel('pppp1111'));
		const done = makeTask(2, { ...rel(undefined, 'pppp1111'), completed: true });
		const cancelled = makeTask(3, { ...rel(undefined, 'pppp1111'), cancelled: true });
		const index = buildTaskHierarchy([parent, done, cancelled]);

		const stats = computeGroupStats(index, 'pppp1111');
		expect(stats.leafTotal).toBe(2);
		expect(stats.leafDone).toBe(1);
		expect(stats.progress).toBe(50);
	});

	it('父任务自身勾选被忽略（有子任务时）', () => {
		const parent = makeTask(1, { ...rel('pppp1111'), completed: true });
		const child = makeTask(2, rel(undefined, 'pppp1111'));
		const index = buildTaskHierarchy([parent, child]);

		expect(computeGroupStats(index, 'pppp1111').progress).toBe(0);
	});

	it('无子任务时退化为 0/100', () => {
		const leaf = makeTask(1, { tid: 'llll0001', completed: true });
		const index = buildTaskHierarchy([leaf]);
		expect(computeGroupStats(index, 'llll0001')).toEqual({
			leafTotal: 1,
			leafDone: 1,
			progress: 100,
			hasChildren: false,
		});
	});

	it('未知 tid 返回零值', () => {
		const index = buildTaskHierarchy([]);
		expect(computeGroupStats(index, 'nope0000')).toEqual({
			leafTotal: 0,
			leafDone: 0,
			progress: 0,
			hasChildren: false,
		});
	});

	it('环数据下不死循环', () => {
		const a = makeTask(1, rel('aaaa0001', 'bbbb0002'));
		const b = makeTask(2, rel('bbbb0002', 'aaaa0001'));
		const index = buildTaskHierarchy([a, b]);
		const stats = computeGroupStats(index, 'aaaa0001');
		expect(stats.leafTotal).toBeGreaterThanOrEqual(1);
	});
});

describe('computeAggregateDates', () => {
	it('父任务显式日期优先', () => {
		const parent = makeTask(1, {
			...rel('pppp1111'),
			startDate: new Date(2026, 0, 1),
			dueDate: new Date(2026, 0, 31),
		});
		const child = makeTask(2, {
			...rel(undefined, 'pppp1111'),
			startDate: new Date(2026, 0, 10),
			dueDate: new Date(2026, 0, 20),
		});
		const index = buildTaskHierarchy([parent, child]);

		const result = computeAggregateDates(index, 'pppp1111', getField, 'startDate', 'dueDate');
		expect(result.start).toEqual(new Date(2026, 0, 1));
		expect(result.end).toEqual(new Date(2026, 0, 31));
		expect(result.startDerived).toBe(false);
		expect(result.endDerived).toBe(false);
	});

	it('父任务缺日期时由子任务推导（最早开始 / 最晚结束）', () => {
		const parent = makeTask(1, rel('pppp1111'));
		const child1 = makeTask(2, {
			...rel(undefined, 'pppp1111'),
			startDate: new Date(2026, 1, 5),
			dueDate: new Date(2026, 1, 8),
		});
		const child2 = makeTask(3, {
			...rel(undefined, 'pppp1111'),
			startDate: new Date(2026, 1, 3),
			dueDate: new Date(2026, 1, 12),
		});
		const index = buildTaskHierarchy([parent, child1, child2]);

		const result = computeAggregateDates(index, 'pppp1111', getField, 'startDate', 'dueDate');
		expect(result.start).toEqual(new Date(2026, 1, 3));
		expect(result.end).toEqual(new Date(2026, 1, 12));
		expect(result.startDerived).toBe(true);
		expect(result.endDerived).toBe(true);
	});

	it('显式只填一侧：另一侧推导', () => {
		const parent = makeTask(1, { ...rel('pppp1111'), startDate: new Date(2026, 2, 1) });
		const child = makeTask(2, {
			...rel(undefined, 'pppp1111'),
			startDate: new Date(2026, 2, 4),
			dueDate: new Date(2026, 2, 9),
		});
		const index = buildTaskHierarchy([parent, child]);

		const result = computeAggregateDates(index, 'pppp1111', getField, 'startDate', 'dueDate');
		expect(result.start).toEqual(new Date(2026, 2, 1));
		expect(result.end).toEqual(new Date(2026, 2, 9));
		expect(result.startDerived).toBe(false);
		expect(result.endDerived).toBe(true);
	});

	it('子任务都没有日期时结果为 undefined', () => {
		const parent = makeTask(1, rel('pppp1111'));
		const child = makeTask(2, rel(undefined, 'pppp1111'));
		const index = buildTaskHierarchy([parent, child]);

		const result = computeAggregateDates(index, 'pppp1111', getField, 'startDate', 'dueDate');
		expect(result.start).toBeUndefined();
		expect(result.end).toBeUndefined();
	});

	it('叶子任务直接返回自身日期且不标推导', () => {
		const leaf = makeTask(1, {
			tid: 'llll0001',
			startDate: new Date(2026, 3, 1),
			dueDate: new Date(2026, 3, 2),
		});
		const index = buildTaskHierarchy([leaf]);

		const result = computeAggregateDates(index, 'llll0001', getField, 'startDate', 'dueDate');
		expect(result.start).toEqual(new Date(2026, 3, 1));
		expect(result.end).toEqual(new Date(2026, 3, 2));
		expect(result.startDerived).toBe(false);
		expect(result.endDerived).toBe(false);
	});
});
