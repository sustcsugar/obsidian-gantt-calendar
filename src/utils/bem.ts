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
	/** 周视图 */
	WEEK_VIEW: 'week-view',
	/** 月视图 */
	MONTH_VIEW: 'month-view',
	/** 年视图 */
	YEAR_VIEW: 'year-view',
	/** 甘特图 */
	GANTT: 'gantt-view',

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

	/** 创建任务弹窗 */
	CREATE_TASK_MODAL: 'create-task-modal',
	/** 创建任务按钮 */
	CREATE_TASK_BUTTON: 'create-task-btn',
	/** 编辑任务弹窗 */
	EDIT_TASK_MODAL: 'edit-task-modal',

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
 * 统一管理所有标签胶囊的样式类名
 */
export const TagClasses = {
	/** Block 基础类名 */
	block: bem(BLOCKS.TAG),

	/** Elements */
	elements: {
		label: bem(BLOCKS.TAG, 'label'),
		suffix: bem(BLOCKS.TAG, 'suffix'),
	},

	/** States（状态修饰符） */
	states: {
		selectable: bem(BLOCKS.TAG, undefined, 'selectable'),
		selected: bem(BLOCKS.TAG, undefined, 'selected'),
	},

	/** 颜色修饰符 (0-5) */
	colors: [0, 1, 2, 3, 4, 5].map(i => bem(BLOCKS.TAG, undefined, `color-${i}`)),
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
		taskNumberCell: bem(BLOCKS.GANTT, 'task-number-cell'),
		taskNumberText: bem(BLOCKS.GANTT, 'task-number-text'),
		taskContentCell: bem(BLOCKS.GANTT, 'task-content-cell'),
		taskCheckbox: bem(BLOCKS.GANTT, 'task-checkbox'),
		chartContainer: bem(BLOCKS.GANTT, 'chart-container'),
		chartSvg: bem(BLOCKS.GANTT, 'chart-svg'),
		resizer: bem(BLOCKS.GANTT, 'resizer'),
		grid: bem(BLOCKS.GANTT, 'grid'),
		tasks: bem(BLOCKS.GANTT, 'tasks'),
		barGroup: bem(BLOCKS.GANTT, 'bar-group'),
		container: bem(BLOCKS.GANTT, 'container'),
		root: bem(BLOCKS.GANTT, 'root'),
	},

	/** Modifiers */
	modifiers: {
		dayView: bem(BLOCKS.GANTT, undefined, 'day-view'),
		weekView: bem(BLOCKS.GANTT, undefined, 'week-view'),
		monthView: bem(BLOCKS.GANTT, undefined, 'month-view'),
	},
};


/**
 * 工具栏类名常量
 * 包含工具栏容器、区域和所有内部组件
 */
export const ToolbarClasses = {
	/** Block 名称 */
	block: bem(BLOCKS.TOOLBAR),

	/** Elements - 工具栏区域 */
	elements: {
		left: bem(BLOCKS.TOOLBAR, 'left'),
		center: bem(BLOCKS.TOOLBAR, 'center'),
		right: bem(BLOCKS.TOOLBAR, 'right'),
	},

	/** Modifiers - 视图修饰符 */
	modifiers: {
		gantt: bem(BLOCKS.TOOLBAR, undefined, 'gantt'),
		task: bem(BLOCKS.TOOLBAR, undefined, 'task'),
		/** 响应式紧凑模式 - 左侧按钮只显示图标 */
		compact: bem(BLOCKS.TOOLBAR, undefined, 'compact'),
	},

	/** 响应式项目优先级类 */
	priority: {
		hidden: bem(BLOCKS.TOOLBAR, 'item', 'hidden'),
		priority1: bem(BLOCKS.TOOLBAR, 'item', 'priority-1'),
		priority2: bem(BLOCKS.TOOLBAR, 'item', 'priority-2'),
		priority3: bem(BLOCKS.TOOLBAR, 'item', 'priority-3'),
	},

	/** Components - 工具栏内部组件 */
	components: {
		/** 视图切换器 */
		viewToggle: {
			group: bem(BLOCKS.TOOLBAR, 'view-toggle-group'),
			btn: bem(BLOCKS.TOOLBAR, 'view-toggle-btn'),
			btnActive: bem(BLOCKS.TOOLBAR, 'view-toggle-btn', 'active'),
		},

		/** 日期显示 */
		titleDisplay: bem(BLOCKS.TOOLBAR, 'title-display'),

		/** 时间颗粒度按钮组 */
		timeGranularity: {
			group: bem(BLOCKS.TOOLBAR, 'time-granularity-group'),
			groupGantt: bem(BLOCKS.TOOLBAR, 'time-granularity-group', 'gantt'),
			todayBtn: bem(BLOCKS.TOOLBAR, 'today-btn'),
			btn: bem(BLOCKS.TOOLBAR, 'time-granularity-btn'),
			btnActive: bem(BLOCKS.TOOLBAR, 'time-granularity-btn', 'active'),
		},

		/** 状态筛选（复选框多选模式） */
		statusFilter: {
			container: bem(BLOCKS.TOOLBAR, 'status-filter-container'),
			btn: bem(BLOCKS.TOOLBAR, 'status-filter-btn'),
			icon: bem(BLOCKS.TOOLBAR, 'status-filter-icon'),
			btnHasSelection: bem(BLOCKS.TOOLBAR, 'status-filter-btn', 'has-selection'),
			dropdown: bem(BLOCKS.TOOLBAR, 'status-filter-dropdown'),
			dropdownHeader: bem(BLOCKS.TOOLBAR, 'status-filter-dropdown-header'),
			dropdownActions: bem(BLOCKS.TOOLBAR, 'status-filter-dropdown-actions'),
			statusList: bem(BLOCKS.TOOLBAR, 'status-filter-list'),
			empty: bem(BLOCKS.TOOLBAR, 'status-filter-empty'),
			statusItem: bem(BLOCKS.TOOLBAR, 'status-filter-item'),
			statusItemSelected: bem(BLOCKS.TOOLBAR, 'status-filter-item', 'selected'),
			statusCheckbox: bem(BLOCKS.TOOLBAR, 'status-checkbox'),
			statusLabel: bem(BLOCKS.TOOLBAR, 'status-label'),
		},

		/** 排序按钮 */
		sort: {
			container: bem(BLOCKS.TOOLBAR, 'sort-container'),
			btn: bem(BLOCKS.TOOLBAR, 'sort-btn'),
			icon: bem(BLOCKS.TOOLBAR, 'sort-icon'),
			dropdownIcon: bem(BLOCKS.TOOLBAR, 'sort-dropdown-icon'),
			dropdown: bem(BLOCKS.TOOLBAR, 'sort-dropdown'),
			dropdownHeader: bem(BLOCKS.TOOLBAR, 'sort-dropdown-header'),
			menuItem: bem(BLOCKS.TOOLBAR, 'sort-menu-item'),
			menuItemActive: bem(BLOCKS.TOOLBAR, 'sort-menu-item', 'active'),
			optionIcon: bem(BLOCKS.TOOLBAR, 'sort-option-icon'),
			optionLabel: bem(BLOCKS.TOOLBAR, 'sort-option-label'),
			optionIndicator: bem(BLOCKS.TOOLBAR, 'sort-option-indicator'),
		},

		/** 标签筛选 */
		tagFilter: {
			container: bem(BLOCKS.TOOLBAR, 'tag-filter-container'),
			btn: bem(BLOCKS.TOOLBAR, 'tag-filter-btn'),
			icon: bem(BLOCKS.TOOLBAR, 'tag-filter-icon'),
			btnHasSelection: bem(BLOCKS.TOOLBAR, 'tag-filter-btn', 'has-selection'),
			pane: bem(BLOCKS.TOOLBAR, 'tag-filter-pane'),
			operators: bem(BLOCKS.TOOLBAR, 'tag-filter-operators'),
			operatorBtn: bem(BLOCKS.TOOLBAR, 'tag-filter-operator-btn'),
			operatorBtnActive: bem(BLOCKS.TOOLBAR, 'tag-filter-operator-btn', 'active'),
			tagsGrid: bem(BLOCKS.TOOLBAR, 'tag-filter-tags-grid'),
			empty: bem(BLOCKS.TOOLBAR, 'tag-filter-empty'),
			tagItem: bem(BLOCKS.TOOLBAR, 'tag-filter-tag-item'),
			tagItemSelected: bem(BLOCKS.TOOLBAR, 'tag-filter-tag-item', 'selected'),
			tagName: bem(BLOCKS.TOOLBAR, 'tag-filter-tag-name'),
			tagCount: bem(BLOCKS.TOOLBAR, 'tag-filter-tag-count'),
		},

		/** 字段选择器 */
		fieldSelector: {
			group: bem(BLOCKS.TOOLBAR, 'field-selector-group'),
			groupGantt: bem(BLOCKS.TOOLBAR, 'field-selector-group', 'gantt'),
			label: bem(BLOCKS.TOOLBAR, 'field-selector-label'),
			select: bem(BLOCKS.TOOLBAR, 'field-selector-select'),
			dualWrapper: bem(BLOCKS.TOOLBAR, 'field-selector-dual-wrapper'),
			dualWrapperGantt: bem(BLOCKS.TOOLBAR, 'field-selector-dual-wrapper', 'gantt'),
		},

		/** 导航按钮组 */
		navButtons: {
			group: bem(BLOCKS.TOOLBAR, 'nav-buttons'),
			btn: bem(BLOCKS.TOOLBAR, 'btn'),
		},

		/** 视图选择器 */
		viewSelector: {
			group: bem(BLOCKS.TOOLBAR, 'view-selector'),
		},

		/** 6视图按钮组 */
		viewSelectorGroup: {
			group: bem(BLOCKS.TOOLBAR, 'view-selector-group'),
			iconOnly: bem(BLOCKS.TOOLBAR, 'view-selector-group', 'icon-only'),
			btn: bem(BLOCKS.TOOLBAR, 'view-selector-btn'),
			btnActive: bem(BLOCKS.TOOLBAR, 'view-selector-btn', 'active'),
			icon: bem(BLOCKS.TOOLBAR, 'view-selector-icon'),
			label: bem(BLOCKS.TOOLBAR, 'view-selector-label'),
		},

		/** 通用按钮组 */
		buttonGroup: {
			group: bem(BLOCKS.TOOLBAR, 'button-group'),
			horizontal: bem(BLOCKS.TOOLBAR, 'button-group', 'horizontal'),
			vertical: bem(BLOCKS.TOOLBAR, 'button-group', 'vertical'),
		},

		/** 输入组 */
		inputGroup: {
			group: bem(BLOCKS.TOOLBAR, 'input-group'),
		},

		/** 模式切换组 */
		modeToggle: {
			group: bem(BLOCKS.TOOLBAR, 'mode-toggle-group'),
			icon: bem(BLOCKS.TOOLBAR, 'mode-icon'),
			label: bem(BLOCKS.TOOLBAR, 'mode-label'),
		},

		/** 日期范围筛选器 */
		dateFilter: {
			group: bem(BLOCKS.TOOLBAR, 'date-filter-group'),
			input: bem(BLOCKS.TOOLBAR, 'date-input'),
			modeBtn: bem(BLOCKS.TOOLBAR, 'date-mode-btn'),
			label: bem(BLOCKS.TOOLBAR, 'date-filter-label'),
		},

		/** 字段筛选组 */
		fieldFilter: {
			group: bem(BLOCKS.TOOLBAR, 'field-filter-group'),
		},
	},
};


/**
 * 创建任务弹窗类名常量
 */
export const CreateTaskModalClasses = {
	block: bem(BLOCKS.CREATE_TASK_MODAL),

	elements: {
		form: bem(BLOCKS.CREATE_TASK_MODAL, 'form'),
		field: bem(BLOCKS.CREATE_TASK_MODAL, 'field'),
		label: bem(BLOCKS.CREATE_TASK_MODAL, 'label'),
		input: bem(BLOCKS.CREATE_TASK_MODAL, 'input'),
		textarea: bem(BLOCKS.CREATE_TASK_MODAL, 'textarea'),
		tagsContainer: bem(BLOCKS.CREATE_TASK_MODAL, 'tags-container'),
		tagItem: bem(BLOCKS.CREATE_TASK_MODAL, 'tag-item'),
		tagItemSelected: bem(BLOCKS.CREATE_TASK_MODAL, 'tag-item', 'selected'),
		tagInput: bem(BLOCKS.CREATE_TASK_MODAL, 'tag-input'),
		buttons: bem(BLOCKS.CREATE_TASK_MODAL, 'buttons'),
	},
};

/**
 * 创建任务按钮类名常量
 */
export const CreateTaskButtonClasses = {
	block: bem(BLOCKS.CREATE_TASK_BUTTON),
	modifiers: {
		toolbar: bem(BLOCKS.CREATE_TASK_BUTTON, undefined, 'toolbar'),
	},
};

/**
 * 编辑任务弹窗类名常量
 */
export const EditTaskModalClasses = {
	block: bem(BLOCKS.EDIT_TASK_MODAL),

	elements: {
		container: bem(BLOCKS.EDIT_TASK_MODAL, 'container'),
		title: bem(BLOCKS.EDIT_TASK_MODAL, 'title'),
		section: bem(BLOCKS.EDIT_TASK_MODAL, 'section'),
		sectionLabel: bem(BLOCKS.EDIT_TASK_MODAL, 'section-label'),
		sectionHint: bem(BLOCKS.EDIT_TASK_MODAL, 'section-hint'),

		// 任务描述板块
		descContainer: bem(BLOCKS.EDIT_TASK_MODAL, 'desc-container'),
		descTextarea: bem(BLOCKS.EDIT_TASK_MODAL, 'desc-textarea'),

		// 优先级板块
		priorityContainer: bem(BLOCKS.EDIT_TASK_MODAL, 'priority-container'),
		priorityGrid: bem(BLOCKS.EDIT_TASK_MODAL, 'priority-grid'),
		priorityBtn: bem(BLOCKS.EDIT_TASK_MODAL, 'priority-btn'),
		priorityBtnSelected: bem(BLOCKS.EDIT_TASK_MODAL, 'priority-btn', 'selected'),

		// 日期设置板块
		datesContainer: bem(BLOCKS.EDIT_TASK_MODAL, 'dates-container'),
		datesGrid: bem(BLOCKS.EDIT_TASK_MODAL, 'dates-grid'),
		dateItem: bem(BLOCKS.EDIT_TASK_MODAL, 'date-item'),
		dateLabel: bem(BLOCKS.EDIT_TASK_MODAL, 'date-label'),
		dateInputContainer: bem(BLOCKS.EDIT_TASK_MODAL, 'date-input-container'),
		dateInput: bem(BLOCKS.EDIT_TASK_MODAL, 'date-input'),
		dateClear: bem(BLOCKS.EDIT_TASK_MODAL, 'date-clear'),

		// 标签选择器板块
		tagsSection: bem(BLOCKS.EDIT_TASK_MODAL, 'tags-section'),

		// 按钮
		buttons: bem(BLOCKS.EDIT_TASK_MODAL, 'buttons'),
	},
};

/**
 * 年视图类名常量
 */
export const YearViewClasses = {
	block: bem(BLOCKS.YEAR_VIEW),

	/** Elements */
	elements: {
		months: bem(BLOCKS.YEAR_VIEW, 'months'),
		monthCard: bem(BLOCKS.YEAR_VIEW, 'month-card'),
		monthHeader: bem(BLOCKS.YEAR_VIEW, 'month-header'),
		weekdays: bem(BLOCKS.YEAR_VIEW, 'weekdays'),
		weekday: bem(BLOCKS.YEAR_VIEW, 'weekday'),
		daysGrid: bem(BLOCKS.YEAR_VIEW, 'days-grid'),
		day: bem(BLOCKS.YEAR_VIEW, 'day'),
		dayNumber: bem(BLOCKS.YEAR_VIEW, 'day-number'),
		lunarText: bem(BLOCKS.YEAR_VIEW, 'lunar-text'),
		taskCount: bem(BLOCKS.YEAR_VIEW, 'task-count'),
	},

	/** Modifiers */
	modifiers: {
		showLunar: bem(BLOCKS.YEAR_VIEW, undefined, 'show-lunar'),
	},
};

/**
 * 月视图类名常量
 */
export const MonthViewClasses = {
	block: bem(BLOCKS.MONTH_VIEW),

	/** Elements */
	elements: {
		weekdays: bem(BLOCKS.MONTH_VIEW, 'weekdays'),
		weekday: bem(BLOCKS.MONTH_VIEW, 'weekday'),
		weeks: bem(BLOCKS.MONTH_VIEW, 'weeks'),
		weekRow: bem(BLOCKS.MONTH_VIEW, 'week-row'),
		weekNumber: bem(BLOCKS.MONTH_VIEW, 'week-number'),
		weekDays: bem(BLOCKS.MONTH_VIEW, 'week-days'),
		dayCell: bem(BLOCKS.MONTH_VIEW, 'day-cell'),
		dayHeader: bem(BLOCKS.MONTH_VIEW, 'day-header'),
		dayHeaderSeparator: bem(BLOCKS.MONTH_VIEW, 'day-header-separator'),
		dayNumber: bem(BLOCKS.MONTH_VIEW, 'day-number'),
		lunarText: bem(BLOCKS.MONTH_VIEW, 'lunar-text'),
		tasks: bem(BLOCKS.MONTH_VIEW, 'tasks'),
		taskItem: bem(BLOCKS.MONTH_VIEW, 'task-item'),
		taskMore: bem(BLOCKS.MONTH_VIEW, 'task-more'),
	},

	/** Modifiers */
	modifiers: {
		outsideMonth: bem(BLOCKS.MONTH_VIEW, 'day-cell', 'outside-month'),
		today: bem(BLOCKS.MONTH_VIEW, 'day-cell', 'today'),
		festival: bem(BLOCKS.MONTH_VIEW, 'lunar-text', 'festival'),
		festivalSolar: bem(BLOCKS.MONTH_VIEW, 'lunar-text', 'festival-solar'),
		festivalLunar: bem(BLOCKS.MONTH_VIEW, 'lunar-text', 'festival-lunar'),
		festivalSolarTerm: bem(BLOCKS.MONTH_VIEW, 'lunar-text', 'festival-solar-term'),
	},
};

/**
 * 周视图类名常量
 */
export const WeekViewClasses = {
	block: bem(BLOCKS.WEEK_VIEW),

	/** Elements */
	elements: {
		grid: bem(BLOCKS.WEEK_VIEW, 'grid'),
		headerRow: bem(BLOCKS.WEEK_VIEW, 'header-row'),
		headerCell: bem(BLOCKS.WEEK_VIEW, 'header-cell'),
		dayName: bem(BLOCKS.WEEK_VIEW, 'day-name'),
		dayNumber: bem(BLOCKS.WEEK_VIEW, 'day-number'),
		lunarText: bem(BLOCKS.WEEK_VIEW, 'lunar-text'),
		tasksGrid: bem(BLOCKS.WEEK_VIEW, 'tasks-grid'),
		tasksColumn: bem(BLOCKS.WEEK_VIEW, 'tasks-column'),
		empty: bem(BLOCKS.WEEK_VIEW, 'empty'),
	},

	/** Modifiers */
	modifiers: {
		today: bem(BLOCKS.WEEK_VIEW, 'header-cell', 'today'),
		tasksColumnToday: bem(BLOCKS.WEEK_VIEW, 'tasks-column', 'today'),
	},
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
