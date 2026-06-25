/**
 * Calendar Generator Module
 *
 * 月历数据生成器，负责生成完整的月度日历数据结构。
 *
 * 主要功能：
 * - 生成指定年月的日历数据（6周 × 7天 = 42天）
 * - 集成中国农历转换和节日信息
 * - 支持周一或周日作为每周的起始日
 * - 自动填充上个月和下个月的日期以补全日历网格
 * - 标记今天和当前月份的日期
 * - 按周组织日期数据并计算周数
 *
 * 数据结构：
 * - CalendarMonth: 包含年月、所有天数、按周分组的数据
 * - CalendarWeek: 包含周数、起始/结束日期、该周的所有天数
 * - CalendarDay: 包含日期、星期、农历信息、节日等
 *
 * 使用场景：
 * - 月视图渲染
 * - 周视图数据准备
 * - 日历导航和日期选择
 *
 * @module calendar/calendarGenerator
 */

import { CalendarDay, CalendarMonth, CalendarWeek } from '../types';
import { solarToLunar, getShortLunarText } from '../lunar/lunar';
import { getDaysInMonth, getFirstDayOfMonth } from '../dateUtils/format';
import { getWeekNumber } from '../dateUtils/week';
import { isToday } from '../dateUtils/dateCompare';

/**
 * Generate month calendar data with lunar information
 */
export function generateMonthCalendar(year: number, month: number, startOnMonday: boolean = true): CalendarMonth {
	const daysInMonth = getDaysInMonth(year, month);
	const firstDay = getFirstDayOfMonth(year, month);
	const days: CalendarDay[] = [];

	// Add trailing days from previous month
	const prevMonth = month === 1 ? 12 : month - 1;
	const prevYear = month === 1 ? year - 1 : year;
	const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);

	// Calculate lead days based on start day
	const leadDays = startOnMonday ? ((firstDay + 6) % 7) : firstDay;

	for (let i = leadDays - 1; i >= 0; i--) {
		const day = daysInPrevMonth - i;
		const date = new Date(prevYear, prevMonth - 1, day);
		const lunarInfo = solarToLunar(date);
		days.push({
			date,
			day,
			isCurrentMonth: false,
			isToday: isToday(date),
			weekday: date.getDay(),
			lunarText: getShortLunarText(date),
			festival: lunarInfo.festival,
			festivalType: lunarInfo.festivalType,
		});
	}

	// Add current month days
	for (let day = 1; day <= daysInMonth; day++) {
		const date = new Date(year, month - 1, day);
		const lunarInfo = solarToLunar(date);
		days.push({
			date,
			day,
			isCurrentMonth: true,
			isToday: isToday(date),
			weekday: date.getDay(),
			lunarText: getShortLunarText(date),
			festival: lunarInfo.festival,
			festivalType: lunarInfo.festivalType,
		});
	}

	// Add leading days from next month
	const remainingDays = 42 - days.length; // 6 weeks * 7 days
	const nextMonth = month === 12 ? 1 : month + 1;
	const nextYear = month === 12 ? year + 1 : year;

	for (let day = 1; day <= remainingDays; day++) {
		const date = new Date(nextYear, nextMonth - 1, day);
		const lunarInfo = solarToLunar(date);
		days.push({
			date,
			day,
			isCurrentMonth: false,
			isToday: isToday(date),
			weekday: date.getDay(),
			lunarText: getShortLunarText(date),
			festival: lunarInfo.festival,
			festivalType: lunarInfo.festivalType,
		});
	}

	// Generate week data
	const weeks: CalendarWeek[] = [];
	for (let i = 0; i < days.length; i += 7) {
		const weekDays = days.slice(i, i + 7);
		weeks.push({
			weekNumber: getWeekNumber(weekDays[0].date, year, startOnMonday),
			days: weekDays,
			startDate: weekDays[0].date,
			endDate: weekDays[6].date,
		});
	}

	return {
		year,
		month,
		weeks,
		days,
	};
}
