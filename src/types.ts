// 日历视图类型定义
import { TaskStatusType } from './tasks/taskStatus';
import type { DailyNoteIndex } from './utils/dailyNoteSettingsBridge';

/**
 * 内联元数据字段
 *
 * 表示单个 key-value 元数据对，解析自 %%[key::value]%% 语法。
 * 以数组形式存储以保留顺序并支持重复键。
 */
export interface MetadataField {
	key: string;
	value: string;
}

export type CalendarViewType = 'year' | 'month' | 'week' | 'day' | 'task' | 'gantt';

// 甘特图时间颗粒度类型（仅支持周视图）
export type GanttTimeGranularity = 'week';

export interface CalendarDate {
	year: number;           // 年份（如：2025）
	month: number;          // 月份（1-12）
	day: number;            // 日（1-31）
	date: Date;             // JavaScript Date 对象
}

/**
 * 日历日期详细信息
 *
 * 表示日历中的单个日期，包含公历、农历、节日等完整信息。
 * 用于月视图、周视图、日视图的日期渲染。
 *
 * 功能特性：
 * - 区分当前月和非当前月日期
 * - 标记今天以便高亮显示
 * - 集成中国农历显示
 * - 支持阳历节日、农历节日、节气三种节日类型
 */
export interface CalendarDay {
	date: Date;                          // 完整的日期对象
	day: number;                         // 月中的日期（1-31）
	isCurrentMonth: boolean;             // 是否属于当前显示的月份
	isToday: boolean;                    // 是否是今天
	weekday: number;                     // 星期几（0-6，0=周日，1=周一，...，6=周六）
	lunarText?: string;                  // 农历显示文本（如："正月十五"）
	festival?: string;                   // 节日名称（如："春节"、"中秋"）
	festivalType?: 'solar' | 'lunar' | 'solarTerm';  // 节日类型：阳历节日、农历节日、节气
}

/**
 * 日历周数据结构
 *
 * 表示日历中的一周，包含7天的完整数据和周信息。
 * 用于周视图渲染和月视图的周分组显示。
 */
export interface CalendarWeek {
	weekNumber: number;      // 周数（1-52/53），基于 ISO 周数标准
	days: CalendarDay[];     // 该周的7天数据（周日到周六或周一到周日）
	startDate: Date;         // 周起始日期
	endDate: Date;           // 周结束日期
}

/**
 * 日历月数据结构
 *
 * 表示一个完整月份的日历数据，包含所有天数和按周分组的数据。
 * 由 calendarGenerator.ts 的 generateMonthCalendar() 函数生成。
 *
 * 数据组织：
 * - 总是包含42天（6周 × 7天）
 * - 包含上个月末尾、当前月、下个月开头以补全日历网格
 * - 同时提供扁平的 days 数组和分组的 weeks 数组
 */
export interface CalendarMonth {
	year: number;            // 年份（如：2025）
	month: number;           // 月份（1-12）
	weeks: CalendarWeek[];   // 按周分组的数据（6周）
	days: CalendarDay[];     // 所有日期的扁平数组（42天）
}

/**
 * 全局任务数据结构 (GC = GanttCalendar)
 *
 * 表示从 Markdown 文件中解析出的任务信息，所有视图通用的任务格式。
 * 支持两种格式：Tasks 插件的 emoji 格式和 Dataview 插件的 field 格式。
 *
 * 格式示例：
 * - Tasks (emoji): `- [ ] 🎯 Task title ⏫ ➕ 2025-01-10 📅 2025-01-15`
 * - Dataview (field): `- [ ] 🎯 Task title [priority:: high] [created:: 2025-01-10] [due:: 2025-01-15]`
 *
 * 优先级对应关系（6个档位）：
 * - 🔺 = highest (最高)
 * - ⏫ = high (高)
 * - 🔼 = medium (中高)
 * - 无emoji = normal (普通，默认优先级)
 * - 🔽 = low (低)
 * - ⏬ = lowest (最低)
 *
 * 日期 emoji 对应关系：
 * - ➕ = createdDate (创建日期)
 * - 🛫 = startDate (开始日期)
 * - ⏳ = scheduledDate (计划日期)
 * - 📅 = dueDate (截止日期)
 * - ✅ = completionDate (完成日期)
 * - ❌ = cancelledDate (取消日期)
 */
export interface GCTask {
	filePath: string;              // 任务所在文件的完整路径
	fileName: string;              // 任务所在文件名
	lineNumber: number;            // 任务在文件中的行号
	content: string;               // 原始任务内容（保留完整格式用于写回）
	description: string;           // 清理后的任务描述（移除元数据标记，用于显示）
	completed: boolean;            // 任务是否已完成
	cancelled?: boolean;           // 任务是否已取消（使用 [-] 复选框）
	status?: TaskStatusType;       // 任务状态类型
	format?: 'tasks' | 'dataview'; // 源格式：用于写回时选择正确的字段样式
	priority: string;              // 优先级：highest, high, medium, normal, low, lowest（默认normal）
	tags?: string[];               // 任务标签列表
	createdDate?: Date;            // 创建日期
	startDate?: Date;              // 开始日期
	scheduledDate?: Date;          // 计划日期
	dueDate?: Date;                // 截止日期
	cancelledDate?: Date;          // 取消日期
	completionDate?: Date;         // 完成日期
	repeat?: string;               // 周期规则，如 "every day", "every week on Monday when done"
	warning?: string;              // 警告信息：显示任务格式问题或缺失的关键属性
		ticktick?: string;             // %%content%% 纯文本块（向后兼容，新解析中不再主动赋值）
		metadataFields?: MetadataField[]; // 统一的内联元数据字段列表（%%[key::value]%%）
	// 时间精度：记录每个日期字段原始解析时是否包含时间（HH:mm）
	// 'day' = 全天任务（仅日期），'time' = 定时任务（日期+时间）
	datePrecision?: Partial<Record<'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'cancelledDate' | 'completionDate', 'day' | 'time'>>;
	// 同步相关字段
	sourceId?: string;             // 数据源特定 ID
	lastModified?: Date;           // 最后修改时间
	// 飞书同步字段
	feishuGuid?: string;           // 飞书任务 GUID（存储在 %%[guid:: xxx]%% 中）
	feishuDesc?: string;           // 飞书任务描述（存储在 %%[desc:: xxx]%% 中）
}

/**
 * 任务排序字段类型
 */
export type SortField =
	| 'priority'
	| 'description'
	| 'createdDate'
	| 'startDate'
	| 'scheduledDate'
	| 'dueDate'
	| 'completionDate';

/**
 * 排序顺序类型
 */
export type SortOrder = 'asc' | 'desc';

/**
 * 任务排序状态
 */
export interface SortState {
	field: SortField;
	order: SortOrder;
}

/**
 * 默认排序状态
 */
export const DEFAULT_SORT_STATE: SortState = {
	field: 'dueDate',
	order: 'asc'
};

/**
 * 标签筛选组合器类型
 * - AND: 交集模式，任务必须包含所有选中标签
 * - OR: 并集模式，任务包含任一选中标签即可
 * - NOT: 排除模式，排除包含任一选中标签的任务
 */
export type TagFilterOperator = 'AND' | 'OR' | 'NOT';

/**
 * 标签筛选状态
 */
export interface TagFilterState {
	/** 选中的标签列表 */
	selectedTags: string[];
	/** 组合器：AND（交集）/ OR（并集）/ NOT（排除） */
	operator: TagFilterOperator;
}

/**
 * 默认标签筛选状态
 */
export const DEFAULT_TAG_FILTER_STATE: TagFilterState = {
	selectedTags: [],
	operator: 'OR'
};

/**
 * 任务状态筛选状态
 */
export interface StatusFilterState {
	/** 选中的状态 key 列表（空数组表示显示所有） */
	selectedStatuses: string[];
}

/** 默认状态筛选状态（默认只显示待办任务） */
export const DEFAULT_STATUS_FILTER_STATE: StatusFilterState = {
	selectedStatuses: ['todo']
};

import type { App } from 'obsidian';
import type { GanttCalendarSettings, DateFieldType } from './settings/types';

/**
 * 安全读取任务的日期字段
 * 替代 `(task as any)[dateField]` 模式
 */
export function getTaskDateField(task: GCTask, field: DateFieldType): Date | undefined {
	switch (field) {
		case 'createdDate': return task.createdDate;
		case 'startDate': return task.startDate;
		case 'scheduledDate': return task.scheduledDate;
		case 'dueDate': return task.dueDate;
		case 'completionDate': return task.completionDate;
		case 'cancelledDate': return task.cancelledDate;
	}
}

/**
 * 安全写入任务的日期字段
 * 替代 `(task as any)[dateField] = value` 模式
 */
export function setTaskDateField(task: GCTask, field: DateFieldType, value: Date | undefined): void {
	switch (field) {
		case 'createdDate': task.createdDate = value; break;
		case 'startDate': task.startDate = value; break;
		case 'scheduledDate': task.scheduledDate = value; break;
		case 'dueDate': task.dueDate = value; break;
		case 'completionDate': task.completionDate = value; break;
		case 'cancelledDate': task.cancelledDate = value; break;
	}
}

/**
 * 可合并的任务字段类型（用于同步冲突解决）
 */
export type MergeableTaskField = 'description' | 'completed' | 'dueDate' | 'startDate' | 'priority' | 'status' | 'tags';

/**
 * 安全写入任务的可合并字段
 * 替代 `(task as any)[field] = value` 模式（用于同步）
 */
export function setTaskMergeableField(task: GCTask, field: MergeableTaskField, value: unknown): void {
	switch (field) {
		case 'description': task.description = value as string; break;
		case 'completed': task.completed = value as boolean; break;
		case 'dueDate': task.dueDate = value as Date | undefined; break;
		case 'startDate': task.startDate = value as Date | undefined; break;
		case 'priority': task.priority = value as string; break;
		case 'status': task.status = value as TaskStatusType | undefined; break;
		case 'tags': task.tags = value as string[] | undefined; break;
	}
}

/**
 * 插件上下文接口
 * 供视图渲染器和组件使用，替代 `plugin: any`
 */
export interface IPluginContext {
	settings: GanttCalendarSettings;
	saveSettings(): Promise<void>;
	taskCache: {
		getAllTasks(): GCTask[];
		whenReady?(): Promise<void>;
		onUpdate(handler: (filePath?: string) => void): void;
		offUpdate(handler: (filePath?: string) => void): void;
		initialize(globalTaskFilter: string, enabledFormats?: string[], retryCount?: number): Promise<void>;
	};
	calendarView?: {
		selectDate(date: Date, viewType?: CalendarViewType): void;
		render(): void;
	};
	app: App;
	dailyNoteIndex?: DailyNoteIndex;
	refreshCalendarViews(): void;
}
