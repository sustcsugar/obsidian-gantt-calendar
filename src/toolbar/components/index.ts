/**
 * @fileoverview 工具栏组件统一导出
 * @module toolbar/components
 */

// === 基础组件 ===
export {
	renderButtonGroup,
	renderNavButtonGroup,
	type ButtonGroupOptions,
	type ButtonConfig,
	type NavButtonGroupOptions
} from './button-group';

export {
	renderInputGroup,
	renderNumberInputGroup,
	type InputGroupOptions,
	type InputWithUnitOptions
} from './input-group';

export {
	renderModeToggleGroup,
	renderViewSwitcher,
	type ModeToggleGroupOptions,
	type ModeOption,
	type ViewSwitcherOptions
} from './mode-toggle-group';

// === 功能组件（移动后导出） ===
export { renderRefreshButton } from './refresh-button';
export { renderSortButton, type SortButtonOptions } from './sort-button';
export { renderStatusFilterButton, type StatusFilterButtonOptions } from './status-filter';
export { renderTagFilterButton, type TagFilterOptions } from './tag-filter';
export { renderTimeGranularity, type TimeGranularityOptions as LegacyTimeGranularityOptions } from './time-granularity';
export { renderGanttScrollButtons, type GanttScrollButtonsOptions } from './gantt-scroll-buttons';

// === 组合组件 ===
export {
	renderNavButtons,
	renderNavButtonsFull,
	type NavButtonsOptions,
	type NavButtonsFullOptions
} from './nav-buttons';

export {
	renderCalendarViewSwitcher,
	renderSimpleViewSwitcher,
	type CalendarViewSwitcherOptions,
	type SimpleViewSwitcherOptions
} from './calendar-view-switcher';

export {
	renderDateRangeFilter,
	type DateRangeFilterOptions,
	type DateRangeState,
	type DateRangeType
} from './date-range-filter';

export {
	renderFieldSelector,
	renderDualFieldSelector,
	renderGanttFieldSelector,
	type FieldSelectorOptions,
	type DualFieldSelectorOptions,
	type GanttFieldSelectorOptions,
	type DateFieldType,
	type DateFieldOption,
	DEFAULT_DATE_FIELD_OPTIONS
} from './field-selector';
