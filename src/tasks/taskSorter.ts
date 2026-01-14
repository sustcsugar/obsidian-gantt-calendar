/**
 * @fileoverview 任务排序逻辑模块
 * @module tasks/taskSorter
 */

import type { GCTask, SortField, SortOrder, SortState } from '../types';

/**
 * 排序选项配置
 * 每个选项包含字段标识、显示图标和标签
 */
export const SORT_OPTIONS: Array<{ field: SortField; icon: string; label: string }> = [
	{ field: 'priority', icon: '🔺', label: '优先级' },
	{ field: 'description', icon: '🔤', label: '字母排序' },
	{ field: 'createdDate', icon: '➕', label: '创建时间' },
	{ field: 'startDate', icon: '🛫', label: '开始时间' },
	{ field: 'scheduledDate', icon: '⏳', label: '规划时间' },
	{ field: 'dueDate', icon: '📅', label: '截止时间' },
	{ field: 'completionDate', icon: '✅', label: '完成时间' },
];

/**
 * 优先级权重映射
 * 数值越大优先级越高（用于降序排序时高优先级在前）
 */
const PRIORITY_WEIGHTS: Record<string, number> = {
	'highest': 5,
	'high': 4,
	'medium': 3,
	'normal': 2,
	'low': 1,
	'lowest': 0
};

/**
 * 比较可选日期
 * 无日期的任务排在后面
 * 【修复】日期相同时，按描述文本二级排序，确保顺序一致
 */
function compareDates(a: Date | undefined, b: Date | undefined, taskA: GCTask, taskB: GCTask): number {
	if (!a && !b) {
		// 都没有日期时，按描述文本排序
		return taskA.description.localeCompare(taskB.description, 'zh-CN', { numeric: true });
	}
	if (!a) return 1;  // a 无日期排在后面
	if (!b) return -1; // b 无日期排在后面
	const timeDiff = a.getTime() - b.getTime();
	if (timeDiff !== 0) return timeDiff;
	// 日期相同时，按描述文本排序
	return taskA.description.localeCompare(taskB.description, 'zh-CN', { numeric: true });
}

/**
 * 各字段的比较函数
 * 【修复】所有比较函数都添加了二级排序（按描述文本），确保主排序值相同时顺序一致
 */
const comparators: Record<SortField, (a: GCTask, b: GCTask) => number> = {
	priority: (a, b) => {
		// 所有任务都应该有优先级，默认为 'normal'
		const aPriority = PRIORITY_WEIGHTS[a.priority || 'normal'] ?? 2;
		const bPriority = PRIORITY_WEIGHTS[b.priority || 'normal'] ?? 2;
		if (aPriority !== bPriority) {
			return aPriority - bPriority; // 升序：低优先级在前
		}
		// 【修复】优先级相同时，按描述文本字母排序
		return a.description.localeCompare(b.description, 'zh-CN', { numeric: true });
	},

	description: (a, b) => {
		return a.description.localeCompare(b.description, 'zh-CN', { numeric: true });
	},

	createdDate: (a, b) => compareDates(a.createdDate, b.createdDate, a, b),
	startDate: (a, b) => compareDates(a.startDate, b.startDate, a, b),
	scheduledDate: (a, b) => compareDates(a.scheduledDate, b.scheduledDate, a, b),
	dueDate: (a, b) => compareDates(a.dueDate, b.dueDate, a, b),
	completionDate: (a, b) => compareDates(a.completionDate, b.completionDate, a, b),
};

/**
 * 对任务数组进行排序
 * @param tasks 任务数组
 * @param state 排序状态
 * @returns 排序后的新数组（不修改原数组）
 */
export function sortTasks(tasks: GCTask[], state: SortState): GCTask[] {
	const comparator = comparators[state.field];
	if (!comparator) return tasks;

	const sorted = [...tasks];
	sorted.sort((a, b) => {
		const result = comparator(a, b);
		// 降序时反转结果
		return state.order === 'desc' ? -result : result;
	});
	return sorted;
}

/**
 * 获取排序状态的显示文本
 * @param state 排序状态
 * @returns 显示文本（如 "📅⬆️"）
 */
export function getSortDisplayText(state: SortState): string {
	const option = SORT_OPTIONS.find(o => o.field === state.field);
	if (!option) return '📊';
	const arrow = state.order === 'asc' ? '⬆️' : '⬇️';
	return `${option.icon}${arrow}`;
}

/**
 * 更新排序状态
 * - 如果点击的是当前字段，则切换升序/降序
 * - 如果点击的是不同字段，则切换到该字段并设置为升序
 * @param current 当前排序状态
 * @param newField 新选择的字段
 * @returns 更新后的排序状态
 */
export function updateSortState(current: SortState, newField: SortField): SortState {
	if (current.field === newField) {
		// 同字段：切换顺序
		return { field: newField, order: current.order === 'asc' ? 'desc' : 'asc' };
	}
	// 不同字段：切换到新字段，默认升序
	return { field: newField, order: 'asc' };
}
