import type { GCTask } from '../../types';

/**
 * 视图修饰符类型
 */
export type ViewModifier = 'task' | 'day' | 'week' | 'month' | 'gantt' | 'sidebar';

/**
 * 时间字段显示配置
 */
export interface TimeFieldConfig {
	/** 显示创建时间 */
	showCreated?: boolean;
	/** 显示开始时间 */
	showStart?: boolean;
	/** 显示计划时间 */
	showScheduled?: boolean;
	/** 显示截止时间 */
	showDue?: boolean;
	/** 显示取消时间 */
	showCancelled?: boolean;
	/** 显示完成时间 */
	showCompletion?: boolean;
	/** 显示逾期指示器 */
	showOverdueIndicator?: boolean;
}

/**
 * 任务卡片组件配置
 */
export interface TaskCardConfig {
	/** ===== 基础配置 ===== */

	/** 视图类型（用于 CSS 类名） */
	viewModifier: ViewModifier;

	/** ===== 元素显示控制 ===== */

	/** 显示复选框 */
	showCheckbox: boolean;
	/** 显示任务描述 */
	showDescription: boolean;
	/** 显示标签 */
	showTags: boolean;
	/** 显示优先级 */
	showPriority: boolean;
	/** 显示文件位置 */
	showFileLocation: boolean;
	/** 显示警告图标 */
	showWarning: boolean;
	/** 显示 ticktick（%%content%%） */
	showTicktick: boolean;

	/** ===== 时间属性配置 ===== */

	/** 是否显示时间区域 */
	showTimes: boolean;
	/** 时间字段详细配置 */
	timeFields?: TimeFieldConfig;

	/** ===== 交互功能 ===== */

	/** 启用悬浮提示 */
	enableTooltip: boolean;
	/** 启用拖拽 */
	enableDrag: boolean;
	/** 整个卡片可点击 */
	clickable: boolean;

	/** ===== 样式配置 ===== */

	/** 紧凑模式（用于月视图等空间有限的场景） */
	compact?: boolean;
	/** 描述最大行数 */
	maxLines?: number;

	/** ===== 内容过滤 ===== */

	/** 显示全局过滤词 */
	showGlobalFilter?: boolean;
}

/**
 * 任务卡片组件 Props
 */
export interface TaskCardProps {
	/** 任务数据 */
	task: GCTask;

	/** 配置 */
	config: TaskCardConfig;

	/** 容器元素 */
	container: HTMLElement;

	/** 应用实例 */
	app: any;

	/** 插件实例 */
	plugin: any;

	/** ===== 事件回调 ===== */

	/** 完成状态切换回调 */
	onToggleComplete?: (task: GCTask, newStatus: boolean) => void;

	/** 点击回调 */
	onClick?: (task: GCTask) => void;

	/** 拖拽放置回调 */
	onDrop?: (task: GCTask, targetDate?: Date) => void;

	/** 刷新回调（用于操作后刷新视图） */
	onRefresh?: () => void;

	/** ===== 拖拽相关 ===== */

	/** 目标日期（用于拖拽） */
	targetDate?: Date;
}

/**
 * 任务卡片组件渲染结果
 */
export interface TaskCardRenderResult {
	/** 创建的卡片元素 */
	element: HTMLElement;

	/** 销毁方法 */
	destroy: () => void;
}
