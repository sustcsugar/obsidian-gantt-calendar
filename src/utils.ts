import { CalendarDay, CalendarMonth, CalendarWeek } from './types';
import { getShortLunarText, solarToLunar } from './lunar';

// 获取指定月份的所有天数
export function getDaysInMonth(year: number, month: number): number {
	return new Date(year, month, 0).getDate();
}

// 获取指定月份的第一天是星期几 (0-6, 0=Sunday)
export function getFirstDayOfMonth(year: number, month: number): number {
	return new Date(year, month - 1, 1).getDay();
}

// 获取周数
export function startOfWeek(date: Date, startOnMonday: boolean = true): Date {
	const d = new Date(date);
	const day = d.getDay(); // 0=Sun
	let diff = 0;
	if (startOnMonday) {
		diff = day === 0 ? -6 : 1 - day; // Monday as start
	} else {
		diff = -day; // Sunday as start
	}
	d.setDate(d.getDate() + diff);
	d.setHours(0, 0, 0, 0);
	return d;
}

// Week number: Week 1 is the week that contains Jan 1 of the given base year, even if that week starts in the previous year.
export function getWeekNumber(date: Date, baseYear?: number, startOnMonday: boolean = true): number {
	const year = baseYear ?? date.getFullYear();
	const firstWeekStart = startOfWeek(new Date(year, 0, 1), startOnMonday);
	const weekStart = startOfWeek(date, startOnMonday);

	const diff = weekStart.getTime() - firstWeekStart.getTime();
	const weekIndex = Math.floor(diff / (7 * 24 * 60 * 60 * 1000));

	return weekIndex < 0 ? 1 : weekIndex + 1;
}

// 判断是否是今天
export function isToday(date: Date): boolean {
	const today = new Date();
	return (
		date.getDate() === today.getDate() &&
		date.getMonth() === today.getMonth() &&
		date.getFullYear() === today.getFullYear()
	);
}

// 生成月份的日历数据
export function generateMonthCalendar(year: number, month: number, startOnMonday: boolean = true): CalendarMonth {
	const daysInMonth = getDaysInMonth(year, month);
	const firstDay = getFirstDayOfMonth(year, month);
	const days: CalendarDay[] = [];

	// 添加上个月的末尾日期
	const prevMonth = month === 1 ? 12 : month - 1;
	const prevYear = month === 1 ? year - 1 : year;
	const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);

	// 根据起始日计算需要补齐的上个月天数
	const leadDays = startOnMonday ? ((firstDay + 6) % 7) : firstDay; // 将周日=0转换为周一起始的偏移

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
		});
	}

	// 添加当月的日期
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
		});
	}

	// 添加下个月的开始日期
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
		});
	}

	// 生成周数据
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

// 获取指定日期所在的周
export function getWeekOfDate(date: Date, baseYear?: number, startOnMonday: boolean = true): CalendarWeek {
	const startDate = startOfWeek(date, startOnMonday);

	const days: CalendarDay[] = [];
	for (let i = 0; i < 7; i++) {
		const currentDate = new Date(startDate);
		currentDate.setDate(startDate.getDate() + i);
		const lunarInfo = solarToLunar(currentDate);
		days.push({
			date: currentDate,
			day: currentDate.getDate(),
			isCurrentMonth: true,
			isToday: isToday(currentDate),
			weekday: currentDate.getDay(),
			lunarText: getShortLunarText(currentDate),
			festival: lunarInfo.festival,
		});
	}

	return {
		weekNumber: getWeekNumber(startDate, baseYear ?? date.getFullYear(), startOnMonday),
		days,
		startDate,
		endDate: new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000),
	};
}

// 格式化日期显示
export function formatDate(date: Date, format: string = 'YYYY-MM-DD'): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];

	return format
		.replace('YYYY', String(year))
		.replace('MM', month)
		.replace('DD', day)
		.replace('ddd', dayName);
}

// 格式化月份显示
export function formatMonth(year: number, month: number): string {
	const months = ['January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'];
	return `${months[month - 1]} ${year}`;
}
