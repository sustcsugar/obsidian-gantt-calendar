/**
 * 任务悬浮卡片内容构建（框架无关纯函数）
 *
 * React TooltipProvider 与命令式 TooltipManager 共用，
 * 保证两端分组顺序与字段永不漂移：
 * 时间 → 父/子任务 → 优先级 → 标签 → 元数据 → 文件位置。
 */

import type { GCTask } from '../../types';
import { formatDate } from '../../dateUtils/dateUtilsIndex';
import { i18n } from '../../i18n/i18n';
import { TooltipClasses } from '../../utils/bem';
import { visibleMetadataFields } from '../../tasks/taskMetadata';
import {
	getHierarchyNode,
	type TaskHierarchyIndex,
} from '../../tasks/hierarchy/taskHierarchy';
import { computeNodeStats } from '../../tasks/hierarchy/aggregate';

export interface TooltipPropRow {
	label: string;
	value: string;
	valueClass?: string;
	isOverdue?: boolean;
}

export interface TooltipSection {
	key: string;
	rows: TooltipPropRow[];
}

/**
 * 父子关系上下文。
 *
 * 缺省时不渲染父/子区块——保证「没有层级数据的任务」提示面板与改造前完全一致。
 */
export interface TooltipHierarchyContext {
	index: TaskHierarchyIndex;
	/** 当前视图是否可见（用于标注「父任务已被筛选隐藏」）；不提供则不标注 */
	isVisible?: (task: GCTask) => boolean;
	/** 子任务最多展示条数，默认 6；超出折叠为「还有 N 个」 */
	maxChildren?: number;
}

/** 优先级 emoji 映射（两端共用） */
const PRIORITY_ICONS: Record<string, string> = {
	highest: '🔺',
	high: '⏫',
	medium: '🔼',
	low: '🔽',
	lowest: '⏬',
};

const DEFAULT_MAX_CHILDREN = 6;

const DONE_MARK = '✓';
const PENDING_MARK = '○';

/** 父任务区块：一行；断链时标红提示，被筛选隐藏时追加标注 */
function buildParentSection(task: GCTask, hierarchy: TooltipHierarchyContext): TooltipSection | null {
	const node = getHierarchyNode(hierarchy.index, task);
	const parentTid = node?.parentTid ?? task.parentTid;
	if (!parentTid) return null;

	const label = i18n.t('taskCard.parentTask');
	const parent = hierarchy.index.byTid.get(parentTid);

	if (!parent) {
		return {
			key: 'parent',
			rows: [{
				label,
				value: i18n.t('taskCard.parentMissing'),
				valueClass: TooltipClasses.modifiers.propertyValueMissing,
			}],
		};
	}

	const done = parent.task.completed && !parent.task.cancelled;
	let value = `${done ? DONE_MARK : PENDING_MARK} ${parent.task.description}`;
	if (hierarchy.isVisible && !hierarchy.isVisible(parent.task)) {
		value += ` (${i18n.t('taskCard.parentHidden')})`;
	}

	return {
		key: 'parent',
		rows: [{
			label,
			value,
			valueClass: done ? TooltipClasses.modifiers.propertyValueChildDone : undefined,
		}],
	};
}

/** 子任务区块：汇总行 + 逐条子任务；超过上限折叠 */
function buildChildrenSection(task: GCTask, hierarchy: TooltipHierarchyContext): TooltipSection | null {
	const node = getHierarchyNode(hierarchy.index, task);
	if (!node || !node.hasChildren) return null;

	const stats = computeNodeStats(node);
	const max = hierarchy.maxChildren ?? DEFAULT_MAX_CHILDREN;
	const rows: TooltipPropRow[] = [{
		label: i18n.t('taskCard.childTasks'),
		value: i18n.t('taskCard.childProgress', {
			done: stats.leafDone,
			total: stats.leafTotal,
			percent: stats.progress,
		}),
	}];

	for (const child of node.children.slice(0, max)) {
		const done = child.task.completed && !child.task.cancelled;
		rows.push({
			label: done ? DONE_MARK : PENDING_MARK,
			value: child.task.description,
			valueClass: done ? TooltipClasses.modifiers.propertyValueChildDone : undefined,
		});
	}

	if (node.children.length > max) {
		rows.push({
			label: '…',
			value: i18n.t('taskCard.moreChildren', { count: node.children.length - max }),
		});
	}

	return { key: 'children', rows };
}

export function buildTooltipSections(task: GCTask, hierarchy?: TooltipHierarchyContext): TooltipSection[] {
	const sections: TooltipSection[] = [];

	const timeRows: TooltipPropRow[] = [];
	const pushTime = (date: Date | undefined, label: string, precision?: 'day' | 'time') => {
		if (!date) return;
		timeRows.push({ label, value: formatDate(date, precision === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd') });
	};
	pushTime(task.createdDate, i18n.t('taskCard.created'), task.datePrecision?.createdDate);
	pushTime(task.startDate, i18n.t('taskCard.start'), task.datePrecision?.startDate);
	pushTime(task.scheduledDate, i18n.t('taskCard.scheduled'), task.datePrecision?.scheduledDate);
	if (task.dueDate) {
		timeRows.push({
			label: i18n.t('taskCard.due'),
			value: formatDate(task.dueDate, task.datePrecision?.dueDate === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd'),
			isOverdue: task.dueDate < new Date() && !task.completed,
		});
	}
	pushTime(task.cancelledDate, i18n.t('taskCard.cancelled'), task.datePrecision?.cancelledDate);
	pushTime(task.completionDate, i18n.t('taskCard.done'), task.datePrecision?.completionDate);
	if (task.repeat) timeRows.push({ label: i18n.t('taskCard.repeat'), value: task.repeat });
	if (timeRows.length > 0) sections.push({ key: 'time', rows: timeRows });

	if (hierarchy) {
		const parentSection = buildParentSection(task, hierarchy);
		if (parentSection) sections.push(parentSection);

		const childrenSection = buildChildrenSection(task, hierarchy);
		if (childrenSection) sections.push(childrenSection);
	}

	if (task.priority && task.priority !== 'normal') {
		sections.push({
			key: 'priority',
			rows: [{
				label: i18n.t('taskCard.priority'),
				value: `${PRIORITY_ICONS[task.priority] || ''} ${i18n.t(`common.priority.${task.priority}`)}`,
				valueClass: `priority-${task.priority}`,
			}],
		});
	}

	if (task.tags && task.tags.length > 0) sections.push({ key: 'tags', rows: [] });

	// tid / parent 是层级内部字段，不作为普通元数据展示
	const metadata = visibleMetadataFields(task.metadataFields);
	if (metadata.length > 0) {
		sections.push({
			key: 'metadata',
			rows: metadata.map((f) => ({ label: f.key, value: f.value || i18n.t('taskCard.emptyValue') })),
		});
	}

	sections.push({
		key: 'file',
		rows: [{ label: i18n.t('taskCard.fileLocation'), value: `${task.fileName}:${task.lineNumber}` }],
	});

	return sections;
}
