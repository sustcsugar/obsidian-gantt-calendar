/**
 * 甘特图相关类型定义
 *
 * 使用自研的 SVG 渲染引擎实现甘特图可视化
 */

import type { TaskStatusType } from '../tasks/taskStatus';
import type { GCTask, StatusFilterState, TagFilterState, MetadataField } from '../types';

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
	/**
	 * Lead-in segment start (creation → effective start), date-only string.
	 * Rendered as a distinct muted bar ahead of the main draggable bar.
	 */
	leadStart?: string;
	/** Which source field actually provided the draggable start */
	startSourceField?: DateFieldType;
	/** 起止时刻标注（如 "09:00 → 18:00"），任一端点带时刻时生成；与时间画布语义一致 */
	timeLabel?: string;

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
	/** Per-field date precision passthrough from the source task (keeps HH:mm on write-back) */
	datePrecision?: Partial<Record<'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'cancelledDate' | 'completionDate', 'day' | 'time'>>;
	/** 结构化内联元数据字段 (%%[key::value]%%) */
	metadataFields?: MetadataField[];

	// ==================== 树形甘特图扩展字段 ====================
	/** 稳定树节点 ID */
	treeNodeId?: string;
	/** 树节点类型：folder | file | task */
	treeNodeType?: GanttNodeType;
	/** 树层级深度：folder=0, file=1, 顶层任务=2, 子任务=3+ */
	treeDepth?: number;
	/** 是否为只读汇总条 */
	isRollupBar?: boolean;
	/** 是否有子节点（用于显示折叠箭头） */
	hasChildren?: boolean;
	/** 当前是否处于折叠状态 */
	isCollapsed?: boolean;
	/** 子节点日期是否超出父任务自身日期范围 */
	hasOutOfBoundsChildren?: boolean;
	/** 子树内有效实体任务数量 */
	leafTaskCount?: number;
	/** 子树内已完成实体任务数量（T9 汇总进度） */
	completedTaskCount?: number;
	/** 子树完成率 0 ~ 1（T9 汇总进度） */
	progressRatio?: number;
	/** 是否为虚拟容器父节点 */
	isVirtualContainer?: boolean;
	/** 是否为继承父任务时间跨度的无日期子任务 */
	isInheritedDate?: boolean;
}

/**
 * 甘特图视图模式（仅支持周视图）
 */
export type GanttViewMode = 'week' | 'quarter_week' | 'half_week';

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
	/** 树节点展开/折叠切换回调 */
	on_toggle_collapse?: (nodeId: string) => void;
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
	/** 时间颗粒度（仅支持周视图） */
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
 * 时间颗粒度枚举（仅支持周视图）
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
 * 颗粒度配置映射表（仅周视图）
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

// ==================== 树形甘特图类型定义 ====================

/**
 * 甘特图树节点类型
 */
export type GanttNodeType = 'folder' | 'file' | 'task';

/**
 * 甘特图视图展示模式
 * - 'tree': 树形分组视图（默认，支持文件夹/文件/父子任务折叠与汇总条）
 * - 'flat': 原版平铺视图（完整还原基线排序、筛选与平铺渲染行为）
 */
export type GanttDisplayMode = 'tree' | 'flat';

/**
 * 甘特图树形分组维度
 * - 'project-model': 项目文件夹 → 型号文档 → 任务（四级）
 * - 'model-only': 仅按型号文档 → 任务（跨项目型号总览）
 */
export type GanttGroupMode = 'project-model' | 'model-only';

/**
 * 甘特图树节点模型（folder → file → task → sub-task）
 */
export interface GanttTreeNode {
	/**
	 * 稳定 UI 节点标识（严禁依赖易漂移的行号）：
	 * - folder: `folder:${folderKey}`
	 * - file:   `file:${normalizedFilePath}`
	 * - task:   `task:${normalizedFilePath}::${parentTaskKey}::${normalizedDescription}#${sameTitleOrdinal}`
	 */
	nodeId: string;
	type: GanttNodeType;
	label: string;
	/** 层级深度：folder = 0，file = 1，顶层任务 = 2，子任务依次 3+ */
	depth: number;
	filePath?: string;
	/** 仅 type === 'task' 时存在 */
	task?: GCTask;
	children: GanttTreeNode[];
	/** 本地日期对象（零点归一化） */
	computedStart: Date;
	computedEnd: Date;
	/** 本地 YYYY-MM-DD 字符串（禁止使用 toISOString） */
	startStr: string;
	endStr: string;
	/** true 表示渲染为只读汇总条（folder、file、无自身日期父任务或虚拟容器） */
	isRollupBar: boolean;
	/** 任务自身是否具备有效日期（仅 task 节点） */
	hasOwnDate?: boolean;
	/** 任务自身无日期、但因位于有日期的父任务下而继承父任务时间跨度 */
	isInheritedDate?: boolean;
	/** 仅自带日期的实体父任务存在子节点跨度超出自身日期范围时置为 true */
	hasOutOfBoundsChildren?: boolean;
	/** 子树中有效实体任务数量（用于汇总条 Tooltip 展示） */
	leafTaskCount?: number;
	/** 子树中已完成实体任务数量（T9 汇总进度） */
	completedTaskCount?: number;
	/** 子树完成进度占比 0 ~ 1（T9 汇总进度） */
	progressRatio?: number;
}

/**
 * 甘特图树构建选项
 */
export interface GanttTreeBuildOptions {
	/** 甘特图开始时间字段 */
	startField: DateFieldType;
	/** 甘特图结束时间字段 */
	endField: DateFieldType;
	/** 分组维度（默认 'project-model'） */
	groupMode?: GanttGroupMode;
	/** 甘特图树形根目录（留空表示全库，自动规范化首尾斜杠） */
	rootFolder?: string;
	/** 根目录直属文件的兜底分组名（默认 "未分类项目"） */
	uncategorizedFolderLabel?: string;
	/** 状态筛选 */
	statusFilter?: StatusFilterState;
	/** 层级标签筛选 */
	tagFilter?: TagFilterState;
	/** 关键词搜索（大小写不敏感，匹配任务文本、型号文件名与项目文件夹名） */
	searchQuery?: string;
}
