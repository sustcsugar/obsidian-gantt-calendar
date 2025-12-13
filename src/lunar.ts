// 农历计算和中国节日功能

// 农历数据：1900-2100年的农历信息
// 每年用一个16进制数表示，前4位为闰月月份，后12位表示每月大小（1为30天，0为29天）
const lunarYearData = [
	0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
	0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
	0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
	0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
	0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
	0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5d0, 0x14573, 0x052d0, 0x0a9a8, 0x0e950, 0x06aa0,
	0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
	0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b5a0, 0x195a6,
	0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
	0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
	0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
	0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
	0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
	0x05aa0, 0x076a3, 0x096d0, 0x04bd7, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
	0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
	0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
	0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
	0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
	0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
	0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
	0x0d520
];

// 天干
const Gan = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
// 地支
const Zhi = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
// 生肖
const Animals = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
// 农历月份
const lunarMonthNames = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
// 农历日期
const lunarDayNames = [
	'初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
	'十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
	'廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'
];

export interface LunarDate {
	lunarYear: number;
	lunarMonth: number;
	lunarDay: number;
	isLeapMonth: boolean;
	lunarMonthName: string;
	lunarDayName: string;
	ganzhiYear: string;
	animal: string;
	solarTerm: string;
	festival: string;
}

// 获取某年的农历信息
function getLunarYearData(year: number): number {
	return lunarYearData[year - 1900];
}

// 获取某年闰月月份（0表示无闰月）
function getLeapMonth(year: number): number {
	return getLunarYearData(year) & 0xf;
}

// 获取某年闰月天数
function getLeapDays(year: number): number {
	if (getLeapMonth(year)) {
		return (getLunarYearData(year) & 0x10000) ? 30 : 29;
	}
	return 0;
}

// 获取某年某月的天数
function getMonthDays(year: number, month: number): number {
	return (getLunarYearData(year) & (0x10000 >> month)) ? 30 : 29;
}

// 获取某年的总天数
function getYearDays(year: number): number {
	let sum = 348;
	for (let i = 0x8000; i > 0x8; i >>= 1) {
		sum += (getLunarYearData(year) & i) ? 1 : 0;
	}
	return sum + getLeapDays(year);
}

// 阳历转农历
export function solarToLunar(date: Date): LunarDate {
	const baseDate = new Date(1900, 0, 31);
	let offset = Math.floor((date.getTime() - baseDate.getTime()) / 86400000);

	let lunarYear = 1900;
	let daysInYear = 0;

	// 计算农历年份
	while (lunarYear < 2100 && offset > 0) {
		daysInYear = getYearDays(lunarYear);
		offset -= daysInYear;
		lunarYear++;
	}
	if (offset < 0) {
		offset += daysInYear;
		lunarYear--;
	}

	// 计算闰月
	const leapMonth = getLeapMonth(lunarYear);
	let isLeapMonth = false;

	// 计算农历月份和日期
	let lunarMonth = 1;
	for (let i = 1; i < 13 && offset > 0; i++) {
		if (leapMonth > 0 && i === (leapMonth + 1) && !isLeapMonth) {
			// 闰月
			i--;
			isLeapMonth = true;
			daysInYear = getLeapDays(lunarYear);
		} else {
			daysInYear = getMonthDays(lunarYear, i);
		}

		offset -= daysInYear;
		if (isLeapMonth && i === (leapMonth + 1)) {
			isLeapMonth = false;
		}
		if (!isLeapMonth) {
			lunarMonth++;
		}
	}

	if (offset === 0 && leapMonth > 0 && lunarMonth === leapMonth + 1) {
		if (isLeapMonth) {
			isLeapMonth = false;
		} else {
			isLeapMonth = true;
			lunarMonth--;
		}
	}

	if (offset < 0) {
		offset += daysInYear;
		lunarMonth--;
	}

	const lunarDay = offset + 1;

	// 计算干支年
	const ganIndex = (lunarYear - 4) % 10;
	const zhiIndex = (lunarYear - 4) % 12;
	const ganzhiYear = Gan[ganIndex] + Zhi[zhiIndex];
	const animal = Animals[zhiIndex];

	// 获取节日
	const festival = getFestival(date, lunarMonth, lunarDay, isLeapMonth);
	const solarTerm = getSolarTerm(date);

	return {
		lunarYear,
		lunarMonth,
		lunarDay,
		isLeapMonth,
		lunarMonthName: (isLeapMonth ? '闰' : '') + lunarMonthNames[lunarMonth - 1] + '月',
		lunarDayName: lunarDayNames[lunarDay - 1],
		ganzhiYear,
		animal,
		solarTerm,
		festival,
	};
}

// 获取节日
function getFestival(date: Date, lunarMonth: number, lunarDay: number, isLeapMonth: boolean): string {
	const month = date.getMonth() + 1;
	const day = date.getDate();

	// 公历节日
	const solarFestivals: { [key: string]: string } = {
		'1-1': '元旦',
		'2-14': '情人节',
		'3-8': '妇女节',
		'3-12': '植树节',
		'4-1': '愚人节',
		'5-1': '劳动节',
		'5-4': '青年节',
		'6-1': '儿童节',
		'7-1': '建党节',
		'8-1': '建军节',
		'9-10': '教师节',
		'10-1': '国庆节',
		'12-25': '圣诞节',
	};

	// 农历节日
	const lunarFestivals: { [key: string]: string } = {
		'1-1': '春节',
		'1-15': '元宵节',
		'2-2': '龙抬头',
		'5-5': '端午节',
		'7-7': '七夕节',
		'7-15': '中元节',
		'8-15': '中秋节',
		'9-9': '重阳节',
		'12-8': '腊八节',
		'12-23': '小年',
	};

	const solarKey = `${month}-${day}`;
	if (solarFestivals[solarKey]) {
		return solarFestivals[solarKey];
	}

	if (!isLeapMonth) {
		const lunarKey = `${lunarMonth}-${lunarDay}`;
		if (lunarFestivals[lunarKey]) {
			return lunarFestivals[lunarKey];
		}
	}

	// 除夕特殊处理（腊月最后一天）
	if (lunarMonth === 12 && lunarDay === 29) {
		const nextDay = new Date(date);
		nextDay.setDate(date.getDate() + 1);
		const nextLunar = solarToLunar(nextDay);
		if (nextLunar.lunarMonth === 1 && nextLunar.lunarDay === 1) {
			return '除夕';
		}
	}
	if (lunarMonth === 12 && lunarDay === 30) {
		return '除夕';
	}

	return '';
}

// 二十四节气数据（简化版）
const solarTerms = [
	'小寒', '大寒', '立春', '雨水', '惊蛰', '春分',
	'清明', '谷雨', '立夏', '小满', '芒种', '夏至',
	'小暑', '大暑', '立秋', '处暑', '白露', '秋分',
	'寒露', '霜降', '立冬', '小雪', '大雪', '冬至'
];

// 简化的节气计算（实际应该更精确）
function getSolarTerm(date: Date): string {
	const year = date.getFullYear();
	const month = date.getMonth();
	const day = date.getDate();

	// 简化的节气日期对应（每月两个节气，大约在6号和21号附近）
	const termDates = [
		[6, 20], [4, 19], [6, 21], [19, 20], [6, 21], [21, 20],
		[5, 20], [20, 21], [6, 21], [21, 22], [6, 21], [22, 22],
		[7, 23], [23, 23], [8, 23], [23, 23], [8, 23], [23, 23],
		[8, 23], [24, 23], [8, 22], [22, 22], [7, 22], [22, 22]
	];

	const termIndex = month * 2;
	if (Math.abs(day - termDates[termIndex][0]) <= 1) {
		return solarTerms[termIndex];
	}
	if (Math.abs(day - termDates[termIndex][1]) <= 1) {
		return solarTerms[termIndex + 1];
	}

	return '';
}

// 获取简短的农历显示（用于小格子显示）
export function getShortLunarText(date: Date): string {
	const lunar = solarToLunar(date);

	// 优先显示节日
	if (lunar.festival) {
		return lunar.festival;
	}

	// 显示节气
	if (lunar.solarTerm) {
		return lunar.solarTerm;
	}

	// 显示初一
	if (lunar.lunarDay === 1) {
		return lunar.lunarMonthName;
	}

	// 显示日期
	return lunar.lunarDayName;
}
