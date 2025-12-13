// 日历视图类型定义

export type CalendarViewType = 'year' | 'month' | 'week' | 'day';

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
