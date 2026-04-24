import type GanttCalendarPlugin from '../../main';
import type { SortField, SortOrder, TagFilterOperator } from '../types';
import type { TaskStatus } from '../tasks/taskStatus';

/**
 * 日期字段类型
 */
export type DateFieldType = 'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'completionDate' | 'cancelledDate';

/**
 * Gantt Calendar Plugin Settings Interface
 */
export interface GanttCalendarSettings {
	mySetting: string;
	startOnMonday: boolean;
	yearLunarFontSize: number;
	solarFestivalColor: string;
	lunarFestivalColor: string;
	solarTermColor: string;
	globalTaskFilter: string;
	enabledTaskFormats: string[];
	showGlobalFilterInTaskText: boolean; // 是否在任务列表文本中显示 global filter 前缀
	dateFilterField: 'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'completionDate' | 'cancelledDate'; // 日历视图的筛选字段，任务视图的初始字段
	enableDailyNote: boolean; // 是否在日视图中显示 Daily Note
	dayViewLayout: 'horizontal' | 'vertical'; // 日视图布局：水平（左右分屏）或垂直（上下分屏）
	dailyNotePath: string; // Daily note 文件夹路径
	dailyNoteNameFormat: string; // Daily note 文件名格式 (如 yyyy-MM-dd)
	followObsidianDailyNote: boolean; // 是否跟随 Obsidian 核心/Periodic Notes 插件的日记设置
	monthViewTaskLimit: number; // 月视图每天显示的最大任务数量
	yearShowTaskCount: boolean; // 年视图是否显示每日任务数量
	yearHeatmapEnabled: boolean; // 年视图是否启用任务热力图
	yearHeatmapPalette: 'blue' | 'green' | 'red' | 'purple' | 'orange' | 'cyan' | 'pink' | 'yellow'; // 热力图色卡选择
	yearHeatmap3DEnabled: 0 | 1 | 2; // 年视图热力图3D效果：0=关闭，1=轻微突起，2=明显突起
	taskNotePath: string; // 任务笔记默认文件夹路径
	taskStatuses: TaskStatus[]; // 任务状态配置（包含颜色）
	taskSortField: SortField; // 任务排序字段
	taskSortOrder: SortOrder; // 任务排序顺序
	defaultView: 'day' | 'week' | 'month' | 'year' | 'task' | 'gantt'; // 默认视图
	newTaskHeading?: string; // 新任务插入的标题（留空则添加到文件末尾）
	dailyNoteTemplatePath: string;
	defaultTaskPriority: 'highest' | 'high' | 'medium' | 'low' | 'lowest' | 'normal'; // 默认任务优先级
	enableDebugMode: boolean; // 是否启用开发者模式（详细日志）
	showViewNavButtonText: boolean; // 是否显示视图导航按钮文本
	timezoneOffset: number | null; // 时区偏移量（分钟），null 表示跟随系统
	timeFormat: '24h' | '12h'; // 时间显示格式
	recurringTaskDisplayLimit: number; // 周期任务虚拟实例显示数量上限

	// ========== 持久化筛选和排序状态 ==========

	// TaskView 状态
	taskViewSortField: SortField;
	taskViewSortOrder: SortOrder;
	taskViewSelectedStatuses: string[];
	taskViewSelectedTags: string[];
	taskViewTagOperator: TagFilterOperator;
	taskViewTimeFieldFilter: DateFieldType;
	taskViewDateRangeMode: 'all' | 'day' | 'week' | 'month' | 'custom';

	// DayView 状态
	dayViewSortField: SortField;
	dayViewSortOrder: SortOrder;
	dayViewSelectedStatuses: string[];
	dayViewSelectedTags: string[];
	dayViewTagOperator: TagFilterOperator;

	// WeekView 状态
	weekViewSortField: SortField;
	weekViewSortOrder: SortOrder;
	weekViewSelectedStatuses: string[];
	weekViewSelectedTags: string[];
	weekViewTagOperator: TagFilterOperator;
	// WeekView 卡片显示控制
	weekViewShowCheckbox: boolean;
	weekViewShowTags: boolean;
	weekViewShowPriority: boolean;
		weekViewShowTicktick: boolean;

	// MonthView 状态
	monthViewSelectedStatuses: string[];
	monthViewSelectedTags: string[];
	monthViewTagOperator: TagFilterOperator;
	// MonthView 卡片显示控制
	monthViewShowCheckbox: boolean;
	monthViewShowTags: boolean;
	monthViewShowPriority: boolean;
		monthViewShowTicktick: boolean;

	// YearView 状态
	yearViewSelectedTags: string[];
	yearViewTagOperator: TagFilterOperator;

	// ========== 甘特图设置 ==========

	ganttStartField: DateFieldType;  // 甘特图开始时间字段
	ganttEndField: DateFieldType;    // 甘特图结束时间字段

	// ========== 同步设置 ==========
	syncConfiguration?: {
		enabledSources: {
			api?: boolean;
			caldav?: boolean;
		};
		syncDirection: 'bidirectional' | 'import-only' | 'export-only';
		syncInterval: number;
		conflictResolution: 'local-win' | 'remote-win' | 'newest-win' | 'manual';
		api?: {
			provider: 'feishu' | 'microsoft-todo' | 'custom';
			apiKey?: string;
			endpoint?: string;

			// OAuth 配置
			clientId?: string;           // App ID (用于 OAuth)
			clientSecret?: string;       // App Secret (用于 OAuth)
			redirectUri?: string;        // OAuth 回调地址

			// Token
			accessToken?: string;
			refreshToken?: string;
			tokenExpireAt?: number;      // token 过期时间戳

			// 用户信息
			userId?: string;
			userName?: string;

			// 旧字段保留兼容（飞书）
			appId?: string;
			appSecret?: string;
			tenantId?: string;
		};
		caldav?: {
			provider: 'google' | 'outlook' | 'apple' | 'custom';
			url?: string;
			username?: string;
			password?: string;
			clientId?: string;
			clientSecret?: string;
			redirectUri?: string;
			accessToken?: string;
			refreshToken?: string;
		};
		fieldMergeRules?: Array<{
			field: 'description' | 'completed' | 'dueDate' | 'startDate' | 'priority' | 'status' | 'tags';
			winner: 'local' | 'remote' | 'newest';
		}>;
	};
}

/**
 * 构建器配置接口
 */
export interface BuilderConfig {
	containerEl: HTMLElement;
	plugin: GanttCalendarPlugin;
	onRefreshSettings?: () => void; // 刷新设置面板的回调函数
}

/**
 * 颜色设置配置接口
 */
export interface ColorSettingConfig {
	name: string;
	description: string;
	settingKey: keyof GanttCalendarSettings;
}

/**
 * 颜色选择器配置接口
 */
export interface ColorPickerConfig {
	container: HTMLElement;
	name: string;
	description: string;
	currentColor: string;
	presetColors: string[];
	onColorChange: (color: string) => Promise<void> | void;
}

/**
 * 热力图色卡配置接口
 */
export interface HeatmapPalette {
	key: 'blue' | 'green' | 'red' | 'purple' | 'orange' | 'cyan' | 'pink' | 'yellow';
	label: string;
	colors: string[];
}
