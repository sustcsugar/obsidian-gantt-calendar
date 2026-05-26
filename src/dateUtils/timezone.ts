/**
 * @fileoverview 时区感知的日期工具模块
 *
 * 提供时区感知的日期创建、比较和格式化功能。
 * 替代原生的 `new Date("YYYY-MM-DD")` (UTC 午夜) 和 `toISOString()` (UTC 输出)。
 *
 * 时区偏移量存储为分钟数：UTC+8 = 480，UTC-5 = -300
 * null 表示跟随系统时区
 *
 * @module dateUtils/timezone
 */


// ==================== 时区偏移量存储 ====================

/** 当前时区偏移量（分钟），null 表示跟随系统 */
let currentTimezoneOffset: number | null = null;

/**
 * 设置时区偏移量
 *
 * 在插件加载时调用，将用户配置的偏移量存入模块。
 *
 * @param offset - UTC 偏移量（分钟），如 UTC+8 = 480；null 表示跟随系统
 */
export function setTimezoneOffset(offset: number | null): void {
	currentTimezoneOffset = offset;
}

/**
 * 获取有效的时区偏移量（分钟）
 *
 * 如果用户配置了偏移量则返回配置值，否则返回系统时区偏移量。
 *
 * @returns UTC 偏移量（分钟），如 UTC+8 = 480
 */
export function getEffectiveTimezoneOffset(): number {
	if (currentTimezoneOffset === null) {
		return -new Date().getTimezoneOffset();
	}
	return currentTimezoneOffset;
}

// ==================== 日期创建 ====================

/**
 * 从日期字符串创建本地 Date 对象
 *
 * 支持两种格式：
 * - `YYYY-MM-DD` → 本地午夜 00:00:00（全天任务）
 * - `YYYY-MM-DD HH:mm` → 本地指定时间（定时任务）
 *
 * 替代 `new Date("2024-01-15")`，后者会创建 UTC 午夜，
 * 在 UTC- 时区下 `.getDate()` 返回前一天。
 *
 * @param dateStr - 日期字符串，格式 YYYY-MM-DD 或 YYYY-MM-DD HH:mm
 * @returns 本地 Date 对象
 */
export function createDate(dateStr: string): Date {
	const [datePart, timePart] = dateStr.split(' ');
	const parts = datePart.split('-');
	const y = parseInt(parts[0], 10);
	const m = parseInt(parts[1], 10);
	const d = parseInt(parts[2], 10);
	if (timePart) {
		const [h, min] = timePart.split(':').map(Number);
		return new Date(y, m - 1, d, h, min, 0, 0);
	}
	return new Date(y, m - 1, d);
}

// ==================== "今天"相关 ====================

/**
 * 获取配置时区的"今天"日期
 *
 * 根据用户配置的时区偏移量计算当前日期，返回本地午夜 Date。
 * 替代 `getTodayDate()` 中的 `new Date()` + `setHours(0,0,0,0)`。
 *
 * @returns 配置时区下今天的日期（本地午夜）
 */
export function getTodayInTimezone(): Date {
	const offset = getEffectiveTimezoneOffset();
	const now = new Date();

	// 将 UTC 毫秒加上目标偏移量，使用 getUTC* 方法获取目标时区的日期部分
	const targetMs = now.getTime() + offset * 60000;
	const targetDate = new Date(targetMs);

	const year = targetDate.getUTCFullYear();
	const month = targetDate.getUTCMonth();
	const day = targetDate.getUTCDate();

	return new Date(year, month, day);
}

/**
 * 判断日期是否为配置时区的"今天"
 *
 * @param date - 待判断的日期
 * @returns 是否为今天
 */
export function isTodayInTimezone(date: Date): boolean {
	const today = getTodayInTimezone();
	return (
		date.getDate() === today.getDate() &&
		date.getMonth() === today.getMonth() &&
		date.getFullYear() === today.getFullYear()
	);
}

/**
 * 判断日期是否为配置时区的"本月"
 *
 * @param date - 待判断的日期
 * @returns 是否为本月
 */
export function isThisMonthInTimezone(date: Date): boolean {
	const today = getTodayInTimezone();
	return (
		date.getMonth() === today.getMonth() &&
		date.getFullYear() === today.getFullYear()
	);
}

// ==================== 日期字符串格式化 ====================

/**
 * 将 Date 格式化为本地日期字符串 (YYYY-MM-DD)
 *
 * 替代 `date.toISOString()` 用于 DOM dataset 存储。
 * toISOString() 输出 UTC 时间，可能导致日期偏移。
 *
 * @param date - 日期对象
 * @returns YYYY-MM-DD 格式的本地日期字符串
 */
export function toISOStringLocal(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

// ==================== 验证函数 ====================

/**
 * 验证日期字符串是否有效
 *
 * 使用 createDate() 避免时区问题，同时验证年月日的合理性。
 *
 * @param dateStr - 日期字符串 (YYYY-MM-DD)
 * @returns 是否为有效日期
 */
export function isValidDate(dateStr: string): boolean {
	const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return false;

	const y = parseInt(match[1], 10);
	const m = parseInt(match[2], 10);
	const d = parseInt(match[3], 10);

	if (m < 1 || m > 12 || d < 1 || d > 31) return false;

	const date = new Date(y, m - 1, d);
	return !isNaN(date.getTime()) &&
		date.getFullYear() === y &&
		date.getMonth() === m - 1 &&
		date.getDate() === d;
}

// ==================== 时区选项常量 ====================

/**
 * 时区偏移量下拉选项
 *
 * 用于设置界面的时区下拉选择器。
 * 格式：`(UTC±H:MM) 代表城市`
 */
export const TIMEZONE_OPTIONS: Record<string, string> = {
	'null': 'Follow System',
	'-720': '(UTC-12:00) Baker Island',
	'-660': '(UTC-11:00) Samoa, Midway',
	'-600': '(UTC-10:00) Hawaii',
	'-540': '(UTC-9:00) Alaska',
	'-480': '(UTC-8:00) Pacific Time (Los Angeles, Vancouver)',
	'-420': '(UTC-7:00) Mountain Time (Denver, Arizona)',
	'-360': '(UTC-6:00) Central Time (Chicago, Mexico City)',
	'-300': '(UTC-5:00) Eastern Time (New York, Toronto)',
	'-240': '(UTC-4:00) Atlantic Time (Halifax, Caracas)',
	'-180': '(UTC-3:00) Brasilia, Buenos Aires',
	'-120': '(UTC-2:00) Mid-Atlantic',
	'-60': '(UTC-1:00) Azores, Cape Verde',
	'0': '(UTC+0:00) London, Lisbon, Dublin',
	'60': '(UTC+1:00) Paris, Berlin, Rome, Madrid',
	'120': '(UTC+2:00) Athens, Helsinki, Cairo, Israel',
	'180': '(UTC+3:00) Moscow, Istanbul, Riyadh',
	'210': '(UTC+3:30) Tehran',
	'240': '(UTC+4:00) Dubai, Baku',
	'270': '(UTC+4:30) Kabul',
	'300': '(UTC+5:00) Karachi, New Delhi',
	'330': '(UTC+5:30) Mumbai, Colombo',
	'345': '(UTC+5:45) Kathmandu',
	'360': '(UTC+6:00) Dhaka, Almaty',
	'390': '(UTC+6:30) Yangon',
	'420': '(UTC+7:00) Bangkok, Jakarta, Hanoi',
	'480': '(UTC+8:00) Beijing, Singapore, Hong Kong, Taipei',
	'525': '(UTC+8:45) Australia Eucla',
	'540': '(UTC+9:00) Tokyo, Seoul',
	'570': '(UTC+9:30) Adelaide, Darwin',
	'600': '(UTC+10:00) Sydney, Melbourne',
	'630': '(UTC+10:30) Lord Howe Island',
	'660': '(UTC+11:00) Solomon Islands',
	'720': '(UTC+12:00) Auckland, Wellington',
	'765': '(UTC+12:45) Chatham Islands',
	'780': '(UTC+13:00) Samoa',
	'840': '(UTC+14:00) Line Islands',
};
