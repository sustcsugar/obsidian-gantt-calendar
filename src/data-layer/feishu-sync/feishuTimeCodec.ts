/**
 * 飞书任务时间与本地日期精度编解码
 *
 * 本地任务只有“日期”和“日期+分钟”两种精度；飞书 Task v2 通过
 * `is_all_day` 区分全天任务与具体时间任务。这里集中处理双向转换、
 * 秒级归一化和混合精度检测，避免同步双方因粒度不同产生 ping-pong。
 */

import type { GCTask } from '../../types';
import type { FeishuTaskTime } from '../sources/api/providers/feishu/FeishuTypes';

export type FeishuDatePrecision = 'day' | 'time';

export function normalizePrecision(precision?: 'day' | 'time'): FeishuDatePrecision {
    return precision === 'time' ? 'time' : 'day';
}

/** 本地日期只支持到分钟，出站前丢弃秒和毫秒。 */
function truncateToMinute(date: Date): Date {
    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
        0,
        0
    );
}

/** 全天任务使用本地日历日午夜，避免携带无关的时分秒。 */
function truncateToDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function normalizeLocalDate(date: Date, precision: FeishuDatePrecision): Date {
    return precision === 'time' ? truncateToMinute(date) : truncateToDay(date);
}

export function toFeishuTaskTime(
    date: Date,
    precision?: 'day' | 'time'
): { timestamp: string; is_all_day: boolean } {
    const normalizedPrecision = normalizePrecision(precision);
    return {
        timestamp: String(normalizeLocalDate(date, normalizedPrecision).getTime()),
        is_all_day: normalizedPrecision === 'day',
    };
}

export interface LocalTaskTime {
    date?: Date;
    precision?: FeishuDatePrecision;
}

export function fromFeishuTaskTime(time?: FeishuTaskTime): LocalTaskTime {
    if (!time?.timestamp) return {};

    const millis = Number(time.timestamp);
    if (!Number.isFinite(millis)) return {};

    const rawDate = new Date(millis);
    if (Number.isNaN(rawDate.getTime())) return {};

    const precision: FeishuDatePrecision = time.is_all_day === true ? 'day' : 'time';
    return {
        date: normalizeLocalDate(rawDate, precision),
        precision,
    };
}

export function toFeishuCompletedAt(date?: Date): string | undefined {
    if (!date) return undefined;
    return String(truncateToMinute(date).getTime());
}

export function fromFeishuCompletedAt(timestamp?: string): Date | undefined {
    if (!timestamp || timestamp === '0') return undefined;
    const millis = Number(timestamp);
    if (!Number.isFinite(millis)) return undefined;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? undefined : truncateToMinute(date);
}

export function isSameFeishuTime(
    localDate: Date | undefined,
    localPrecision: 'day' | 'time' | undefined,
    remoteTime: FeishuTaskTime | undefined
): boolean {
    if (!localDate && !remoteTime?.timestamp) return true;
    if (!localDate || !remoteTime?.timestamp) return false;

    const remote = fromFeishuTaskTime(remoteTime);
    if (!remote.date || !remote.precision) return false;

    const precision = normalizePrecision(localPrecision);
    if (precision !== remote.precision) return false;

    return normalizeLocalDate(localDate, precision).getTime()
        === normalizeLocalDate(remote.date, remote.precision).getTime();
}

/** 飞书要求 start/due 同时存在时 is_all_day 必须一致。 */
export function hasMixedFeishuPrecision(task: GCTask): boolean {
    if (!task.startDate || !task.dueDate) return false;
    return normalizePrecision(task.datePrecision?.startDate)
        !== normalizePrecision(task.datePrecision?.dueDate);
}
