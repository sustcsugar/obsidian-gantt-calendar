import type { TaskCardConfig } from '../TaskCardConfig';
import type { GanttCalendarSettings } from '../../../settings/types';

/**
 * 侧边栏视图预设配置（默认值）
 * 紧凑显示，适合侧边栏窄空间
 */
export const SidebarViewConfig: TaskCardConfig = {
	// 基础配置
	viewModifier: 'sidebar',

	// 元素显示控制
	showCheckbox: true,
	showDescription: true,
	showTags: true,
	showPriority: true,
	showFileLocation: false,
	showWarning: false,
	showTicktick: false,
	showGlobalFilter: false,

	// 时间属性配置
	showTimes: true,
	timeFields: {
		showCreated: false,
		showStart: false,
		showScheduled: false,
		showDue: true,
		showCancelled: false,
		showCompletion: false,
		showOverdueIndicator: true,
	},

	// 交互功能
	enableTooltip: true,
	enableDrag: true,
	clickable: true,

	// 样式配置
	compact: true,
	maxLines: 2,
};

/**
 * 根据用户设置动态生成侧边栏 TaskCard 配置
 */
export function buildSidebarConfig(settings: GanttCalendarSettings): TaskCardConfig {
	return {
		viewModifier: 'sidebar',
		showCheckbox: settings.sidebarShowCheckbox,
		showDescription: true,
		showTags: settings.sidebarShowTags,
		showPriority: settings.sidebarShowPriority,
		showFileLocation: settings.sidebarShowFileLocation,
		showWarning: false,
		showTicktick: settings.sidebarShowTicktick,
		showGlobalFilter: false,
		showTimes: settings.sidebarShowDueDate,
		timeFields: {
			showCreated: false,
			showStart: false,
			showScheduled: false,
			showDue: settings.sidebarShowDueDate,
			showCancelled: false,
			showCompletion: false,
			showOverdueIndicator: true,
		},
		enableTooltip: true,
		enableDrag: true,
		clickable: true,
		compact: true,
		maxLines: 2,
	};
}
