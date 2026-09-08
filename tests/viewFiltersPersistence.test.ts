/**
 * 视图筛选偏好持久化（data.json）合并逻辑测试
 *
 * viewFilters 从 localStorage 迁移至插件 data.json：
 * - SettingsManager.loadSettings 归一化（mergeViewFilters 按 scope 补全）
 * - main.ts 启动时 hydrate 进 store，变更经订阅防抖写回
 * 这里覆盖纯合并函数与 store 水合/更新的关键行为。
 */
import {
	useCalendarStore,
	mergeViewFilters,
	type ViewFilterState,
	type ViewScope,
} from '../src/ui/store/calendarStore';
import {
	DEFAULT_SORT_STATE,
	DEFAULT_TAG_FILTER_STATE,
	DEFAULT_STATUS_FILTER_STATE,
} from '../src/types';

const SCOPES: ViewScope[] = ['year', 'month', 'week', 'day', 'task', 'gantt', 'sidebar'];

const statusWith = (selectedStatuses: string[]): ViewFilterState['status'] => ({
	...DEFAULT_STATUS_FILTER_STATE,
	selectedStatuses,
});

describe('mergeViewFilters', () => {
	it('无持久化数据时返回全量默认值（7 个 scope 齐全）', () => {
		const merged = mergeViewFilters(undefined);
		expect(Object.keys(merged).sort()).toEqual([...SCOPES].sort());
		for (const scope of SCOPES) {
			expect(merged[scope].status.selectedStatuses).toEqual(
				DEFAULT_STATUS_FILTER_STATE.selectedStatuses
			);
			expect(merged[scope].tag.operator).toBe(DEFAULT_TAG_FILTER_STATE.operator);
			expect(merged[scope].sort).toEqual(DEFAULT_SORT_STATE);
		}
	});

	it('部分数据按 scope 合并：已有字段保留、缺失 scope 回退默认', () => {
		const merged = mergeViewFilters({
			month: {
				status: statusWith(['done']),
				tag: DEFAULT_TAG_FILTER_STATE,
				sort: DEFAULT_SORT_STATE,
			},
		});
		expect(merged.month.status.selectedStatuses).toEqual(['done']);
		expect(merged.week.status.selectedStatuses).toEqual(
			DEFAULT_STATUS_FILTER_STATE.selectedStatuses
		);
	});

	it('两次合并结果不共享内部引用（避免污染共享默认值）', () => {
		const a = mergeViewFilters(undefined);
		a.month.status.selectedStatuses.push('contaminant');
		const b = mergeViewFilters(undefined);
		expect(b.month.status.selectedStatuses).not.toContain('contaminant');
	});
});

describe('useCalendarStore viewFilters', () => {
	beforeEach(() => {
		useCalendarStore.getState().hydrateViewFilters(undefined);
	});

	it('hydrate 将部分数据合入 store，其余 scope 保持默认', () => {
		useCalendarStore.getState().hydrateViewFilters({
			day: {
				status: statusWith(['done']),
				tag: DEFAULT_TAG_FILTER_STATE,
				sort: DEFAULT_SORT_STATE,
			},
		});
		const vf = useCalendarStore.getState().viewFilters;
		expect(vf.day.status.selectedStatuses).toEqual(['done']);
		expect(vf.task.status.selectedStatuses).toEqual(DEFAULT_STATUS_FILTER_STATE.selectedStatuses);
	});

	it('setStatusFilter 只替换目标 scope，其余 scope 引用不变', () => {
		const before = useCalendarStore.getState().viewFilters;
		useCalendarStore
			.getState()
			.setStatusFilter('gantt', statusWith(['done']));
		const after = useCalendarStore.getState().viewFilters;
		expect(after).not.toBe(before);
		expect(after.gantt).not.toBe(before.gantt);
		expect(after.gantt.status.selectedStatuses).toEqual(['done']);
		expect(after.month).toBe(before.month);
	});
});
