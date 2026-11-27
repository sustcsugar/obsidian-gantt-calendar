/**
 * 甘特图行序：把「父任务 + 其子任务」作为一个整块参与现有排序。
 *
 * 输入是已经按用户排序规则排好的任务数组，输出是重排后的行序：
 *   - 顶层任务保持原排序位置
 *   - 每个顶层的子树紧跟在它下面（DFS，同一父下按原排序）
 *   - 父任务被筛选掉 / 不可渲染时，子任务提升为顶层（不消失）
 *   - 折叠的父任务不展开子行（子行完全不进结果数组，不是 display:none）
 */

import type { GCTask } from '../../types';
import {
	getHierarchyNode,
	getTaskKey,
	type TaskHierarchyIndex,
} from '../../tasks/hierarchy/taskHierarchy';

export interface HierarchyRow {
	task: GCTask;
	/** 显示层级，0 = 顶层（父被筛掉时子任务从 0 重新计） */
	level: number;
	/** 父任务在本帧的定位键；顶层为 null */
	parentKey: string | null;
	hasChildren: boolean;
	collapsed: boolean;
}

export interface OrderOptions {
	/** 已折叠的父任务 tid 集合 */
	collapsedTids?: ReadonlySet<string>;
}

/**
 * 重排行序。
 *
 * @param sorted 已排序的任务（保持其相对顺序）
 * @param index 层级索引（由全量任务构建）
 */
export function orderTasksWithHierarchy(
	sorted: readonly GCTask[],
	index: TaskHierarchyIndex,
	opts: OrderOptions = {}
): HierarchyRow[] {
	const collapsed = opts.collapsedTids ?? new Set<string>();

	// 本帧真正会渲染的任务（父不在其中 = 被筛选/不可渲染）
	const visibleKeys = new Set<string>();
	for (const task of sorted) visibleKeys.add(getTaskKey(task));

	// 父键 → 子任务（按 sorted 顺序）
	const childrenByParent = new Map<string, GCTask[]>();
	for (const task of sorted) {
		const node = getHierarchyNode(index, task);
		if (!node?.parentTid) continue;
		const parent = index.byTid.get(node.parentTid);
		if (!parent) continue;
		const parentKey = parent.key;
		if (!visibleKeys.has(parentKey)) continue; // 父不可见 → 该子任务是顶层
		const list = childrenByParent.get(parentKey);
		if (list) list.push(task);
		else childrenByParent.set(parentKey, [task]);
	}

	const rows: HierarchyRow[] = [];
	// 按任务对象去重（重复任务的虚拟实例与原任务共享 filePath:lineNumber）
	const visited = new Set<GCTask>();

	const emit = (task: GCTask, level: number, parentKey: string | null): void => {
		const key = getTaskKey(task);
		if (visited.has(task)) return;
		visited.add(task);

		const node = getHierarchyNode(index, task);
		const children = childrenByParent.get(key) ?? [];
		const tid = node?.tid;
		const isCollapsed = Boolean(tid && collapsed.has(tid) && children.length > 0);

		rows.push({
			task,
			level,
			parentKey,
			hasChildren: children.length > 0,
			collapsed: isCollapsed,
		});

		if (isCollapsed) return;
		for (const child of children) emit(child, level + 1, key);
	};

	for (const task of sorted) {
		if (visited.has(task)) continue;

		const node = getHierarchyNode(index, task);
		const parent = node?.parentTid ? index.byTid.get(node.parentTid) : undefined;
		const parentVisible = Boolean(parent && visibleKeys.has(parent.key));

		// 只有「父渲染在同一帧」的子任务不在此处开始；其余都是本帧顶层
		if (parentVisible) continue;
		emit(task, 0, null);
	}

	// 兜底：环里的节点互相「父可见」，主循环一个都不会开始——按原排序补成顶层，
	// 保证不丢行；emit 内部用 visited 防环。
	// 只补 cyclic 节点：折叠未展开的子行同样「未访问」，但必须保持隐藏。
	for (const task of sorted) {
		if (visited.has(task)) continue;
		const node = getHierarchyNode(index, task);
		if (!node?.cyclic) continue;
		emit(task, 0, null);
	}

	return rows;
}
