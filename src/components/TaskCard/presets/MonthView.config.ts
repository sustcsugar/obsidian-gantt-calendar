import type { TaskCardConfig } from '../TaskCardConfig';

/**
 * 月视图预设配置
 * 最简化版本，空间有限
 */
export const MonthViewConfig: TaskCardConfig = {
	// 基础配置
	viewModifier: 'month',

	// 元素显示控制
	showCheckbox: true,
	showDescription: true,
	showTags: true,
	showPriority: false,        // 月视图空间有限，不显示优先级
	showFileLocation: false,
	showWarning: false,         // 月视图不显示警告
	showGlobalFilter: false,

	// 时间属性配置
	showTimes: false,

	// 交互功能
	enableTooltip: true,
	enableDrag: true,
	clickable: true,

	// 样式配置
	compact: true,              // 紧凑模式
	maxLines: 1,                // 限制为单行显示
};
