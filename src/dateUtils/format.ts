/**
 * Get number of days in specified month
 */
export function getDaysInMonth(year: number, month: number): number {
	return new Date(year, month, 0).getDate();
}

/**
 * Get weekday of first day of specified month (0-6, 0=Sunday)
 */
export function getFirstDayOfMonth(year: number, month: number): number {
	return new Date(year, month - 1, 1).getDay();
}

/**
 * Format date to string
 * 占位符: yyyy(年) MM(月) dd(日) ddd(星期缩写) HH(24小时) mm(分钟)
 */
export function formatDate(date: Date, format: string = 'yyyy-MM-dd'): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');

	return format
		.replace('yyyy', String(year))
		.replace('MM', month)
		.replace('dd', day)
		.replace('ddd', dayName)
		.replace('HH', hours)
		.replace('mm', minutes);
}

/**
 * Format month/year to string
 */
export function formatMonth(year: number, month: number): string {
	const months = ['January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'];
	return `${months[month - 1]} ${year}`;
}
