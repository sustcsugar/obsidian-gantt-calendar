/**
 * BEM命名规范工具函数
 *
 * 命名格式: gc-{block}__{element}--{modifier}
 * - block: 块名称（不含前缀）
 * - element: 元素名称（可选）
 * - modifier: 修饰符名称（可选）
 *
 * @example
 * bem(BLOCKS.TASK_CARD) → 'gc-task-card'
 * bem(BLOCKS.TASK_CARD, 'text') → 'gc-task-card__text'
 * bem(BLOCKS.TASK_CARD, undefined, 'month') → 'gc-task-card--month'
 * bem(BLOCKS.TASK_CARD, 'priority', 'high') → 'gc-task-card__priority--high'
 */

/**
 * BEM Block 常量定义
 *
 * 集中管理所有 BEM block 名称，确保命名统一且易于维护
 */
export const BLOCKS = {
	/** 视图容器 */
	VIEW: 'view',
	/** 日视图 */
	DAY_VIEW: 'day-view',
	/** 甘特图 */
	GANTT: 'gantt-view',
	/** 甘特图工具提示 */
	GANTT_TOOLTIP: 'gantt-view-tooltip',

	/** 工具栏 */
	TOOLBAR: 'toolbar',

	/** 任务卡片 */
	TASK_CARD: 'task-card',
	/** 任务工具提示 */
	TASK_TOOLTIP: 'task-tooltip',
	/** 标签 */
	TAG: 'tag',
	/** 链接 */
	LINK: 'link',



} as const;

/**
 * Block 类型定义
 */
export type BlockType = typeof BLOCKS[keyof typeof BLOCKS];

/**
 * 生成BEM规范的CSS类名
 */
export function bem(block: BlockType, element?: string, modifier?: string): string {
	let className = `gc-${block}`;

	if (element) {
		className += `__${element}`;
	}
	if (modifier) {
		className += `--${modifier}`;
	}
	return className;
}

/**
 * 任务卡片类名常量
 */
export const TaskCardClasses = {
	/** Block名称 */
	block: bem(BLOCKS.TASK_CARD),

	/** Elements */
	elements: {
		checkbox: bem(BLOCKS.TASK_CARD, 'checkbox'),
		text: bem(BLOCKS.TASK_CARD, 'text'),
		tags: bem(BLOCKS.TASK_CARD, 'tags'),
		priority: bem(BLOCKS.TASK_CARD, 'priority'),
		priorityBadge: bem(BLOCKS.TASK_CARD, 'priority-badge'),
		times: bem(BLOCKS.TASK_CARD, 'times'),
		timeBadge: bem(BLOCKS.TASK_CARD, 'time-badge'),
		file: bem(BLOCKS.TASK_CARD, 'file'),
		warning: bem(BLOCKS.TASK_CARD, 'warning'),
	},

	/** Modifiers */
	modifiers: {
		// 视图相关修饰符（添加 view 后缀区分）
		monthView: bem(BLOCKS.TASK_CARD, undefined, 'month'),
		weekView: bem(BLOCKS.TASK_CARD, undefined, 'week'),
		dayView: bem(BLOCKS.TASK_CARD, undefined, 'day'),
		taskView: bem(BLOCKS.TASK_CARD, undefined, 'task'),
		ganttView: bem(BLOCKS.TASK_CARD, undefined, 'gantt'),
		// 状态修饰符
		completed: bem(BLOCKS.TASK_CARD, undefined, 'completed'),
		pending: bem(BLOCKS.TASK_CARD, undefined, 'pending'),
	}
};

/**
 * 时间徽章类型常量
 */
export const TimeBadgeClasses = {
	created: bem(BLOCKS.TASK_CARD, 'time-badge', 'created'),
	start: bem(BLOCKS.TASK_CARD, 'time-badge', 'start'),
	scheduled: bem(BLOCKS.TASK_CARD, 'time-badge', 'scheduled'),
	due: bem(BLOCKS.TASK_CARD, 'time-badge', 'due'),
	cancelled: bem(BLOCKS.TASK_CARD, 'time-badge', 'cancelled'),
	completion: bem(BLOCKS.TASK_CARD, 'time-badge', 'completion'),
	overdue: bem(BLOCKS.TASK_CARD, 'time-badge', 'overdue'),
};

/**
 * 优先级类名常量
 */
export const PriorityClasses = {
	highest: bem(BLOCKS.TASK_CARD, 'priority-badge', 'highest'),
	high: bem(BLOCKS.TASK_CARD, 'priority-badge', 'high'),
	medium: bem(BLOCKS.TASK_CARD, 'priority-badge', 'medium'),
	low: bem(BLOCKS.TASK_CARD, 'priority-badge', 'low'),
	lowest: bem(BLOCKS.TASK_CARD, 'priority-badge', 'lowest'),
};



/**
 * Tooltip类名常量
 */
export const TooltipClasses = {
	block: bem(BLOCKS.TASK_TOOLTIP),

	elements: {
		description: bem(BLOCKS.TASK_TOOLTIP, 'description'),
		priority: bem(BLOCKS.TASK_TOOLTIP, 'priority'),
		times: bem(BLOCKS.TASK_TOOLTIP, 'times'),
		timeItem: bem(BLOCKS.TASK_TOOLTIP, 'time-item'),
		tags: bem(BLOCKS.TASK_TOOLTIP, 'tags'),
		file: bem(BLOCKS.TASK_TOOLTIP, 'file'),
		fileLocation: bem(BLOCKS.TASK_TOOLTIP, 'file-location'),
	},

	modifiers: {
		visible: bem(BLOCKS.TASK_TOOLTIP, undefined, 'visible'),
	},
};

/**
 * 标签类名常量
 */
export const TagClasses = {
	block: bem(BLOCKS.TAG),

	/** 颜色修饰符 (0-5) */
	colors: [0, 1, 2, 3, 4, 5].map(i => bem(BLOCKS.TAG, undefined, `color-${i}`)),

	/** 上下文修饰符 */
	modifiers: {
		tooltip: bem(BLOCKS.TAG, undefined, 'tooltip'),
		selectable: bem(BLOCKS.TAG, undefined, 'selectable'),
		selected: bem(BLOCKS.TAG, undefined, 'selected'),
	},
};

/**
 * 日视图类名常量
 */
export const DayViewClasses = {
	block: bem(BLOCKS.DAY_VIEW),

	/** 布局模式修饰符 */
	modifiers: {
		horizontal: bem(BLOCKS.DAY_VIEW, undefined, 'horizontal'),
		vertical: bem(BLOCKS.DAY_VIEW, undefined, 'vertical'),
		tasksOnly: bem(BLOCKS.DAY_VIEW, undefined, 'tasks-only'),
	},

	/** Elements */
	elements: {
		sectionTasks: bem(BLOCKS.DAY_VIEW, 'section', 'tasks'),
		sectionNotes: bem(BLOCKS.DAY_VIEW, 'section', 'notes'),
		title: bem(BLOCKS.DAY_VIEW, 'title'),
		taskList: bem(BLOCKS.DAY_VIEW, 'task-list'),
		notesContent: bem(BLOCKS.DAY_VIEW, 'notes-content'),
		notesBody: bem(BLOCKS.DAY_VIEW, 'notes-body'),
		divider: bem(BLOCKS.DAY_VIEW, 'divider'),
		dividerVertical: bem(BLOCKS.DAY_VIEW, 'divider', 'vertical'),
	},
};

/**
 * 视图容器类名常量
 */
export const ViewClasses = {
	block: bem(BLOCKS.VIEW),

	/** 视图类型修饰符 */
	modifiers: {
		year: bem(BLOCKS.VIEW, undefined, 'year'),
		month: bem(BLOCKS.VIEW, undefined, 'month'),
		week: bem(BLOCKS.VIEW, undefined, 'week'),
		day: bem(BLOCKS.VIEW, undefined, 'day'),
		task: bem(BLOCKS.VIEW, undefined, 'task'),
		gantt: bem(BLOCKS.VIEW, undefined, 'gantt'),
	},
};

/**
 * 工具栏类名常量
 */
export const ToolbarClasses = {
	block: bem(BLOCKS.TOOLBAR),

	/** Elements */
	elements: {
		left: bem(BLOCKS.TOOLBAR, 'left'),
		center: bem(BLOCKS.TOOLBAR, 'center'),
		right: bem(BLOCKS.TOOLBAR, 'right'),
	},

	/** 修饰符 */
	modifiers: {
		gantt: bem(BLOCKS.TOOLBAR, undefined, 'gantt'), // 右侧甘特图工具栏区
		task: bem(BLOCKS.TOOLBAR, undefined, 'task'),   // 右侧任务视图工具栏区
	},
};

/**
 * 链接类名常量
 */
export const LinkClasses = {
	block: bem(BLOCKS.LINK),

	/** 链接类型修饰符 */
	modifiers: {
	    obsidian: bem(BLOCKS.LINK, undefined, 'obsidian'),
		markdown: bem(BLOCKS.LINK, undefined, 'markdown'),
		url: bem(BLOCKS.LINK, undefined, 'url'),
	},
};

/**
 * 甘特图类名常量
 */
export const GanttClasses = {
	block: bem(BLOCKS.GANTT),

	/** Elements */
	elements: {
		layout: bem(BLOCKS.GANTT, 'layout'),
		corner: bem(BLOCKS.GANTT, 'corner'),
		cornerSvg: bem(BLOCKS.GANTT, 'corner-svg'),
		headerContainer: bem(BLOCKS.GANTT, 'header-container'),
		headerSvg: bem(BLOCKS.GANTT, 'header-svg'),
		tasklistContainer: bem(BLOCKS.GANTT, 'tasklist-container'),
		tasklistSvg: bem(BLOCKS.GANTT, 'tasklist-svg'),
		chartContainer: bem(BLOCKS.GANTT, 'chart-container'),
		chartSvg: bem(BLOCKS.GANTT, 'chart-svg'),
		grid: bem(BLOCKS.GANTT, 'grid'),
		tasks: bem(BLOCKS.GANTT, 'tasks'),
		barGroup: bem(BLOCKS.GANTT, 'bar-group'),
	},

	/** Modifiers */
	modifiers: {
		dayView: bem(BLOCKS.GANTT, undefined, 'day-view'),
		weekView: bem(BLOCKS.GANTT, undefined, 'week-view'),
		monthView: bem(BLOCKS.GANTT, undefined, 'month-view'),
	},
};

/**
 * 甘特图工具提示类名常量
 */
export const GanttTooltipClasses = {
	block: bem(BLOCKS.GANTT_TOOLTIP),
};



/**
 * 获取带修饰符的完整类名
 * @param baseClass 基础类名
 * @param modifiers 修饰符列表
 * @returns 空格分隔的类名字符串
 */
export function withModifiers(baseClass: string, ...modifiers: (string | undefined)[]): string {
	const classes = [baseClass];
	for (const mod of modifiers) {
		if (mod) {
			classes.push(mod);
		}
	}
	return classes.join(' ');
}
