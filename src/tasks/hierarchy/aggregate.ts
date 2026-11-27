/**
 * 任务分组的聚合计算（纯函数）。
 *
 * 进度：等权 —— 已完成叶子数 / 叶子总数，递归到最底层任务计数，
 *       避免「孙子任务被算两次」。取消任务计入分母、不计入分子。
 * 时间：显式优先 —— 父任务自己填的日期优先，缺哪一侧才由叶子任务推导。
 */

import type { GCTask } from '../../types';
import type { DateFieldType } from '../../settings/types';
import type { HierarchyNode, TaskHierarchyIndex } from './taskHierarchy';

export interface GroupStats {
	leafTotal: number;
	leafDone: number;
	/** 0-100，向下取整 */
	progress: number;
	hasChildren: boolean;
}

export interface AggregateDates {
	start?: Date;
	end?: Date;
	/** 该侧是否由子任务推导而来（UI 需要标注来源） */
	startDerived: boolean;
	endDerived: boolean;
}

/** 遍历子树里的叶子节点（迭代 + 访问标记，兼容非法环数据） */
function forEachLeaf(root: HierarchyNode, visit: (leaf: HierarchyNode) => void): void {
	const visited = new Set<HierarchyNode>();
	const stack: HierarchyNode[] = [root];

	while (stack.length > 0) {
		const node = stack.pop() as HierarchyNode;
		if (visited.has(node)) continue;
		visited.add(node);

		if (node.children.length === 0) {
			visit(node);
			continue;
		}
		for (const child of node.children) {
			if (!visited.has(child)) stack.push(child);
		}
	}
}

/**
 * 分组进度。
 *
 * 父任务自身的 completed 在「有子任务」时被忽略（勾选框只读，由子任务决定）。
 * 没有子任务时退化为自身完成态（0 / 100），保持与旧行为一致。
 */
export function computeGroupStats(index: TaskHierarchyIndex, tid: string): GroupStats {
	const node = index.byTid.get(tid);
	if (!node) {
		return { leafTotal: 0, leafDone: 0, progress: 0, hasChildren: false };
	}
	return computeNodeStats(node);
}

/** 按节点直接算（调用方已持有节点时少一次查找） */
export function computeNodeStats(node: HierarchyNode): GroupStats {
	if (!node.hasChildren) {
		const done = node.task.completed && !node.task.cancelled;
		return { leafTotal: 1, leafDone: done ? 1 : 0, progress: done ? 100 : 0, hasChildren: false };
	}

	let leafTotal = 0;
	let leafDone = 0;
	forEachLeaf(node, (leaf) => {
		leafTotal += 1;
		if (leaf.task.completed && !leaf.task.cancelled) leafDone += 1;
	});

	const progress = leafTotal > 0 ? Math.floor((leafDone / leafTotal) * 100) : 0;
	return { leafTotal, leafDone, progress, hasChildren: true };
}

/**
 * 分组时间范围。
 *
 * @param getField 解析某任务某日期字段的有效值（由甘特适配器提供回退链）
 */
export function computeAggregateDates(
	index: TaskHierarchyIndex,
	tid: string,
	getField: (task: GCTask, field: DateFieldType) => Date | undefined,
	startField: DateFieldType,
	endField: DateFieldType
): AggregateDates {
	const node = index.byTid.get(tid);
	if (!node) return { startDerived: false, endDerived: false };
	return computeNodeAggregateDates(node, getField, startField, endField);
}

export function computeNodeAggregateDates(
	node: HierarchyNode,
	getField: (task: GCTask, field: DateFieldType) => Date | undefined,
	startField: DateFieldType,
	endField: DateFieldType,
	/** 可选：解析父任务自身显式日期（默认与 getField 相同）。用于甘特的 start 回退链区分。 */
	getExplicitField: (task: GCTask, field: DateFieldType) => Date | undefined = getField
): AggregateDates {
	const explicitStart = getExplicitField(node.task, startField);
	const explicitEnd = getExplicitField(node.task, endField);

	if (!node.hasChildren) {
		return { start: explicitStart, end: explicitEnd, startDerived: false, endDerived: false };
	}

	let minStart: Date | undefined;
	let maxEnd: Date | undefined;

	forEachLeaf(node, (leaf) => {
		const start = getField(leaf.task, startField);
		if (start && (!minStart || start.getTime() < minStart.getTime())) minStart = start;

		const end = getField(leaf.task, endField);
		if (end && (!maxEnd || end.getTime() > maxEnd.getTime())) maxEnd = end;
	});

	const start = explicitStart ?? minStart;
	const end = explicitEnd ?? maxEnd;

	return {
		start,
		end,
		startDerived: !explicitStart && Boolean(minStart),
		endDerived: !explicitEnd && Boolean(maxEnd),
	};
}
