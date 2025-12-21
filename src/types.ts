// 日历视图类型定义

export type CalendarViewType = 'year' | 'month' | 'week' | 'day' | 'task' | 'gantt';

// 甘特图时间颗粒度类型
export type GanttTimeGranularity = 'day' | 'week' | 'month';

export interface CalendarDate {
	year: number;
	month: number; // 1-12
	day: number;
	date: Date;
}

export interface CalendarDay {
	date: Date;
	day: number;
	isCurrentMonth: boolean;
	isToday: boolean;
	weekday: number; // 0-6, 0 = Sunday
	lunarText?: string; // 农历显示文本
	festival?: string; // 节日名称
	festivalType?: 'solar' | 'lunar' | 'solarTerm'; // 节日类型：阳历、农历、节气
}

export interface CalendarWeek {
	weekNumber: number;
	days: CalendarDay[];
	startDate: Date;
	endDate: Date;
}

export interface CalendarMonth {
	year: number;
	month: number;
	weeks: CalendarWeek[];
	days: CalendarDay[];
}

// 任务类型：供 TaskView/CalendarView/任务解析共享
export interface GanttTask {
	filePath: string;
	fileName: string;
	lineNumber: number;
	content: string;
	completed: boolean;
	// 源格式：'tasks' | 'dataview'（用于写回时选择字段样式）
	format?: 'tasks' | 'dataview';
	priority?: string; // highest, high, medium, low, lowest
	createdDate?: Date;
	startDate?: Date;
	scheduledDate?: Date;
	dueDate?: Date;
	cancelledDate?: Date;
	completionDate?: Date;
	// 警告信息：用于显示任务格式问题或缺失属性
	warning?: string;
}
