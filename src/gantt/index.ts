/**
 * Frappe Gantt 集成模块
 *
 * 导出所有 Frappe Gantt 相关的类型、类和工具函数
 */

// 类型定义
export * from './types';

// 数据适配器
export { TaskDataAdapter } from './adapters/taskDataAdapter';

// Frappe Gantt 包装器和 SVG 渲染器
export { FrappeGanttWrapper, SvgGanttRenderer } from './wrappers/frappeGanttWrapper';

// 任务更新处理器
export { TaskUpdateHandler } from './handlers/taskUpdateHandler';
