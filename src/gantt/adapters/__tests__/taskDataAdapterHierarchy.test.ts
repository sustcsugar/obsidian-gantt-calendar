import type { GCTask } from '../../../types';
import { buildTaskHierarchy } from '../../../tasks/hierarchy/taskHierarchy';
import { TaskDataAdapter } from '../taskDataAdapter';

let lineCounter = 0;

function makeTask(overrides: Partial<GCTask> = {}): GCTask {
	lineCounter += 1;
	return {
		filePath: 'a.md',
		fileName: 'a',
		lineNumber: lineCounter,
		content: `- [ ] 任务 ${lineCounter}`,
		description: `任务 ${lineCounter}`,
		completed: false,
		priority: 'normal',
		...overrides,
	};
}

const start = (m: number, d: number) => new Date(2026, m - 1, d);

describe('toGanttChartTasksHierarchical', () => {
	it('父任务自身无日期时由子任务推导聚合范围与进度', () => {
		const parent = makeTask({ tid: 'pppp1111' });
		const child1 = makeTask({ parentTid: 'pppp1111', startDate: start(2, 3), dueDate: start(2, 6), completed: true });
		const child2 = makeTask({ parentTid: 'pppp1111', startDate: start(2, 1), dueDate: start(2, 9) });
		const index = buildTaskHierarchy([parent, child1, child2]);

		const rows = TaskDataAdapter.toGanttChartTasksHierarchical(
			[parent, child1, child2], 'startDate', 'dueDate', index
		);

		expect(rows).toHaveLength(3);
		const agg = rows[0];
		expect(agg.isAggregate).toBe(true);
		expect(agg.start).toBe('2026-02-01');
		expect(agg.end).toBe('2026-02-09');
		expect(agg.progress).toBe(50);
		expect(agg.childProgress).toEqual({ done: 1, total: 2 });
		expect(agg.level).toBe(0);
		expect(rows[1].level).toBe(1);
	});

	it('父任务显式日期优先于子任务范围', () => {
		const parent = makeTask({ tid: 'pppp1111', startDate: start(1, 1), dueDate: start(1, 31) });
		const child = makeTask({ parentTid: 'pppp1111', startDate: start(1, 10), dueDate: start(1, 20) });
		const index = buildTaskHierarchy([parent, child]);

		const rows = TaskDataAdapter.toGanttChartTasksHierarchical([parent, child], 'startDate', 'dueDate', index);
		expect(rows[0].start).toBe('2026-01-01');
		expect(rows[0].end).toBe('2026-01-31');
	});

	it('父任务自己没有日期且子任务也没有日期时不渲染该行', () => {
		const parent = makeTask({ tid: 'pppp1111' });
		const child = makeTask({ parentTid: 'pppp1111' });
		const index = buildTaskHierarchy([parent, child]);

		const rows = TaskDataAdapter.toGanttChartTasksHierarchical([parent, child], 'startDate', 'dueDate', index);
		expect(rows).toHaveLength(0);
	});

	it('子行带 parentId，父行带 tid', () => {
		const parent = makeTask({ tid: 'pppp1111', startDate: start(3, 1), dueDate: start(3, 5) });
		const child = makeTask({ parentTid: 'pppp1111', startDate: start(3, 2), dueDate: start(3, 4) });
		const index = buildTaskHierarchy([parent, child]);

		const rows = TaskDataAdapter.toGanttChartTasksHierarchical([child, parent], 'startDate', 'dueDate', index);
		expect(rows[0].tid).toBe('pppp1111');
		expect(rows[1].parentId).toBe(rows[0].id);
	});

	it('折叠时子行不进入结果但父行标记 collapsed', () => {
		const parent = makeTask({ tid: 'pppp1111', startDate: start(4, 1), dueDate: start(4, 5) });
		const child = makeTask({ parentTid: 'pppp1111', startDate: start(4, 2), dueDate: start(4, 4) });
		const index = buildTaskHierarchy([parent, child]);

		const rows = TaskDataAdapter.toGanttChartTasksHierarchical(
			[parent, child], 'startDate', 'dueDate', index, { collapsedTids: new Set(['pppp1111']) }
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].collapsed).toBe(true);
		expect(rows[0].hasChildren).toBe(true);
	});

	it('关闭层级时旧批量函数行为不变（无 level/聚合字段）', () => {
		const parent = makeTask({ tid: 'pppp1111', startDate: start(5, 1), dueDate: start(5, 5) });
		const rows = TaskDataAdapter.toGanttChartTasks([parent], 'startDate', 'dueDate');
		expect(rows).toHaveLength(1);
		expect(rows[0].level).toBeUndefined();
		expect(rows[0].isAggregate).toBeUndefined();
	});
});
