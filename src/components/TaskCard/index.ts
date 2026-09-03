/**
 * 任务卡片配置与预设
 *
 * React 版 TaskCard 位于 src/ui/components/TaskCard.tsx，
 * 本模块仅保留类型定义与各视图预设配置。
 */

// 类型定义
export type { TaskCardConfig, TaskCardProps, TaskCardRenderResult, TimeFieldConfig, ViewModifier, CardVariant } from './TaskCardConfig';

// 预设配置
export { TaskViewConfig } from './presets/TaskView.config';
export { DayViewConfig } from './presets/DayView.config';
export { WeekViewConfig } from './presets/WeekView.config';
export { MonthViewConfig } from './presets/MonthView.config';
export { SidebarViewConfig, buildSidebarConfig } from './presets/SidebarView.config';
