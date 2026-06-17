import { App } from 'obsidian';
import { GCTask, MetadataField } from '../types';
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
	repeat?: string | null;  // 周期规则，null 表示清除
	createdDate?: Date | null;
	startDate?: Date | null;
	scheduledDate?: Date | null;
	dueDate?: Date | null;
	cancelledDate?: Date | null;
	completionDate?: Date | null;
	content?: string;
	tags?: string[];
	metadataFields?: MetadataField[] | null;
	feishuGuid?: string | null;  // 飞书任务 GUID（同步系统直接写入时使用）
	datePrecision?: {
		dueDate?: 'day' | 'time';
		startDate?: 'day' | 'time';
	};
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
	metadataFields?: MetadataField[];  // 统一内联元数据字段列表
	feishuGuid?: string;  // 飞书任务 GUID（fallback 用）
	createdDate?: Date;
	startDate?: Date;
	scheduledDate?: Date;
	dueDate?: Date;
	cancelledDate?: Date;
	completionDate?: Date;
	datePrecision?: {
		dueDate?: 'day' | 'time';
		startDate?: 'day' | 'time';
	};
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
 * 检查 metadataFields 中是否已包含某个 key
 */
function metadataContainsKey(fields: MetadataField[] | undefined, key: string): boolean {
	if (!fields) return false;
	return fields.some(f => f.key === key);
}

/**
 * 序列化任务为文本行
 *
 * 按照固定顺序构建任务行：
 * Tasks 格式: [复选框] [全局过滤] [标签] [描述] [元数据字段] [优先级] [创建] [开始] [计划] [截止] [取消] [完成]
 * Dataview 格式: [复选框] [全局过滤] [标签] [描述] [元数据字段] [priority] [created] [start] [scheduled] [due] [cancelled] [completion]
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

	// 确定描述文本：优先使用更新内容，否则使用原始描述
	// 如果都为空，尝试从原始 content 中提取（移除元数据后的纯文本）
	let finalDescription = updates.content !== undefined ? updates.content : task.description;

	// 如果描述为空，尝试从原始 content 中提取一个备用描述
	// 这是防止字段丢失的关键修复
	if (!finalDescription || finalDescription.trim() === '') {
		if (task.content && task.content.trim() !== '') {
			let fallbackDesc = task.content;
			fallbackDesc = fallbackDesc.replace(/[🔺⏫🔼🔽⏬]/gu, ' ');
			fallbackDesc = fallbackDesc.replace(/[➕🛫⏳📅❌✅]\s*\d{4}-\d{2}-\d{2}/gu, ' ');
			fallbackDesc = fallbackDesc.replace(/\[(priority|created|start|scheduled|due|cancelled|completion)::\s*[^\]]+\]/gi, ' ');
			fallbackDesc = fallbackDesc.replace(/%%.+?%%/g, " ");
			fallbackDesc = fallbackDesc.replace(/#[一-龥a-zA-Z0-9_]+/g, ' ');
			finalDescription = fallbackDesc.replace(/\s+/g, ' ').trim();
		}
	}

	const merged: MergedTask = {
		completed: updates.completed !== undefined ? updates.completed : task.completed,
		cancelled: updates.cancelled !== undefined ? updates.cancelled : task.cancelled,
		status: updates.status !== undefined ? updates.status : task.status,
		priority: updates.priority !== undefined
			? getPriorityEmoji(updates.priority)
			: getPriorityEmoji((task.priority || 'normal') as any),
		description: finalDescription,
		tags: updates.tags !== undefined ? updates.tags : task.tags,
		metadataFields: updates.metadataFields !== undefined ? (updates.metadataFields || undefined) : task.metadataFields,
		feishuGuid: updates.feishuGuid !== undefined ? (updates.feishuGuid || undefined) : task.feishuGuid,
		// 处理日期字段：undefined 使用原始值，null 转为 undefined（表示清除）
		createdDate: updates.createdDate !== undefined ? (updates.createdDate || undefined) : task.createdDate,
		startDate: updates.startDate !== undefined ? (updates.startDate || undefined) : task.startDate,
		scheduledDate: updates.scheduledDate !== undefined ? (updates.scheduledDate || undefined) : task.scheduledDate,
		dueDate: updates.dueDate !== undefined ? (updates.dueDate || undefined) : task.dueDate,
		cancelledDate: updates.cancelledDate !== undefined ? (updates.cancelledDate || undefined) : task.cancelledDate,
		completionDate: updates.completionDate !== undefined ? (updates.completionDate || undefined) : task.completionDate,
		datePrecision: updates.datePrecision !== undefined ? updates.datePrecision : task.datePrecision,
	};

	// 2. 从插件设置中获取全局过滤器和任务状态配置（官方 API）
	const ganttPlugin = (app as any).plugins?.getPlugin?.('gantt-calendar');
	const globalFilter = ganttPlugin?.settings?.globalTaskFilter || '';
	const taskStatuses = ganttPlugin?.settings?.taskStatuses || DEFAULT_TASK_STATUSES;

	// 3. 构建任务行的各个部分
	const parts: string[] = [];

	// 复选框
	let checkboxSymbol = ' ';
	if (merged.status) {
		const statusConfig = taskStatuses.find((s: { key: TaskStatusType; symbol: string }) => s.key === merged.status);
		if (statusConfig) {
			checkboxSymbol = statusConfig.symbol;
		}
	} else {
		if (merged.cancelled) {
			checkboxSymbol = '-';
		} else if (merged.completed) {
			checkboxSymbol = 'x';
		}
	}
	parts.push(`[${checkboxSymbol}]`);

	// 全局过滤器
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

	// 统一的内联元数据字段 %%[key::value]%%
	if (merged.metadataFields && merged.metadataFields.length > 0) {
		for (const field of merged.metadataFields) {
			parts.push(`%%[${field.key}:: ${field.value}]%%`);
		}
	} else if (merged.feishuGuid) {
		// Fallback：同步系统直接写入 feishuGuid 但 metadataFields 未更新时
		parts.push(`%%[guid:: ${merged.feishuGuid}]%%`);
	}

	// 优先级（放在描述后）
	if (format === 'tasks') {
		const shouldOutputPriority =
			(updates.priority === undefined && merged.priority && merged.priority !== 'none') ||
			(updates.priority !== undefined && updates.priority !== 'normal');

		if (shouldOutputPriority && merged.priority) {
			parts.push(merged.priority);
		}
	}

	// 优先级（Dataview 格式）
	if (format === 'dataview') {
		const shouldOutputPriority =
			(updates.priority === undefined && task.priority && task.priority !== 'normal') ||
			(updates.priority !== undefined && updates.priority !== 'normal');

		if (shouldOutputPriority) {
			const priorityValue = updates.priority !== undefined ? updates.priority : task.priority;
			parts.push(`[priority:: ${priorityValue}]`);
		}
	}

	// 周期任务规则
	const repeatValue = updates.repeat !== undefined
		? (updates.repeat || undefined)
		: task.repeat;

	if (repeatValue) {
		if (format === 'tasks') {
			parts.push(`🔁 ${repeatValue}`);
		} else {
			parts.push(`[repeat:: ${repeatValue}]`);
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

		if (date instanceof Date) {
			const precision = merged.datePrecision?.[field as keyof NonNullable<typeof merged.datePrecision>];
			const formatStr = precision === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd';
			const dateStr = formatDate(date, formatStr);
			if (format === 'tasks') {
				parts.push(`${getDateEmoji(field)} ${dateStr}`);
			} else {
				parts.push(`[${getDataviewField(field)}:: ${dateStr}]`);
			}
		}
	}

	return parts.join(' ');
}
