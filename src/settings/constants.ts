import type { GanttCalendarSettings } from './types';
import { DEFAULT_TASK_STATUSES, PRESET_CUSTOM_STATUSES } from '../tasks/taskStatus';
import { i18n } from '../i18n/i18n';

/**
 * Gantt Calendar Plugin 默认设置
 */
export const DEFAULT_SETTINGS: GanttCalendarSettings = {
	startOnMonday: true,
	showLunar: true,
	showFestivals: true,
	yearLunarFontSize: 10,
	monthLunarFontSize: 10,
	solarFestivalColor: '#e74c3c',  // 阳历节日 - 红色
	lunarFestivalColor: '#e8a041',  // 农历节日 - 橙色
	solarTermColor: '#52c41a',      // 节气 - 绿色
	globalTaskFilter: '🎯 ',        // 全局任务筛选标记
	enabledTaskFormats: ['tasks'], // 启用的任务格式
	showGlobalFilterInTaskText: true, // 默认显示 global filter
	dateFilterField: 'dueDate', // 默认使用截止日期作为筛选字段
	enableDailyNote: true, // 默认在日视图中显示 Daily Note
	dayViewLayout: 'horizontal', // 默认水平（左右分屏）布局
	dailyNotePath: 'DailyNotes', // 默认 daily note 文件夹路径
	dailyNoteNameFormat: 'yyyy-MM-dd', // 默认文件名格式
	followObsidianDailyNote: false, // 默认不跟随 Obsidian 日记设置
	monthViewTaskLimit: 3, // 默认每天显示5个任务
	yearShowTaskCount: true,
	yearHeatmapEnabled: true,
	yearHeatmapPalette: 'blue',
	yearHeatmap3DEnabled: 2,
	taskNotePath: 'Tasks', // 默认任务笔记文件夹路径
	taskStatuses: [...DEFAULT_TASK_STATUSES, ...PRESET_CUSTOM_STATUSES], // 默认任务状态 + 预设自定义状态
	taskSortField: 'dueDate', // 默认排序字段：截止日期
	taskSortOrder: 'asc', // 默认排序顺序：升序
	defaultView: 'month', // 默认视图：月视图
	newTaskHeading: undefined, // 默认添加到文件末尾
	dailyNoteTemplatePath: '',
	defaultTaskPriority: 'medium', // 默认中等优先级
	enableDebugMode: false, // 默认关闭开发者模式
	showViewNavButtonText: true, // 默认显示视图导航按钮文本
	timezoneOffset: null, // 默认跟随系统时区
	timeFormat: '24h', // 默认24小时制
			recurringTaskDisplayLimit: 5, // 默认显示5个虚拟实例
		language: 'system', // 默认跟随系统语言

	// ========== 持久化筛选和排序状态默认值 ==========

	// TaskView
	taskViewSortField: 'dueDate',
	taskViewSortOrder: 'asc',
	taskViewSelectedStatuses: ['todo'],
	taskViewSelectedTags: [],
	taskViewTagOperator: 'OR',
	taskViewTimeFieldFilter: 'dueDate',
	taskViewDateRangeMode: 'week',

	// DayView
	dayViewSortField: 'dueDate',
	dayViewSortOrder: 'asc',
	dayViewSelectedStatuses: ['todo'],
	dayViewSelectedTags: [],
	dayViewTagOperator: 'OR',

	// WeekView
	weekViewSortField: 'priority',
	weekViewSortOrder: 'desc',
	weekViewSelectedStatuses: ['todo'],
	weekViewSelectedTags: [],
	weekViewTagOperator: 'OR',
	// WeekView 卡片显示控制
	weekViewShowCheckbox: true,
	weekViewShowTags: false,
	weekViewShowPriority: false,
	weekViewShowTicktick: false,

	// MonthView
	monthViewSortField: 'dueDate',
	monthViewSortOrder: 'asc',
	monthViewSelectedStatuses: ['todo'],
	monthViewSelectedTags: [],
	monthViewTagOperator: 'OR',
	// MonthView 卡片显示控制
	monthViewShowCheckbox: true,
	monthViewShowTags: false,
	monthViewShowPriority: false,
	monthViewShowTicktick: false,

	// 侧边栏卡片显示控制
	sidebarShowCheckbox: true,
	sidebarShowTags: false,
	sidebarShowPriority: false,
	sidebarShowTicktick: false,
	sidebarShowFileLocation: false,
	sidebarShowDueDate: false,

	// YearView
	yearViewSelectedTags: [],
	yearViewTagOperator: 'OR',

	// ========== 甘特图设置 ==========

	ganttStartField: 'startDate',  // 默认使用开始日期
	ganttEndField: 'dueDate',      // 默认使用截止日期
};

/**
 * 热力图色卡配置
 */
export const HEATMAP_PALETTES = {
	blue: {
		key: 'blue' as const,
		label: i18n.t('settings.heatmapPalettes.blue'),
		colors: [
			'rgb(212, 228, 253)',
			'rgb(177, 205, 251)',
			'rgb(141, 183, 250)',
			'rgb(106, 160, 248)',
			'rgb(59, 130, 246)'
		]
	},
	green: {
		key: 'green' as const,
		label: i18n.t('settings.heatmapPalettes.green'),
		colors: [
			'rgb(206, 242, 220)',
			'rgb(167, 232, 191)',
			'rgb(127, 221, 162)',
			'rgb(87, 211, 133)',
			'rgb(34, 197, 94)'
		]
	},
	red: {
		key: 'red' as const,
		label: i18n.t('settings.heatmapPalettes.red'),
		colors: [
			'rgb(251, 214, 214)',
			'rgb(249, 180, 180)',
			'rgb(246, 147, 147)',
			'rgb(243, 113, 113)',
			'rgb(239, 68, 68)'
		]
	},
	purple: {
		key: 'purple' as const,
		label: i18n.t('settings.heatmapPalettes.purple'),
		colors: [
			'rgb(236, 218, 253)',
			'rgb(220, 187, 252)',
			'rgb(205, 156, 250)',
			'rgb(189, 126, 249)',
			'rgb(168, 85, 247)'
		]
	},
	orange: {
		key: 'orange' as const,
		label: i18n.t('settings.heatmapPalettes.orange'),
		colors: [
			'rgb(254, 224, 204)',
			'rgb(253, 199, 162)',
			'rgb(252, 174, 120)',
			'rgb(250, 149, 78)',
			'rgb(249, 115, 22)'
		]
	},
	cyan: {
		key: 'cyan' as const,
		label: i18n.t('settings.heatmapPalettes.cyan'),
		colors: [
			'rgb(200, 239, 246)',
			'rgb(155, 226, 238)',
			'rgb(111, 213, 230)',
			'rgb(66, 200, 222)',
			'rgb(6, 182, 212)'
		]
	},
	pink: {
		key: 'pink' as const,
		label: i18n.t('settings.heatmapPalettes.pink'),
		colors: [
			'rgb(251, 215, 233)',
			'rgb(247, 182, 214)',
			'rgb(244, 149, 196)',
			'rgb(241, 116, 177)',
			'rgb(236, 72, 153)'
		]
	},
	yellow: {
		key: 'yellow' as const,
		label: i18n.t('settings.heatmapPalettes.yellow'),
		colors: [
			'rgb(250, 238, 201)',
			'rgb(247, 225, 156)',
			'rgb(243, 211, 112)',
			'rgb(239, 197, 67)',
			'rgb(234, 179, 8)'
		]
	}
};

/**
 * 预设节日颜色
 */
export const PRESET_FESTIVAL_COLORS = [
	'#e74c3c', '#e8a041', '#52c41a', '#2196F3', '#9C27B0', '#FF5722', '#00BCD4'
];
