/**
 * 任务父子关系的写入器。
 *
 * 磁盘上只存单向的 `parent`：
 *   - 子任务行写入 %%[parent:: <父任务 tid>]%%
 *   - 父任务行在第一次被引用时才写入 %%[tid:: xxxxxxxx]%%（懒写入）
 *
 * 子任务列表不落盘，由 taskHierarchy.buildTaskHierarchy 反查得到。
 */

import { App, Notice } from 'obsidian';
import type { GCTask } from '../types';
import { i18n } from '../i18n/i18n';
import { Logger } from '../utils/logger';
import { updateTaskProperties } from './taskUpdater';
import {
	HIERARCHY_METADATA_KEYS,
	generateTid,
	getMetadataValue,
	removeMetadataField,
	setMetadataField,
} from './taskMetadata';

export type HierarchyErrorCode = 'self' | 'cycle' | 'repeat-parent' | 'ineligible' | 'parent-missing' | 'write-failed';

const ERROR_I18N_KEYS: Record<HierarchyErrorCode, string> = {
	self: 'taskHierarchy.selfRejected',
	cycle: 'taskHierarchy.cycleRejected',
	'repeat-parent': 'taskHierarchy.repeatParentRejected',
	ineligible: 'taskHierarchy.ineligible',
	'parent-missing': 'taskHierarchy.parentMissing',
	'write-failed': 'taskHierarchy.writeFailed',
};

export class HierarchyWriteError extends Error {
	constructor(public readonly code: HierarchyErrorCode, detail?: string) {
		super(detail ?? code);
		this.name = 'HierarchyWriteError';
	}
}

/** 错误 → 可展示文案 */
export function hierarchyErrorMessage(error: unknown): string {
	if (error instanceof HierarchyWriteError) {
		return i18n.t(ERROR_I18N_KEYS[error.code]);
	}
	return i18n.t(ERROR_I18N_KEYS['write-failed']);
}

/** 弹一条 Notice 并记日志；不向上抛，避免打断 UI 交互 */
export function notifyHierarchyError(error: unknown): void {
	new Notice(hierarchyErrorMessage(error));
	if (error instanceof HierarchyWriteError) {
		Logger.warn('taskHierarchyUpdater', `Hierarchy write rejected: ${error.code}`, error.message);
	} else {
		Logger.error('taskHierarchyUpdater', 'Hierarchy write failed:', error);
	}
}

export interface HierarchyWriteResult {
	/** 父任务的 tid（懒写入后的最终值） */
	tid?: string;
	/** 是否真的改动了文件 */
	changed: boolean;
	/** 写入后的元数据数组（供撤销注册使用） */
	metadataFields?: import('../types').MetadataField[];
}

/** 远程任务 / 无行号任务无法写回，不参与父子关系 */
export function isHierarchyEligible(task: GCTask): boolean {
	return Boolean(task.filePath) && task.lineNumber > 0;
}

/** 同一任务判定：路径 + 行号（当前身份口径） */
export function isSameTask(a: GCTask, b: GCTask): boolean {
	return a.filePath === b.filePath && a.lineNumber === b.lineNumber;
}

/**
 * 解析任务 tid：优先用解析期派生值，缺失时回落到 metadataFields。
 * （调用方传入的任务对象可能来自尚未刷新的缓存。）
 */
export function resolveTaskTid(task: GCTask): string | undefined {
	return task.tid || getMetadataValue(task.metadataFields, HIERARCHY_METADATA_KEYS.tid);
}

/** 解析任务 parentTid：同样做一次回落 */
export function resolveTaskParentTid(task: GCTask): string | undefined {
	return task.parentTid || getMetadataValue(task.metadataFields, HIERARCHY_METADATA_KEYS.parent);
}

/** 收集已有 tid，供生成新 tid 时做冲突检测 */
export function collectKnownTids(tasks: readonly GCTask[]): Set<string> {
	const tids = new Set<string>();
	for (const task of tasks) {
		const tid = resolveTaskTid(task);
		if (tid) tids.add(tid);
	}
	return tids;
}

/**
 * 确保任务拥有 tid：已有则原样返回（尊重用户手写的值），否则生成并写回。
 *
 * 注意：写回后不会修改传入的 task 对象（数据层缓存中的对象是共享的），
 * 调用方应通过刷新拿回最新值。
 */
export async function ensureTaskTid(
	app: App,
	task: GCTask,
	formats: string[],
	knownTids: ReadonlySet<string> = new Set()
): Promise<string> {
	const existing = getMetadataValue(task.metadataFields, HIERARCHY_METADATA_KEYS.tid);
	if (existing) return existing;

	const tid = generateTid(knownTids);
	const next = setMetadataField(task.metadataFields, HIERARCHY_METADATA_KEYS.tid, tid);
	try {
		await updateTaskProperties(app, task, { metadataFields: next }, formats);
	} catch (error) {
		throw new HierarchyWriteError('write-failed', (error as Error)?.message);
	}
	return tid;
}

/**
 * 判断「把 childTid 挂到 parentTid 下」是否成环。
 *
 * 边方向为 child → parent，因此只要从 parentTid 一路上溯能遇到 childTid 即成环。
 */
export function wouldCreateCycle(
	allTasks: readonly GCTask[],
	childTid: string | undefined,
	parentTid: string
): boolean {
	if (!childTid) return false;

	const parentOf = new Map<string, string>();
	for (const task of allTasks) {
		const tid = resolveTaskTid(task);
		const parentTid = resolveTaskParentTid(task);
		if (tid && parentTid) parentOf.set(tid, parentTid);
	}

	if (childTid === parentTid) return true;

	let cursor: string | undefined = parentTid;
	const seen = new Set<string>();
	while (cursor && !seen.has(cursor)) {
		if (cursor === childTid) return true;
		seen.add(cursor);
		cursor = parentOf.get(cursor);
	}
	return false;
}

/**
 * 建立/更换父子关系。
 *
 * 顺序：校验 → 懒写父 tid → 环检测 → 写子 parent。
 * 任何一步失败都不留下半成品关系（父 tid 若已写入，属于无害的惰性身份，可复用）。
 */
export async function assignParent(
	app: App,
	child: GCTask,
	parent: GCTask,
	allTasks: readonly GCTask[],
	formats: string[]
): Promise<HierarchyWriteResult> {
	if (isSameTask(child, parent)) {
		throw new HierarchyWriteError('self');
	}
	if (parent.repeat) {
		throw new HierarchyWriteError('repeat-parent');
	}
	if (!isHierarchyEligible(child) || !isHierarchyEligible(parent)) {
		throw new HierarchyWriteError('ineligible');
	}

	const parentTid = await ensureTaskTid(app, parent, formats, collectKnownTids(allTasks));

	if (wouldCreateCycle(allTasks, resolveTaskTid(child), parentTid)) {
		throw new HierarchyWriteError('cycle');
	}

	if (getMetadataValue(child.metadataFields, HIERARCHY_METADATA_KEYS.parent) === parentTid) {
		return { tid: parentTid, changed: false };
	}

	const next = setMetadataField(child.metadataFields, HIERARCHY_METADATA_KEYS.parent, parentTid);
	try {
		await updateTaskProperties(app, child, { metadataFields: next }, formats);
	} catch (error) {
		throw new HierarchyWriteError('write-failed', (error as Error)?.message);
	}
	return { tid: parentTid, changed: true, metadataFields: next };
}

/**
 * 解除父子关系：只删除 parent 字段，保留 tid（tid 是稳定身份，删除会导致其它引用断链）。
 */
export async function clearParent(
	app: App,
	child: GCTask,
	formats: string[]
): Promise<HierarchyWriteResult> {
	const current = getMetadataValue(child.metadataFields, HIERARCHY_METADATA_KEYS.parent);
	if (!current) return { changed: false };

	const next = removeMetadataField(child.metadataFields, HIERARCHY_METADATA_KEYS.parent);
	try {
		await updateTaskProperties(app, child, { metadataFields: next }, formats);
	} catch (error) {
		throw new HierarchyWriteError('write-failed', (error as Error)?.message);
	}
	return { changed: true, metadataFields: next };
}

/**
 * 按 tid 设置/清除父任务（表单与命令的统一入口）。
 *
 * @param parentTid null 表示解除关系
 */
export async function setParentByTid(
	app: App,
	child: GCTask,
	parentTid: string | null,
	allTasks: readonly GCTask[],
	formats: string[]
): Promise<HierarchyWriteResult> {
	const current = resolveTaskParentTid(child) ?? null;
	if (current === parentTid) {
		return { tid: parentTid ?? undefined, changed: false };
	}
	if (!parentTid) {
		return clearParent(app, child, formats);
	}

	const parent = allTasks.find((task) => resolveTaskTid(task) === parentTid);
	if (!parent) {
		throw new HierarchyWriteError('parent-missing', parentTid);
	}
	return assignParent(app, child, parent, allTasks, formats);
}
