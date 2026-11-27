/**
 * 任务父子关系的派生索引（纯函数）。
 *
 * 磁盘上只存子任务的 `parent` 字段，本模块从全量任务反推：
 *   - 每个任务的父子节点（children / parent）
 *   - 层级深度
 *   - 断链（父不存在）、环（手工编辑造成）、重复 tid、重复任务当父 等非法数据
 *
 * 约定：
 * - 不修改传入的 GCTask 对象，也不在任务对象上挂任何字段
 *   （TaskStore.getAllTasks 返回缓存数组本体，原地改会污染缓存）。
 * - 非法数据只标记、不修复；UI 负责降级展示。
 */

import type { GCTask } from '../../types';
import { HIERARCHY_METADATA_KEYS, getMetadataValue } from '../taskMetadata';

export interface HierarchyNode {
	task: GCTask;
	/** 稳定身份；重复 tid 的后来者会被置空 */
	tid: string | null;
	parentTid: string | null;
	/** 定位键：`${filePath}:${lineNumber}` */
	key: string;
	depth: number;
	children: HierarchyNode[];
	hasChildren: boolean;
	/** 父 tid 在索引里找不到（父被删除 / tid 被改） */
	orphan: boolean;
	/** 自身处在环里（非法数据），已作为根节点断开 */
	cyclic: boolean;
	/** 父任务是重复任务（不允许当父） */
	invalidParent: boolean;
	/** tid 与其它任务重复，后来者失去可寻址性 */
	duplicateTid: boolean;
}

export interface TaskHierarchyIndex {
	byTid: Map<string, HierarchyNode>;
	byKey: Map<string, HierarchyNode>;
	/** tid → 直接子节点（断链/环的节点不在任何父的列表里） */
	childrenOfTid: Map<string, HierarchyNode[]>;
	roots: HierarchyNode[];
	/** 断链 + 环 + 重复 tid + 重复任务当父 的总数，供日志/调试 */
	invalid: number;
}

/** 任务定位键（与数据层身份口径一致） */
export function getTaskKey(task: GCTask): string {
	return `${task.filePath}:${task.lineNumber}`;
}

/** 远程任务（lineNumber = 0）与空路径任务没有可写回的行，不参与层级 */
function isEligible(task: GCTask): boolean {
	return Boolean(task.filePath) && task.lineNumber > 0;
}

function resolveTid(task: GCTask): string | null {
	const raw = task.tid || getMetadataValue(task.metadataFields, HIERARCHY_METADATA_KEYS.tid);
	return raw || null;
}

function resolveParentTid(task: GCTask): string | null {
	const raw = task.parentTid || getMetadataValue(task.metadataFields, HIERARCHY_METADATA_KEYS.parent);
	return raw || null;
}

/**
 * 构建层级索引。O(n)。
 *
 * 非法数据处理：
 * - 父不存在 → orphan，作为根节点
 * - 父是重复任务 → invalidParent，作为根节点
 * - 自己指向自己 / 环 → cyclic，断成根节点，不抛错、不死循环
 */
export function buildTaskHierarchy(tasks: readonly GCTask[]): TaskHierarchyIndex {
	const byTid = new Map<string, HierarchyNode>();
	const byKey = new Map<string, HierarchyNode>();
	const childrenOfTid = new Map<string, HierarchyNode[]>();
	const roots: HierarchyNode[] = [];
	let invalid = 0;

	const nodes: HierarchyNode[] = [];

	// 第一遍：建节点、登记 tid
	for (const task of tasks) {
		if (!isEligible(task)) continue;
		const key = getTaskKey(task);
		if (byKey.has(key)) continue;

		const tid = resolveTid(task);
		const node: HierarchyNode = {
			task,
			tid,
			parentTid: resolveParentTid(task),
			key,
			depth: 0,
			children: [],
			hasChildren: false,
			orphan: false,
			cyclic: false,
			invalidParent: false,
			duplicateTid: false,
		};
		byKey.set(key, node);
		nodes.push(node);

		if (tid) {
			const existing = byTid.get(tid);
			if (existing) {
				node.duplicateTid = true;
				node.tid = null;
				invalid += 1;
			} else {
				byTid.set(tid, node);
			}
		}
	}

	// 第二遍：连边（自指与父缺失在此处理）
	for (const node of nodes) {
		if (!node.parentTid) continue;

		if (node.parentTid === node.tid) {
			node.cyclic = true;
			invalid += 1;
			continue;
		}

		const parent = byTid.get(node.parentTid);
		if (!parent) {
			node.orphan = true;
			invalid += 1;
			continue;
		}
		if (parent.task.repeat) {
			node.invalidParent = true;
			invalid += 1;
			continue;
		}

		parent.children.push(node);
	}

	// 子节点顺序保持输入序（调用方通常已排序）
	for (const node of nodes) {
		node.hasChildren = node.children.length > 0;
		if (node.tid) childrenOfTid.set(node.tid, node.children);
	}

	const visited = new Set<HierarchyNode>();

	const walk = (start: HierarchyNode): void => {
		const stack: Array<{ node: HierarchyNode; depth: number }> = [{ node: start, depth: 0 }];
		while (stack.length > 0) {
			const item = stack.pop() as { node: HierarchyNode; depth: number };
			if (visited.has(item.node)) continue;
			visited.add(item.node);
			item.node.depth = item.depth;
			for (const child of item.node.children) {
				if (!visited.has(child)) stack.push({ node: child, depth: item.depth + 1 });
			}
		}
	};

	// 顶层：无父 / 断链 / 重复父 / 重复 tid / 自指
	for (const node of nodes) {
		if (visited.has(node)) continue;
		const isRoot = !node.parentTid || node.orphan || node.invalidParent || node.duplicateTid || node.cyclic;
		if (!isRoot) continue;
		roots.push(node);
		walk(node);
	}

	// 剩余未访问的节点一定处在环里（环没有根，DFS 到不了）：
	// 取一个代表断成根，继续遍历，避免死循环。
	for (const node of nodes) {
		if (visited.has(node)) continue;
		node.cyclic = true;
		invalid += 1;
		const parent = node.parentTid ? byTid.get(node.parentTid) : undefined;
		if (parent) {
			parent.children = parent.children.filter((child) => child !== node);
			parent.hasChildren = parent.children.length > 0;
			if (parent.tid) childrenOfTid.set(parent.tid, parent.children);
		}
		roots.push(node);
		walk(node);
	}

	return { byTid, byKey, childrenOfTid, roots, invalid };
}

/** 按任务取节点 */
export function getHierarchyNode(index: TaskHierarchyIndex | null | undefined, task: GCTask): HierarchyNode | undefined {
	if (!index) return undefined;
	return index.byKey.get(getTaskKey(task));
}

/** 取父节点（断链时返回 undefined） */
export function getParentNode(index: TaskHierarchyIndex | null | undefined, task: GCTask): HierarchyNode | undefined {
	const node = getHierarchyNode(index, task);
	if (!node?.parentTid) return undefined;
	return index?.byTid.get(node.parentTid);
}

/** 取直接子节点 */
export function getChildNodes(index: TaskHierarchyIndex | null | undefined, task: GCTask): HierarchyNode[] {
	const node = getHierarchyNode(index, task);
	if (!node) return [];
	return node.children;
}

/** 祖先链（自身 → 根），用于防环与面包屑 */
export function getAncestorChain(index: TaskHierarchyIndex, node: HierarchyNode): HierarchyNode[] {
	const chain: HierarchyNode[] = [];
	const seen = new Set<HierarchyNode>();
	let cursor: HierarchyNode | undefined = node;
	while (cursor && !seen.has(cursor)) {
		seen.add(cursor);
		chain.push(cursor);
		cursor = cursor.parentTid ? index.byTid.get(cursor.parentTid) : undefined;
	}
	return chain;
}
