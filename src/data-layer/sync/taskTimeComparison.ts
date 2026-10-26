/**
 * 任务时间与精度比较工具。
 *
 * 同步层不能直接用 Date 对象引用或毫秒值判断等价：
 * - day 精度只比较本地日历日；
 * - time 精度只比较到分钟；
 * - datePrecision 是对象，必须逐字段比较内容。
 */

import type { GCTask } from '../../types';

export type TaskDatePrecisionField = keyof NonNullable<GCTask['datePrecision']>;

export const TASK_DATE_PRECISION_FIELDS: readonly TaskDatePrecisionField[] = [
    'createdDate',
    'startDate',
    'scheduledDate',
    'dueDate',
    'cancelledDate',
    'completionDate',
] as const;

function toMinuteTime(date: Date): number {
    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
        date.getMinutes()
    ).getTime();
}

function toDayTime(date: Date): number {
    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
    ).getTime();
}

export function normalizeDateForComparison(
    date: Date | undefined,
    precision?: 'day' | 'time'
): number | undefined {
    if (!date) return undefined;
    return precision === 'time' ? toMinuteTime(date) : toDayTime(date);
}

export function areSameTaskDates(
    date1: Date | undefined,
    precision1: 'day' | 'time' | undefined,
    date2: Date | undefined,
    precision2: 'day' | 'time' | undefined
): boolean {
    if (!date1 && !date2) return true;
    if (!!date1 !== !!date2) return false;
    if (normalizePrecision(precision1) !== normalizePrecision(precision2)) return false;

    return normalizeDateForComparison(date1, precision1)
        === normalizeDateForComparison(date2, precision2);
}

export function areSameCompletionDates(
    date1: Date | undefined,
    date2: Date | undefined
): boolean {
    return normalizeDateForComparison(date1, 'time')
        === normalizeDateForComparison(date2, 'time');
}

function normalizePrecision(precision?: 'day' | 'time'): 'day' | 'time' {
    return precision === 'time' ? 'time' : 'day';
}

export function areSameDatePrecisions(
    precision1: 'day' | 'time' | undefined,
    precision2: 'day' | 'time' | undefined
): boolean {
    if (!precision1 && !precision2) return true;
    return normalizePrecision(precision1) === normalizePrecision(precision2);
}

export function areSameDatePrecisionMaps(
    map1: GCTask['datePrecision'],
    map2: GCTask['datePrecision']
): boolean {
    return TASK_DATE_PRECISION_FIELDS.every(field =>
        areSameDatePrecisions(map1?.[field], map2?.[field])
    );
}
