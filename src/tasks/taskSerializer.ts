import { App } from 'obsidian';
import { GCTask } from '../types';
import { formatDate } from '../dateUtils/dateUtilsIndex';
import { TaskStatusType, getStatusBySymbol, DEFAULT_TASK_STATUSES } from './taskStatus';

/**
 * 任务更新参数
 */
export interface TaskUpdates {
	completed?: boolean;
	cancelled?: boolean;  // 取消状态，使用 [-] 复选框
	status?: TaskStatusType;  // 任务状态类型
	priority?: 'highest' | 'high' | 'medium' | 'low' | 'lowest' | 'normal';
	createdDate?: Date | null;
	startDate?: Date | null;
	scheduledDate?: Date | null;
	dueDate?: Date | null;
	cancelledDate?: Date | null;
	completionDate?: Date | null;
	content?: string;
}

/**
 * 合并后的任务数据
 */
interface MergedTask {
	completed: boolean;
	cancelled?: boolean;  // 取消状态
	status?: TaskStatusType;  // 任务状态类型
	priority?: string;
	description: string;
	tags?: string[];  // 任务标签
	createdDate?: Date;
	startDate?: Date;
	scheduledDate?: Date;
	dueDate?: Date;
	cancelledDate?: Date;
	completionDate?: Date;
}

/**
 * 获取日期字段的 emoji（Tasks 格式）
 */
function getDateEmoji(field: keyof MergedTask): string {
	const map: Record<string, string> = {
		createdDate: '➕',
		startDate: '🛫',
		scheduledDate: '⏳',
		dueDate: '📅',
		cancelledDate: '❌',
		completionDate: '✅',
	};
	return map[field] || '';
}

/**
 * 获取日期字段名（Dataview 格式）
 */
function getDataviewField(field: keyof MergedTask): string {
	const map: Record<string, string> = {
		createdDate: 'created',
		startDate: 'start',
		scheduledDate: 'scheduled',
		dueDate: 'due',
		cancelledDate: 'cancelled',
		completionDate: 'completion',
	};
	return map[field] || '';
}

/**
 * 获取优先级 emoji（Tasks 格式）
 */
function getPriorityEmoji(priority: 'highest' | 'high' | 'medium' | 'low' | 'lowest' | 'normal' | undefined): string {
	const map: Record<string, string> = {
		highest: '🔺',
		high: '⏫',
		medium: '🔼',
		low: '🔽',
		lowest: '⏬',
		normal: '',
	};
	return map[priority || ''] || '';
}

/**
 * 序列化任务为文本行
 *
 * 按照固定顺序构建任务行：
 * Tasks 格式: [复选框] [全局过滤] [标签] [描述] [优先级] [创建] [开始] [计划] [截止] [取消] [完成]
 * Dataview 格式: [复选框] [全局过滤] [标签] [描述] [priority] [created] [start] [scheduled] [due] [cancelled] [completion]
 *
 * @param app Obsidian App 实例（用于访问插件设置）
 * @param task 原始任务对象
 * @param updates 更新参数
 * @param format 格式 ('tasks' | 'dataview')
 * @returns 序列化后的任务行文本
 */
export function serializeTask(
	app: App,
	task: GCTask,
	updates: TaskUpdates,
	format: 'tasks' | 'dataview'
): string {
	// 1. 合并原始数据和更新数据
	// 注意：updates 中的日期字段可能是 null（表示清除），task 中的日期字段是 undefined（表示不存在）
	const merged: MergedTask = {
		completed: updates.completed !== undefined ? updates.completed : task.completed,
		cancelled: updates.cancelled !== undefined ? updates.cancelled : task.cancelled,
		status: updates.status !== undefined ? updates.status : task.status,
		// 修复：统一将 priority 转换为 emoji，避免"不更改"时输出文本值
		priority: updates.priority !== undefined
			? getPriorityEmoji(updates.priority)
			: getPriorityEmoji(task.priority as any),
		description: updates.content !== undefined ? updates.content : task.description,
		// 保留标签
		tags: task.tags,
		// 处理日期字段：undefined 使用原始值，null 转为 undefined（表示清除）
		createdDate: updates.createdDate !== undefined ? (updates.createdDate || undefined) : task.createdDate,
		startDate: updates.startDate !== undefined ? (updates.startDate || undefined) : task.startDate,
		scheduledDate: updates.scheduledDate !== undefined ? (updates.scheduledDate || undefined) : task.scheduledDate,
		dueDate: updates.dueDate !== undefined ? (updates.dueDate || undefined) : task.dueDate,
		cancelledDate: updates.cancelledDate !== undefined ? (updates.cancelledDate || undefined) : task.cancelledDate,
		completionDate: updates.completionDate !== undefined ? (updates.completionDate || undefined) : task.completionDate,
	};

	// 2. 从插件设置中获取全局过滤器（唯一信源）
	const plugin = (app as any).plugins?.plugins['obsidian-gantt-calendar'];
	const globalFilter = plugin?.settings?.globalTaskFilter || '';
	const taskStatuses = plugin?.settings?.taskStatuses || DEFAULT_TASK_STATUSES;

	// 3. 构建任务行的各个部分
	const parts: string[] = [];

	// 复选框：根据 status 确定符号
	// 如果有 status，使用对应的符号；否则使用传统的 completed/cancelled 判断
	let checkboxSymbol = ' '; // 默认待办
	if (merged.status) {
		// 根据状态查找对应的符号
		const statusConfig = taskStatuses.find((s: { key: TaskStatusType; symbol: string }) => s.key === merged.status);
		if (statusConfig) {
			checkboxSymbol = statusConfig.symbol;
		}
	} else {
		// 兼容旧逻辑：取消状态是 [-] 不是 [/]
		if (merged.cancelled) {
			checkboxSymbol = '-';
		} else if (merged.completed) {
			checkboxSymbol = 'x';
		}
	}
	parts.push(`[${checkboxSymbol}]`);

	// 全局过滤器（从插件设置中获取）
	if (globalFilter) {
		parts.push(globalFilter);
	}

	// 标签（复选框之后，任务描述之前）
	if (merged.tags && merged.tags.length > 0) {
		const tagsStr = merged.tags.map(tag => `#${tag}`).join(' ');
		parts.push(tagsStr);
	}

	// 任务描述
	if (merged.description) {
		parts.push(merged.description);
	}

	// 优先级（放在描述后）
	if (format === 'tasks') {
		const shouldOutputPriority =
			// 情况1：不更改优先级，且原始任务有优先级（emoji 非空）
			(updates.priority === undefined && merged.priority && merged.priority !== 'none' && merged.priority !== 'normal') ||
			// 情况2：明确设置了非 'normal' 的优先级
			(updates.priority !== undefined && updates.priority !== 'normal' && merged.priority);

		if (shouldOutputPriority && merged.priority) {
			parts.push(merged.priority);
		}
	}

	// 优先级（Dataview 格式）
	if (format === 'dataview') {
		const shouldOutputPriority =
			// 情况1：不更改优先级，且原始任务有优先级
			(updates.priority === undefined && task.priority && task.priority !== 'normal') ||
			// 情况2：明确设置了非 'normal' 的优先级
			(updates.priority !== undefined && updates.priority !== 'normal');

		if (shouldOutputPriority && updates.priority) {
			parts.push(`[priority:: ${updates.priority}]`);
		}
	}

	// 日期字段（固定顺序）
	const dateOrder: Array<keyof MergedTask> = [
		'createdDate',
		'startDate',
		'scheduledDate',
		'dueDate',
		'cancelledDate',
		'completionDate'
	];

	for (const field of dateOrder) {
		const date = merged[field];

		// 只有当 date 是 Date 对象时才输出（null 和 undefined 都不输出）
		if (date instanceof Date) {
			const dateStr = formatDate(date, 'yyyy-MM-dd');
			if (format === 'tasks') {
				parts.push(`${getDateEmoji(field)} ${dateStr}`);
			} else {
				parts.push(`[${getDataviewField(field)}:: ${dateStr}]`);
			}
		}
	}

	return parts.join(' ');
}
