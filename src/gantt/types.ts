/**
 * 甘特图相关类型定义
 *
 * 使用自研的 SVG 渲染引擎实现甘特图可视化
 */

import type { TaskStatusType } from '../tasks/taskStatus';
import type { StatusFilterState } from '../types';

/**
 * 甘特图任务格式
 *
 * 专门用于甘特图渲染的任务数据结构，包含 SVG 渲染所需的字段
 */
export interface GanttChartTask {
	/** 唯一标识符 */
	id: string;
	/** 任务名称 */
	name: string;
	/** 开始日期 (YYYY-MM-DD) */
	start: string;
	/** 结束日期 (YYYY-MM-DD) */
	end: string;
	/** 进度百分比 (0-100) */
	progress: number;
	/** 依赖任务ID列表 */
	dependencies?: string[] | string;
	/** 自定义CSS类名 */
	custom_class?: string;

	// ==================== 扩展字段（用于渲染） ====================
	/** 是否已完成 */
	completed?: boolean;
	/** 是否已取消 */
	cancelled?: boolean;
	/** 文件路径（用于跳转） */
	filePath?: string;
	/** 文件名 */
	fileName?: string;
	/** 行号（用于跳转） */
	lineNumber?: number;

	// ==================== 完整任务信息（用于更新时保留原始数据） ====================
	/** 原始任务内容（保留完整格式用于写回） */
	content?: string;
	/** 任务描述 */
	description?: string;
	/** 任务标签列表 */
	tags?: string[];
	/** 优先级 */
	priority?: string;
	/** 源格式类型 */
	format?: 'tasks' | 'dataview';
	/** 任务状态类型 */
	status?: TaskStatusType;

	/** 创建日期 */
	createdDate?: Date;
	/** 开始日期 */
	startDate?: Date;
	/** 计划日期 */
	scheduledDate?: Date;
	/** 截止日期 */
	dueDate?: Date;
	/** 取消日期 */
	cancelledDate?: Date;
	/** 完成日期 */
	completionDate?: Date;
	/** 周期规则，如 "every day" */
	repeat?: string;
}

/**
 * 甘特图视图模式（仅支持日视图）
 */
export type GanttViewMode = 'day' | 'quarter_day' | 'half_day';

/**
 * 甘特图配置选项
 */
export interface GanttChartConfig {
	/** 视图模式 */
	view_mode: GanttViewMode;
	/** 时间颗粒度（新增） */
	granularity?: TimeGranularity;
	/** 语言代码 */
	language: string;
	/** 头部高度 (px) */
	header_height?: number;
	/** 列宽度 (px) */
	column_width?: number;
	/** 步长 */
	step?: number;
	/** 任务条高度 (px) */
	bar_height?: number;
	/** 任务条圆角半径 (px) */
	bar_corner_radius?: number;
	/** 箭头曲率 */
	arrow_curve?: number;
	/** 内边距 */
	padding?: number;
	/** 日期格式 */
	date_format?: string;
	/** 自定义弹窗HTML函数 */
	custom_popup_html?: (task: GanttChartTask) => string;
	/** 点击任务回调 */
	on_click?: (task: GanttChartTask) => void;
	/** 日期变更回调 */
	on_date_change?: (task: GanttChartTask, start: Date, end: Date) => void;
	/** 进度变更回调 */
	on_progress_change?: (task: GanttChartTask, progress: number) => void;
	/** 任务更新完成回调（用于增量更新视图） */
	on_task_updated?: (filePath: string) => void;
}

/**
 * 甘特图 Tooltip 配置
 */
export interface GanttTooltipConfig {
	/** 是否显示弹窗 */
	enabled: boolean;
	/** 自定义弹窗渲染函数 */
	renderer?: (task: GanttChartTask) => HTMLElement | string;
}

/**
 * 日期字段类型（用于任务时间范围）
 */
export type DateFieldType =
	| 'createdDate'
	| 'startDate'
	| 'scheduledDate'
	| 'dueDate'
	| 'completionDate'
	| 'cancelledDate';

/**
 * 甘特图视图状态
 */
export interface GanttViewState {
	/** 开始时间字段 */
	startField: DateFieldType;
	/** 结束时间字段 */
	endField: DateFieldType;
	/** 状态筛选 */
	statusFilter: StatusFilterState;
	/** 时间颗粒度（仅支持日视图） */
	timeGranularity: 'day';
	/** 当前视图模式 */
	viewMode: GanttViewMode;
}

/**
 * 甘特图样式配置
 */
export interface GanttStyleConfig {
	/** 容器高度 */
	height: string;
	/** 任务条颜色 */
	barColor: string;
	/** 已完成任务颜色 */
	completedColor: string;
	/** 高优先级颜色 */
	highestPriorityColor: string;
	/** 中优先级颜色 */
	mediumPriorityColor: string;
	/** 低优先级颜色 */
	lowPriorityColor: string;
}

/**
 * 时间颗粒度枚举（仅支持日视图）
 */
export enum TimeGranularity {
	DAY = 'day'
}

/**
 * 颗粒度配置接口
 */
export interface GranularityConfig {
	/** 颗粒度类型 */
	granularity: TimeGranularity;
	/** 对应的毫秒数 */
	milliseconds: number;
	/** 标签格式化函数 */
	labelFormatter: (date: Date, index?: number) => string;
	/** 网格对齐函数 */
	gridAligner: (date: Date) => Date;
}

/**
 * 颗粒度配置映射表（仅日视图）
 */
export const GRANULARITY_CONFIGS: Record<TimeGranularity, GranularityConfig> = {
	[TimeGranularity.DAY]: {
		granularity: TimeGranularity.DAY,
		milliseconds: 24 * 60 * 60 * 1000,
		labelFormatter: (date: Date) => `${date.getMonth() + 1}/${date.getDate()}`,
		gridAligner: (date: Date) => {
			const aligned = new Date(date);
			aligned.setHours(0, 0, 0, 0);
			return aligned;
		}
	}
};
