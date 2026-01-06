// 类型定义
export type { GanttCalendarSettings } from './types';

// 常量
export { DEFAULT_SETTINGS } from './constants';

// 主设置标签
export { GanttCalendarSettingTab } from './SettingTab';

// 可选：按需导出构建器（供扩展使用）
export { BaseBuilder } from './builders/BaseBuilder';
export { TaskViewSettingsBuilder } from './builders/TaskViewSettingsBuilder';
export { CalendarViewSettingsBuilder } from './builders/CalendarViewSettingsBuilder';
export { FestivalColorBuilder } from './builders/FestivalColorBuilder';
export { DayViewSettingsBuilder } from './builders/DayViewSettingsBuilder';
export { MonthViewSettingsBuilder } from './builders/MonthViewSettingsBuilder';
export { YearViewSettingsBuilder } from './builders/YearViewSettingsBuilder';
export { TaskStatusSettingsBuilder } from './builders/TaskStatusSettingsBuilder';

// 可选：导出组件（供外部扩展使用）
export { ColorPicker } from './components/ColorPicker';
export { MacaronColorPicker } from './components/MacaronColorPicker';
export { HeatmapPalettePicker } from './components/HeatmapPalettePicker';
export { TaskStatusCard } from './components/TaskStatusCard';

// 可选：导出模态框
export { AddCustomStatusModal } from './modals/AddCustomStatusModal';
