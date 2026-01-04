/**
 * Frappe Gantt 集成相关类型定义
 */

/**
 * Frappe Gantt 任务格式
 * @see https://github.com/frappe/gantt
 */
export interface FrappeTask {
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
}

/**
 * Frappe Gantt 视图模式
 */
export type FrappeViewMode = 'day' | 'week' | 'month' | 'quarter_day' | 'half_day';

/**
 * Frappe Gantt 配置选项
 */
export interface FrappeGanttConfig {
	/** 视图模式 */
	view_mode: FrappeViewMode;
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
	custom_popup_html?: (task: FrappeTask) => string;
	/** 点击任务回调 */
	on_click?: (task: FrappeTask) => void;
	/** 日期变更回调 */
	on_date_change?: (task: FrappeTask, start: Date, end: Date) => void;
	/** 进度变更回调 */
	on_progress_change?: (task: FrappeTask, progress: number) => void;
}

/**
 * Frappe Gantt 弹窗配置
 */
export interface FrappePopupConfig {
	/** 是否显示弹窗 */
	enabled: boolean;
	/** 自定义弹窗渲染函数 */
	renderer?: (task: FrappeTask) => HTMLElement | string;
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
 * 任务状态筛选类型
 */
export type TaskStatusFilter = 'all' | 'completed' | 'uncompleted';

/**
 * 甘特图视图状态
 */
export interface GanttViewState {
	/** 开始时间字段 */
	startField: DateFieldType;
	/** 结束时间字段 */
	endField: DateFieldType;
	/** 状态筛选 */
	statusFilter: TaskStatusFilter;
	/** 时间颗粒度 */
	timeGranularity: 'day' | 'week' | 'month';
	/** 当前视图模式 */
	viewMode: FrappeViewMode;
}

/**
 * Frappe Gantt 实例接口
 */
export interface IFrappeGantt {
	/** 刷新任务数据 */
	refresh(tasks: FrappeTask[], config?: Partial<FrappeGanttConfig>): void;
	/** 当前任务列表 */
	tasks: FrappeTask[];
	/** 更新视图模式 */
	change_view_mode(mode: FrappeViewMode): void;
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
