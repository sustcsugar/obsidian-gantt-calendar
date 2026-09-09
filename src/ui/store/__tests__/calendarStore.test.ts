/**
 * calendarStore 单元测试
 *
 * 覆盖面：pruneTagFilters 幽灵标签剔除的语义（空任务守卫/层级保留/大小写不敏感/
 * 引用稳定/局部更新）+ 接入点（setTasks / notifyTasksUpdated / hydrateViewFilters）。
 */

import {
	pruneTagFilters,
	mergeViewFilters,
	useCalendarStore,
	type ViewScope,
} from '../calendarStore';
import type { GCTask } from '../../../types';

const mkTask = (tags?: string[]): GCTask => ({
	filePath: 'a.md',
	fileName: 'a',
	lineNumber: 1,
	content: '',
	description: 'x',
	completed: false,
	priority: 'normal',
	tags,
});

/** 构造各 scope 指定 selectedTags 的 viewFilters（其余用默认值） */
const mkFilters = (tagByScope: Partial<Record<ViewScope, string[]>>) => {
	const base = mergeViewFilters();
	for (const [scope, tags] of Object.entries(tagByScope)) {
		const s = scope as ViewScope;
		base[s] = { ...base[s], tag: { ...base[s].tag, selectedTags: tags } };
	}
	return base;
};

const resetStore = () =>
	useCalendarStore.setState({
		tasks: [],
		viewFilters: mergeViewFilters(),
		updateSeq: 0,
		changedFilePath: undefined,
	});

describe('pruneTagFilters（幽灵标签剔除）', () => {
	it('任务集为空时返回原引用（水合早于缓存就绪的守卫）', () => {
		const vf = mkFilters({ task: ['work/ob'] });
		expect(pruneTagFilters(vf, [])).toBe(vf);
	});

	it('无幽灵标签时返回原引用（不触发订阅写回）', () => {
		const vf = mkFilters({ task: ['work', 'ob'] });
		const tasks = [mkTask(['work', 'ob'])];
		expect(pruneTagFilters(vf, tasks)).toBe(vf);
	});

	it('幽灵标签被剔除（任务集里已不存在的标签）', () => {
		const vf = mkFilters({ task: ['work/ob'] });
		const pruned = pruneTagFilters(vf, [mkTask(['ob'])]);
		expect(pruned.task.tag.selectedTags).toEqual([]);
	});

	it('有效标签保留（精确匹配）', () => {
		const vf = mkFilters({ task: ['work', 'ob'] });
		const pruned = pruneTagFilters(vf, [mkTask(['ob'])]);
		expect(pruned.task.tag.selectedTags).toEqual(['ob']);
	});

	it('父标签在存在子标签时保留（层级语义与 applyTagFilter 一致）', () => {
		const vf = mkFilters({ task: ['work', 'work/ob'] });
		const pruned = pruneTagFilters(vf, [mkTask(['work/cyclops'])]);
		expect(pruned.task.tag.selectedTags).toEqual(['work']);
	});

	it('大小写不敏感：存在的小写标签保留、失效的剔除', () => {
		const vf = mkFilters({ task: ['WORK', 'WORK/OB'] });
		const pruned = pruneTagFilters(vf, [mkTask(['work'])]);
		expect(pruned.task.tag.selectedTags).toEqual(['WORK']);
	});

	it('只重建受影响的 scope，其余 scope 引用不变', () => {
		const vf = mkFilters({ task: ['work/ob'], month: ['work'] });
		const pruned = pruneTagFilters(vf, [mkTask(['work'])]);
		expect(pruned.task.tag.selectedTags).toEqual([]);
		expect(pruned.task).not.toBe(vf.task);
		expect(pruned.month).toBe(vf.month);
	});
});

describe('store 接入点（setTasks / notifyTasksUpdated / hydrate）', () => {
	beforeEach(resetStore);

	it('setTasks 触发剔除', () => {
		useCalendarStore.getState().hydrateViewFilters(mkFilters({ task: ['work/ob', 'ob'] }));
		useCalendarStore.getState().setTasks([mkTask(['ob'])]);
		expect(useCalendarStore.getState().viewFilters.task.tag.selectedTags).toEqual(['ob']);
	});

	it('notifyTasksUpdated 触发剔除', () => {
		useCalendarStore.getState().hydrateViewFilters(mkFilters({ task: ['work/ob'] }));
		useCalendarStore.getState().notifyTasksUpdated([mkTask(['ob'])], 'a.md');
		expect(useCalendarStore.getState().viewFilters.task.tag.selectedTags).toEqual([]);
	});

	it('hydrate 时任务集为空不剔除（等待真实任务到来）', () => {
		useCalendarStore.getState().hydrateViewFilters(mkFilters({ task: ['work/ob'] }));
		expect(useCalendarStore.getState().viewFilters.task.tag.selectedTags).toEqual(['work/ob']);
	});

	it('hydrate 时任务集就绪则立即剔除', () => {
		resetStore();
		useCalendarStore.getState().setTasks([mkTask(['ob'])]);
		useCalendarStore.getState().hydrateViewFilters(mkFilters({ task: ['work/ob', 'ob'] }));
		expect(useCalendarStore.getState().viewFilters.task.tag.selectedTags).toEqual(['ob']);
	});

	it('notifyTasksUpdated 同数组同文件跳过（不重复自增 updateSeq）', () => {
		const tasks = [mkTask(['ob'])];
		useCalendarStore.getState().notifyTasksUpdated(tasks, 'a.md');
		const before = useCalendarStore.getState().updateSeq;
		useCalendarStore.getState().notifyTasksUpdated(tasks, 'a.md');
		expect(useCalendarStore.getState().updateSeq).toBe(before);
	});
});
