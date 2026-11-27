import type { GCTask } from '../../../types';
import { buildTaskHierarchy } from '../../../tasks/hierarchy/taskHierarchy';
import { orderTasksWithHierarchy } from '../hierarchyOrder';

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

function parentTask(tid: string, overrides: Partial<GCTask> = {}): GCTask {
	return makeTask({ tid, ...overrides });
}

function childTask(parentTid: string, overrides: Partial<GCTask> = {}): GCTask {
	return makeTask({ parentTid, ...overrides });
}

describe('orderTasksWithHierarchy', () => {
	it('无层级时保持原顺序', () => {
		const a = makeTask();
		const b = makeTask();
		const index = buildTaskHierarchy([a, b]);

		const rows = orderTasksWithHierarchy([a, b], index);
		expect(rows.map((r) => r.task)).toEqual([a, b]);
		expect(rows.every((r) => r.level === 0 && !r.hasChildren)).toBe(true);
	});

	it('父子作为整块：父在子前，子保持给定排序', () => {
		const parent = parentTask('pppp1111');
		const c1 = childTask('pppp1111');
		const c2 = childTask('pppp1111');
		const index = buildTaskHierarchy([parent, c1, c2]);

		// 模拟现有排序把子任务排到父任务之前
		const rows = orderTasksWithHierarchy([c1, parent, c2], index);
		expect(rows.map((r) => r.task)).toEqual([parent, c1, c2]);
		expect(rows.map((r) => r.level)).toEqual([0, 1, 1]);
		expect(rows[0].hasChildren).toBe(true);
		expect(rows[1].parentKey).toBe(`${parent.filePath}:${parent.lineNumber}`);
	});

	it('跨文件父子仍成块', () => {
		const parent = parentTask('pppp1111', { filePath: 'project.md', fileName: 'project' });
		const child = childTask('pppp1111', { filePath: 'daily/x.md', fileName: 'x' });
		const index = buildTaskHierarchy([parent, child]);

		const rows = orderTasksWithHierarchy([child, parent], index);
		expect(rows.map((r) => r.task)).toEqual([parent, child]);
	});

	it('父被筛掉时子任务提升为顶层', () => {
		const parent = parentTask('pppp1111');
		const child = childTask('pppp1111');
		const index = buildTaskHierarchy([parent, child]);

		const rows = orderTasksWithHierarchy([child], index);
		expect(rows).toHaveLength(1);
		expect(rows[0].task).toBe(child);
		expect(rows[0].level).toBe(0);
		expect(rows[0].parentKey).toBeNull();
	});

	it('折叠的父任务不展开子行', () => {
		const parent = parentTask('pppp1111');
		const child = childTask('pppp1111');
		const index = buildTaskHierarchy([parent, child]);

		const rows = orderTasksWithHierarchy([parent, child], index, {
			collapsedTids: new Set(['pppp1111']),
		});
		expect(rows).toHaveLength(1);
		expect(rows[0].task).toBe(parent);
		expect(rows[0].collapsed).toBe(true);
	});

	it('三层嵌套层级递增', () => {
		const root = parentTask('r0000001');
		const mid = childTask('r0000001', { tid: 'm0000002' });
		const leaf = childTask('m0000002');
		const index = buildTaskHierarchy([root, mid, leaf]);

		const rows = orderTasksWithHierarchy([root, mid, leaf], index);
		expect(rows.map((r) => r.level)).toEqual([0, 1, 2]);
	});

	it('重复任务的虚拟实例（同 key）不会被去重丢掉', () => {
		const parent = parentTask('pppp1111');
		const child = childTask('pppp1111');
		// 虚拟实例：浅拷贝，filePath/lineNumber 与原任务相同
		const virtual: GCTask = { ...child, content: '虚拟', description: '虚拟' };
		const index = buildTaskHierarchy([parent, child]);

		const rows = orderTasksWithHierarchy([parent, child, virtual], index);
		expect(rows).toHaveLength(3);
		expect(rows.filter((r) => r.level === 1)).toHaveLength(2);
	});

	it('环数据不死循环', () => {
		const a = makeTask({ tid: 'aaaa0001', parentTid: 'bbbb0002' });
		const b = makeTask({ tid: 'bbbb0002', parentTid: 'aaaa0001' });
		const index = buildTaskHierarchy([a, b]);

		const rows = orderTasksWithHierarchy([a, b], index);
		expect(rows).toHaveLength(2);
	});
});
