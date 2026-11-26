/**
 * 甘特图模块
 *
 * 导出所有甘特图相关的类型、类和工具函数
 */

// 类型定义
export * from './types';

// 数据适配器与共享日期解析
export { TaskDataAdapter } from './adapters/taskDataAdapter';
export {
	resolveGanttStartDate,
	resolveGanttTaskDateRange,
	type ResolvedGanttStart,
	type ResolvedGanttDateRange,
} from './dateRangeResolver';

// 甘特图适配器和 SVG 渲染器
export { GanttChartAdapter, SvgGanttRenderer } from './wrappers/ganttChartAdapter';

// 任务更新处理器
export { TaskUpdateHandler } from './handlers/taskUpdateHandler';

// 树形甘特图构建与展平纯函数模块
export {
	buildGanttTree,
	flattenGanttTree,
	collectCollapsibleNodeIds,
	collectCollapseToFileLevelIds,
	formatLocalDateStr,
	normalizeVaultPath,
} from './treeBuilder';
