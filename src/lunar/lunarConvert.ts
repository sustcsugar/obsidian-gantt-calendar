// lunarConvert.ts
// 阳历转农历主函数及API
import { Gan, Zhi, Animals, lunarMonthNames, lunarDayNames } from './lunarData';
import { getLeapMonth, getLeapDays, getMonthDays, getYearDays } from './lunarUtils';
import { getFestival } from './festival';
import { getSolarTerm } from './solarTerm';
import { LunarDate } from './lunarTypes';

export function solarToLunar(date: Date): LunarDate {
	const baseDate = new Date(1900, 0, 31);
	let offset = Math.floor((date.getTime() - baseDate.getTime()) / 86400000);

	let lunarYear = 1900;
	let daysInYear = 0;
	while (lunarYear < 2100 && offset > 0) {
		daysInYear = getYearDays(lunarYear);
		offset -= daysInYear;
		lunarYear++;
	}
	if (offset < 0) {
		offset += daysInYear;
		lunarYear--;
	}
	const leapMonth = getLeapMonth(lunarYear);
	let isLeapMonth = false;
	let lunarMonth = 1;
	for (let i = 1; i < 13 && offset > 0; i++) {
		if (leapMonth > 0 && i === (leapMonth + 1) && !isLeapMonth) {
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
	const ganIndex = (lunarYear - 4) % 10;
	const zhiIndex = (lunarYear - 4) % 12;
	const ganzhiYear = Gan[ganIndex] + Zhi[zhiIndex];
	const animal = Animals[zhiIndex];
	const festivalInfo = getFestival(date, lunarMonth, lunarDay, isLeapMonth);
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
		festival: festivalInfo.name,
		festivalType: festivalInfo.type || (solarTerm ? 'solarTerm' : undefined),
	};
}

export function getShortLunarText(date: Date): string {
	const lunar = solarToLunar(date);
	if (lunar.festival) return lunar.festival;
	if (lunar.solarTerm) return lunar.solarTerm;
	if (lunar.lunarDay === 1) return lunar.lunarMonthName;
	return lunar.lunarDayName;
}
