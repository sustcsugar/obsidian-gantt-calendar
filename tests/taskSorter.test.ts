/**
 * 任务排序 — 单元测试
 * 对应测试用例: SR-01 ~ SR-05
 */

import { sortTasks, getSortDisplayText, updateSortState, SORT_OPTIONS } from '../src/tasks/taskSorter';
import type { GCTask, SortState, SortField } from '../src/types';

function makeTask(overrides: Partial<GCTask> & { description: string }): GCTask {
	return {
		filePath: 'test.md',
		fileName: 'test.md',
		lineNumber: 1,
		content: `- [ ] ${overrides.description}`,
		completed: false,
		priority: 'normal',
		status: 'todo',
		...overrides,
	};
}

describe('任务排序', () => {
	const tasks: GCTask[] = [
		makeTask({
			description: '低优先级任务',
			priority: 'low',
			dueDate: new Date(2024, 0, 20),
			createdDate: new Date(2024, 0, 3),
		}),
		makeTask({
			description: '高优先级任务',
			priority: 'high',
			dueDate: new Date(2024, 0, 10),
			createdDate: new Date(2024, 0, 1),
		}),
		makeTask({
			description: '中优先级任务',
			priority: 'medium',
			dueDate: new Date(2024, 0, 15),
			createdDate: new Date(2024, 0, 2),
		}),
	];

	describe('sortTasks', () => {
		it('SR-01: 按优先级升序 — 低在前', () => {
			const sorted = sortTasks(tasks, { field: 'priority', order: 'asc' });
			expect(sorted[0].priority).toBe('low');
			expect(sorted[2].priority).toBe('high');
		});

		it('SR-01: 按优先级降序 — 高在前', () => {
			const sorted = sortTasks(tasks, { field: 'priority', order: 'desc' });
			expect(sorted[0].priority).toBe('high');
			expect(sorted[2].priority).toBe('low');
		});

		it('SR-02: 按描述字母排序', () => {
			const sorted = sortTasks(tasks, { field: 'description', order: 'asc' });
			const descriptions = sorted.map(t => t.description);
			// 中文按 localeCompare(zh-CN) 排序
			for (let i = 1; i < descriptions.length; i++) {
				expect(descriptions[i - 1].localeCompare(descriptions[i], 'zh-CN')).toBeLessThanOrEqual(0);
			}
		});

		it('SR-03: 按创建日期升序', () => {
			const sorted = sortTasks(tasks, { field: 'createdDate', order: 'asc' });
			expect(sorted[0].description).toBe('高优先级任务'); // 2024-01-01
			expect(sorted[2].description).toBe('低优先级任务'); // 2024-01-03
		});

		it('SR-04: 按到期日降序', () => {
			const sorted = sortTasks(tasks, { field: 'dueDate', order: 'desc' });
			expect(sorted[0].description).toBe('低优先级任务'); // 2024-01-20
		});

		it('SR-05: 升序/降序反转', () => {
			const asc = sortTasks(tasks, { field: 'dueDate', order: 'asc' });
			const desc = sortTasks(tasks, { field: 'dueDate', order: 'desc' });
			expect(asc[0]).toEqual(desc[2]);
			expect(asc[2]).toEqual(desc[0]);
		});

		it('SR-01a: 无日期的任务排在后面', () => {
			const noDateTask = makeTask({ description: '无日期任务' });
			const withDate = [...tasks, noDateTask];
			const sorted = sortTasks(withDate, { field: 'dueDate', order: 'asc' });
			expect(sorted[sorted.length - 1].description).toBe('无日期任务');
		});

		it('SR-01b: 不修改原数组', () => {
			const original = [...tasks];
			sortTasks(tasks, { field: 'priority', order: 'desc' });
			expect(tasks).toEqual(original);
		});

		it('SR-02a: 相同主排序值时按描述二级排序', () => {
			const samePriority: GCTask[] = [
				makeTask({ description: 'B任务', priority: 'high' }),
				makeTask({ description: 'A任务', priority: 'high' }),
			];
			const sorted = sortTasks(samePriority, { field: 'priority', order: 'asc' });
			expect(sorted[0].description).toBe('A任务');
			expect(sorted[1].description).toBe('B任务');
		});
	});

	describe('getSortDisplayText', () => {
		it('SR-03a: 返回排序字段的图标和方向', () => {
			const text = getSortDisplayText({ field: 'dueDate', order: 'asc' });
			expect(text).toContain('📅');
			expect(text).toContain('⬆️');
		});

		it('SR-04a: 降序显示下箭头', () => {
			const text = getSortDisplayText({ field: 'priority', order: 'desc' });
			expect(text).toContain('⬇️');
		});

		it('SR-03b: 未知字段显示默认图标', () => {
			const text = getSortDisplayText({ field: 'unknown' as SortField, order: 'asc' });
			expect(text).toBe('📊');
		});
	});

	describe('updateSortState', () => {
		it('SR-05a: 同字段切换方向', () => {
			const current: SortState = { field: 'priority', order: 'asc' };
			const updated = updateSortState(current, 'priority');
			expect(updated).toEqual({ field: 'priority', order: 'desc' });
		});

		it('SR-05b: 不同字段切到新字段并升序', () => {
			const current: SortState = { field: 'priority', order: 'desc' };
			const updated = updateSortState(current, 'dueDate');
			expect(updated).toEqual({ field: 'dueDate', order: 'asc' });
		});
	});

	describe('SORT_OPTIONS', () => {
		it('SR-02b: 包含所有排序字段', () => {
			const fields = SORT_OPTIONS.map(o => o.field);
			expect(fields).toContain('priority');
			expect(fields).toContain('description');
			expect(fields).toContain('createdDate');
			expect(fields).toContain('startDate');
			expect(fields).toContain('scheduledDate');
			expect(fields).toContain('dueDate');
			expect(fields).toContain('completionDate');
		});
	});
});
