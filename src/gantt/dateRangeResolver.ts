/**
 * 甘特图任务日期解析共享模块（单一真源）
 *
 * 被 TaskDataAdapter 与 treeBuilder 共同复用，确保：
 * 1. 缺开始字段时按同一回退链（startField → createdDate / startDate）解析起点；
 * 2. 树形模式下父任务/文件/文件夹的汇总条跨度、越界判定与实际绘制的实体任务条 100% 对齐；
 * 3. 零 DOM / Obsidian 运行时依赖，可独立单元测试。
 */

import type { GCTask } from '../types';
import { getTaskDateField } from '../types';
import type { DateFieldType } from './types';

export interface ResolvedGanttStart {
	startDate: Date;
	startSourceField: DateFieldType;
}

export interface ResolvedGanttDateRange {
	startDate: Date;
	endDate: Date;
	startSourceField: DateFieldType;
}

/**
 * 解析甘特图有效开始日期（按配置字段优先，缺省回退至 createdDate / startDate）。
 */
export function resolveGanttStartDate(
	task: GCTask,
	startField: DateFieldType
): ResolvedGanttStart | null {
	const startCandidates: DateFieldType[] = startField === 'createdDate'
		? [startField, 'startDate']
		: startField === 'startDate'
			? [startField, 'createdDate']
			: [startField, 'createdDate', 'startDate'];

	for (const candidate of startCandidates) {
		const value = getTaskDateField(task, candidate);
		if (value && !isNaN(value.getTime())) {
			return { startDate: value, startSourceField: candidate };
		}
	}
	return null;
}

/**
 * 解析任务的甘特图起止日期跨度：
 * - 当结束字段存在时，起点走统一回退链 resolveGanttStartDate()（与 TaskDataAdapter 完全一致）；
 *   若无任何开始候选且允许单日期回退，则退化为单日里程碑（start = end）。
 * - 当结束字段缺失且允许单日期回退时，仅在显式配置的 startField 存在时退化为单日里程碑，
 *   避免仅有自动记录 ➕ 创建日期的无排期备忘被误判为有效甘特任务。
 * - 自动校正倒置日期（start > end 时将 end 夹紧为 start）。
 */
export function resolveGanttTaskDateRange(
	task: GCTask,
	startField: DateFieldType,
	endField: DateFieldType,
	options: { allowSingleDateFallback?: boolean } = {}
): ResolvedGanttDateRange | null {
	const { allowSingleDateFallback = false } = options;
	const rawEnd = getTaskDateField(task, endField);
	const validEnd = rawEnd && !isNaN(rawEnd.getTime()) ? rawEnd : undefined;

	if (validEnd) {
		const resolvedStart = resolveGanttStartDate(task, startField);
		if (resolvedStart) {
			const normalizedEnd = validEnd.getTime() < resolvedStart.startDate.getTime()
				? resolvedStart.startDate
				: validEnd;
			return {
				startDate: resolvedStart.startDate,
				endDate: normalizedEnd,
				startSourceField: resolvedStart.startSourceField,
			};
		}
		if (allowSingleDateFallback) {
			return {
				startDate: validEnd,
				endDate: validEnd,
				startSourceField: endField,
			};
		}
		return null;
	}

	if (allowSingleDateFallback) {
		const explicitStart = getTaskDateField(task, startField);
		if (explicitStart && !isNaN(explicitStart.getTime())) {
			return {
				startDate: explicitStart,
				endDate: explicitStart,
				startSourceField: startField,
			};
		}
	}

	return null;
}
