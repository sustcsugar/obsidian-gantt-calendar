/**
 * BEM命名规范工具函数
 *
 * 命名格式: gc-{block}__{element}--{modifier}
 * - block: 块名称（不含前缀）
 * - element: 元素名称（可选）
 * - modifier: 修饰符名称（可选）
 *
 * @example
 * bem('task-card') → 'gc-task-card'
 * bem('task-card', 'text') → 'gc-task-card__text'
 * bem('task-card', undefined, 'month') → 'gc-task-card--month'
 * bem('task-card', 'priority', 'high') → 'gc-task-card__priority--high'
 */

/**
 * 生成BEM规范的CSS类名
 */
export function bem(block: string, element?: string, modifier?: string): string {
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
	block: bem('task-card'),

	/** Elements */
	elements: {
		checkbox: bem('task-card', 'checkbox'),
		text: bem('task-card', 'text'),
		tags: bem('task-card', 'tags'),
		priority: bem('task-card', 'priority'),
		priorityBadge: bem('task-card', 'priority-badge'),
		times: bem('task-card', 'times'),
		timeBadge: bem('task-card', 'time-badge'),
		file: bem('task-card', 'file'),
		warning: bem('task-card', 'warning'),
	},

	/** Modifiers */
	modifiers: {
		// 视图相关修饰符（添加 view 后缀区分）
		monthView: bem('task-card', undefined, 'month'),
		weekView: bem('task-card', undefined, 'week'),
		dayView: bem('task-card', undefined, 'day'),
		taskView: bem('task-card', undefined, 'task'),
		ganttView: bem('task-card', undefined, 'gantt'),
		// 状态修饰符
		completed: bem('task-card', undefined, 'completed'),
		pending: bem('task-card', undefined, 'pending'),
	}
};

/**
 * Tooltip类名常量
 */
export const TooltipClasses = {
	block: bem('task-tooltip'),

	elements: {
		description: bem('task-tooltip', 'description'),
		priority: bem('task-tooltip', 'priority'),
		times: bem('task-tooltip', 'times'),
		timeItem: bem('task-tooltip', 'time-item'),
		tags: bem('task-tooltip', 'tags'),
		file: bem('task-tooltip', 'file'),
		fileLocation: bem('task-tooltip', 'file-location'),
	},

	modifiers: {
		visible: bem('task-tooltip', undefined, 'visible'),
	},
};

/**
 * 标签类名常量
 */
export const TagClasses = {
	block: bem('tag'),

	/** 颜色修饰符 (0-5) */
	colors: [0, 1, 2, 3, 4, 5].map(i => bem('tag', undefined, `color-${i}`)),

	/** 上下文修饰符 */
	modifiers: {
		tooltip: bem('tag', undefined, 'tooltip'),
		selectable: bem('tag', undefined, 'selectable'),
		selected: bem('tag', undefined, 'selected'),
	},
};

/**
 * 日视图类名常量
 */
export const DayViewClasses = {
	block: bem('day-view'),

	/** 布局模式修饰符 */
	modifiers: {
		horizontal: bem('day-view', undefined, 'horizontal'),
		vertical: bem('day-view', undefined, 'vertical'),
		tasksOnly: bem('day-view', undefined, 'tasks-only'),
	},

	/** Elements */
	elements: {
		sectionTasks: bem('day-view', 'section', 'tasks'),
		sectionNotes: bem('day-view', 'section', 'notes'),
		title: bem('day-view', 'title'),
		taskList: bem('day-view', 'task-list'),
		notesContent: bem('day-view', 'notes-content'),
		notesBody: bem('day-view', 'notes-body'),
		divider: bem('day-view', 'divider'),
		dividerVertical: bem('day-view', 'divider', 'vertical'),
	},
};

/**
 * 视图容器类名常量
 */
export const ViewClasses = {
	block: bem('view'),

	/** 视图类型修饰符 */
	modifiers: {
		year: bem('view', undefined, 'year'),
		month: bem('view', undefined, 'month'),
		week: bem('view', undefined, 'week'),
		day: bem('view', undefined, 'day'),
		task: bem('view', undefined, 'task'),
		gantt: bem('view', undefined, 'gantt'),
	},
};

/**
 * 工具栏类名常量
 */
export const ToolbarClasses = {
	block: bem('toolbar'),

	/** Elements */
	elements: {
		left: bem('toolbar', 'left'),
		center: bem('toolbar', 'center'),
		right: bem('toolbar', 'right'),
	},

	/** 修饰符 */
	modifiers: {
		gantt: bem('toolbar', 'gantt'), // 右侧甘特图工具栏区
		task: bem('toolbar', 'task'),   // 右侧任务视图工具栏区
	},
};

/**
 * 优先级类名常量
 */
export const PriorityClasses = {
	highest: bem('task-card', 'priority-badge', 'highest'),
	high: bem('task-card', 'priority-badge', 'high'),
	medium: bem('task-card', 'priority-badge', 'medium'),
	low: bem('task-card', 'priority-badge', 'low'),
	lowest: bem('task-card', 'priority-badge', 'lowest'),
};

/**
 * 链接类名常量
 */
export const LinkClasses = {
	block: bem('link'),

	/** 链接类型修饰符 */
	modifiers: {
	obsidian: bem('link', undefined, 'obsidian'),
		markdown: bem('link', undefined, 'markdown'),
		url: bem('link', undefined, 'url'),
	},
};

/**
 * 时间徽章类型常量
 */
export const TimeBadgeClasses = {
	created: bem('task-card', 'time-badge', 'created'),
	start: bem('task-card', 'time-badge', 'start'),
	scheduled: bem('task-card', 'time-badge', 'scheduled'),
	due: bem('task-card', 'time-badge', 'due'),
	cancelled: bem('task-card', 'time-badge', 'cancelled'),
	completion: bem('task-card', 'time-badge', 'completion'),
	overdue: bem('task-card', 'time-badge', 'overdue'),
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
