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
	repeat?: string | null;  // 周期规则，null 表示清除
	createdDate?: Date | null;
	startDate?: Date | null;
	scheduledDate?: Date | null;
	dueDate?: Date | null;
	cancelledDate?: Date | null;
	completionDate?: Date | null;
	content?: string;
	tags?: string[];
	ticktick?: string | null;
	feishuGuid?: string | null;  // 飞书任务 GUID，null 表示清除
	feishuDesc?: string | null;  // 飞书任务描述，null 表示清除
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
		ticktick?: string;  // ticktick 文本
	feishuGuid?: string;  // 飞书任务 GUID
	feishuDesc?: string;  // 飞书任务描述
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

	// 确定描述文本：优先使用更新内容，否则使用原始描述
	// 如果都为空，尝试从原始 content 中提取（移除元数据后的纯文本）
	let finalDescription = updates.content !== undefined ? updates.content : task.description;

	// 如果描述为空，尝试从原始 content 中提取一个备用描述
	// 这是防止字段丢失的关键修复
	if (!finalDescription || finalDescription.trim() === '') {
		if (task.content && task.content.trim() !== '') {
			// 使用原始内容，但移除 Tasks 格式的元数据（emoji 优先级和日期）
			// 这样可以保留任务的核心描述文本
			let fallbackDesc = task.content;
			// 移除优先级 emoji
			fallbackDesc = fallbackDesc.replace(/[🔺⏫🔼🔽⏬]/g, ' ');
			// 移除日期 emoji + 日期值
			fallbackDesc = fallbackDesc.replace(/[➕🛫⏳📅❌✅]\s*\d{4}-\d{2}-\d{2}/g, ' ');
			// 移除 Dataview 字段
			fallbackDesc = fallbackDesc.replace(/\[(priority|created|start|scheduled|due|cancelled|completion)::\s*[^\]]+\]/gi, ' ');
			// 移除 %%content%% ticktick 块
			fallbackDesc = fallbackDesc.replace(/%%.+?%%/g, " ");
			// 移除标签（因为标签会单独处理）
			fallbackDesc = fallbackDesc.replace(/#[\u4e00-\u9fa5a-zA-Z0-9_]+/g, ' ');
			// 清理空格
			finalDescription = fallbackDesc.replace(/\s+/g, ' ').trim();
		}
	}

	const merged: MergedTask = {
		completed: updates.completed !== undefined ? updates.completed : task.completed,
		cancelled: updates.cancelled !== undefined ? updates.cancelled : task.cancelled,
		status: updates.status !== undefined ? updates.status : task.status,
		// 优先级：所有任务都应该有优先级，默认为 'normal'
		priority: updates.priority !== undefined
			? getPriorityEmoji(updates.priority)
			: getPriorityEmoji((task.priority || 'normal') as any),
		description: finalDescription,
		// 保留标签，优先使用更新的标签
		tags: updates.tags !== undefined ? updates.tags : task.tags,
		ticktick: updates.ticktick !== undefined ? (updates.ticktick || undefined) : task.ticktick,
		feishuGuid: updates.feishuGuid !== undefined ? (updates.feishuGuid || undefined) : task.feishuGuid,
		feishuDesc: updates.feishuDesc !== undefined ? (updates.feishuDesc || undefined) : task.feishuDesc,
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

	// 飞书同步字段（放在描述后、元数据前，使用 %% 注释语法隐藏）
	if (merged.feishuGuid) {
		parts.push(`%%[guid:: ${merged.feishuGuid}]%%`);
	}

	// ticktick
	if (merged.ticktick) {
		parts.push("%%" + merged.ticktick + "%%");
	}

	// 优先级（放在描述后）
	if (format === 'tasks') {
		// 只有非 'normal' 的优先级才输出 emoji
		const shouldOutputPriority =
			// 情况1：不更改优先级，且原始任务有优先级（emoji 非空）
			(updates.priority === undefined && merged.priority && merged.priority !== 'none') ||
			// 情况2：明确设置了非 'normal' 的优先级
			(updates.priority !== undefined && updates.priority !== 'normal');

		if (shouldOutputPriority && merged.priority) {
			parts.push(merged.priority);
		}
	}

	// 优先级（Dataview 格式）
	if (format === 'dataview') {
		// 只有非 'normal' 的优先级才输出字段
		const shouldOutputPriority =
			// 情况1：不更改优先级，且原始任务有优先级（不是 'normal'）
			(updates.priority === undefined && task.priority && task.priority !== 'normal') ||
			// 情况2：明确设置了非 'normal' 的优先级
			(updates.priority !== undefined && updates.priority !== 'normal');

		if (shouldOutputPriority) {
			// 使用 updates.priority 或回退到 task.priority
			const priorityValue = updates.priority !== undefined ? updates.priority : task.priority;
			parts.push(`[priority:: ${priorityValue}]`);
		}
	}

	// 周期任务规则（放在优先级后、日期前）
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

		// 只有当 date 是 Date 对象时才输出（null 和 undefined 都不输出）
		if (date instanceof Date) {
			// 根据精度决定输出格式：'time' 输出 YYYY-MM-DD HH:mm，否则仅 YYYY-MM-DD
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
