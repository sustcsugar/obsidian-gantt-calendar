/**
 * 虚拟周期任务生成器
 *
 * 为视图层生成虚拟的周期任务实例，不写入 markdown。
 * 使用 WeakMap 追踪虚拟任务元数据，不污染 GCTask 接口。
 */

import { GCTask, getTaskDateField, setTaskDateField } from '../types';
import type { DateFieldType } from '../settings/types';
import { parseRepeatRule, getOccurrencesInRange, ParsedRecurrenceRule } from './recurrenceCalculator';

/**
 * 虚拟任务元数据
 */
export interface VirtualTaskMetadata {
    /** 源任务 ID: "filePath:lineNumber" */
    sourceTaskId: string;
    /** 计算出的出现日期 */
    occurrenceDate: Date;
}

/**
 * 虚拟任务元数据 WeakMap
 * 键为虚拟 GCTask 对象，值为元数据
 */
export const virtualTaskMetadata = new WeakMap<GCTask, VirtualTaskMetadata>();

/**
 * 判断任务是否为虚拟实例
 */
export function isVirtualTask(task: GCTask): boolean {
    return virtualTaskMetadata.has(task);
}

/**
 * 获取虚拟任务的元数据
 */
export function getVirtualMetadata(task: GCTask): VirtualTaskMetadata | undefined {
    return virtualTaskMetadata.get(task);
}

/**
 * 生成指定日期范围内的虚拟周期任务实例
 *
 * @param tasks 所有已过滤的任务列表（真实任务）
 * @param rangeStart 可见范围起始日期
 * @param rangeEnd 可见范围结束日期
 * @param dateField 日期字段名（如 'dueDate', 'startDate', 'scheduledDate'）
 * @returns 虚拟任务数组
 */
export function generateVirtualInstances(
    tasks: GCTask[],
    rangeStart: Date,
    rangeEnd: Date,
    dateField: string,
    maxCount: number = 50
): GCTask[] {
    const virtualTasks: GCTask[] = [];

    for (const task of tasks) {
        // 跳过没有 repeat 规则的任务
        if (!task.repeat) continue;
        // 跳过已完成的任务
        if (task.completed || task.status === 'done' || task.status === 'canceled') continue;
        // 跳过已取消的任务
        if (task.cancelled) continue;

        // 获取基准日期
        const baseDate = getDateFieldValue(task, dateField);
        if (!baseDate || !(baseDate instanceof Date) || isNaN(baseDate.getTime())) continue;

        // 解析 repeat 规则
        const rule = parseRepeatRule(task.repeat);
        if (!rule) continue;

        // 计算范围内的出现日期
        const occurrences = getOccurrencesInRange(rule, baseDate, rangeStart, rangeEnd, maxCount);

        for (const occDate of occurrences) {
            const virtualTask = createVirtualTask(task, occDate, dateField, rule);
            if (virtualTask) {
                virtualTasks.push(virtualTask);
            }
        }
    }

    return virtualTasks;
}

/**
 * 安全获取任务的日期字段值
 */
function getDateFieldValue(task: GCTask, field: string): Date | undefined {
    return getTaskDateField(task, field as DateFieldType);
}

/**
 * 创建单个虚拟任务实例
 */
function createVirtualTask(
    sourceTask: GCTask,
    occurrenceDate: Date,
    dateField: string,
    rule: ParsedRecurrenceRule
): GCTask | null {
    // 克隆源任务
    const virtualTask: GCTask = {
        ...sourceTask,
    };

    // 设置出现日期到指定字段
    setTaskDateField(virtualTask, dateField as DateFieldType, new Date(occurrenceDate));

    // 推进其他日期字段，保持相对偏移
    const sourceDateValue = getDateFieldValue(sourceTask, dateField);
    if (sourceDateValue) {
        advanceDateFieldWithOffset(virtualTask, sourceTask, sourceDateValue, occurrenceDate, 'startDate');
        advanceDateFieldWithOffset(virtualTask, sourceTask, sourceDateValue, occurrenceDate, 'scheduledDate');
        advanceDateFieldWithOffset(virtualTask, sourceTask, sourceDateValue, occurrenceDate, 'dueDate');
    }

    // 重置完成状态
    virtualTask.completed = false;
    virtualTask.status = 'todo';
    virtualTask.cancelled = false;
    virtualTask.completionDate = undefined;
    virtualTask.cancelledDate = undefined;

    // 存储虚拟任务元数据
    virtualTaskMetadata.set(virtualTask, {
        sourceTaskId: `${sourceTask.filePath}:${sourceTask.lineNumber}`,
        occurrenceDate: new Date(occurrenceDate),
    });

    return virtualTask;
}

/**
 * 推进日期字段，保持与基准字段的相对偏移
 *
 * 如果源任务有 startDate 和 dueDate，且 dateField 是 dueDate，
 * 则虚拟任务的 startDate = occurrenceDate - (dueDate - startDate)
 */
function advanceDateFieldWithOffset(
    virtualTask: GCTask,
    sourceTask: GCTask,
    sourceBaseDate: Date,
    occurrenceDate: Date,
    field: 'startDate' | 'scheduledDate' | 'dueDate'
): void {
    const sourceValue = getDateFieldValue(sourceTask, field);
    if (!sourceValue) return;

    // 计算该字段与基准字段的偏移
    const offset = sourceValue.getTime() - sourceBaseDate.getTime();
    const newValue = new Date(occurrenceDate.getTime() + offset);

    setTaskDateField(virtualTask, field as DateFieldType, newValue);
}
