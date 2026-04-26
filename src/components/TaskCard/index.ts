/**
 * 任务卡片统一组件
 *
 * 提供可配置的任务卡片渲染，支持不同视图的需求
 *
 * @example
 * ```ts
 * import { TaskCardComponent } from '@/components/TaskCard';
 * import { TaskViewConfig } from '@/components/TaskCard/presets/TaskView.config';
 *
 * const component = new TaskCardComponent({
 *     task,
 *     config: TaskViewConfig,
 *     container,
 *     app: this.app,
 *     plugin: this.plugin,
 *     onClick: (task) => this.openTaskFile(task),
 * });
 * component.render();
 * ```
 */

// 主组件
export { TaskCardComponent } from './TaskCard';

// 渲染器
export { TaskCardRenderer } from './TaskCardRenderer';

// 类型定义
export type { TaskCardConfig, TaskCardProps, TaskCardRenderResult, TimeFieldConfig, ViewModifier } from './TaskCardConfig';

// 预设配置
export { TaskViewConfig } from './presets/TaskView.config';
export { DayViewConfig } from './presets/DayView.config';
export { WeekViewConfig } from './presets/WeekView.config';
export { MonthViewConfig } from './presets/MonthView.config';
export { GanttViewConfig } from './presets/GanttView.config';
export { SidebarViewConfig, buildSidebarConfig } from './presets/SidebarView.config';
