/**
 * 周期任务完成处理器
 *
 * 处理周期任务的完成流程：标记原始任务完成 + 在下一行插入新任务。
 * 使用单次文件写入避免竞态条件。
 */

import { App, TFile } from 'obsidian';
import { GCTask, getTaskDateField } from '../types';
import type { DateFieldType } from '../settings/types';
import { determineTaskFormat } from './taskUpdater';
import { serializeTask, TaskUpdates } from './taskSerializer';
import { updateTaskCompletion } from './taskUpdater';
import { parseRepeatRule, getNextOccurrence } from './recurrenceCalculator';
import { Logger } from '../utils/logger';

/**
 * 完成周期任务
 *
 * 流程：
 * 1. 解析 repeat 规则，失败则回退到普通完成
 * 2. 计算下一个出现日期
 * 3. 将原始任务标记为完成
 * 4. 在原始任务下一行插入新的未完成任务（带推进的日期）
 */
export async function completeRecurringTask(
    app: App,
    task: GCTask,
    enabledFormats: string[],
    dateField: string
): Promise<void> {
    const rule = parseRepeatRule(task.repeat!);
    if (!rule) {
        // 无法解析规则，回退到普通完成
        Logger.warn('recurringTaskCompleter', 'Cannot parse repeat rule, falling back to normal completion', { repeat: task.repeat });
        return updateTaskCompletion(app, task, true, enabledFormats);
    }

    // 确定推进基准日期
    const baseDateForAdvance = rule.whenDone
        ? new Date()
        : getTaskDateField(task, dateField as DateFieldType);

    if (!baseDateForAdvance || !(baseDateForAdvance instanceof Date) || isNaN(baseDateForAdvance.getTime())) {
        Logger.warn('recurringTaskCompleter', 'No valid base date for advancing recurring task', { dateField });
        return updateTaskCompletion(app, task, true, enabledFormats);
    }

    // 计算下一个出现日期
    const nextOccurrence = getNextOccurrence(rule, baseDateForAdvance);

    Logger.debug('recurringTaskCompleter', 'Completing recurring task', {
        description: task.description,
        repeat: task.repeat,
        baseDate: baseDateForAdvance.toISOString(),
        nextOccurrence: nextOccurrence.toISOString(),
    });

    // 读取文件
    const file = app.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) {
        throw new Error(`File not found: ${task.filePath}`);
    }

    const content = await app.vault.read(file);
    const lines = content.split('\n');
    const taskLineIndex = task.lineNumber - 1;

    if (taskLineIndex < 0 || taskLineIndex >= lines.length) {
        throw new Error(`Invalid line number: ${task.lineNumber}`);
    }

    const taskLine = lines[taskLineIndex];

    // 步骤 1: 序列化原始任务为完成状态
    const completedUpdates: TaskUpdates = {
        completed: true,
        status: 'done',
        completionDate: new Date(),
    };

    // 使用序列化器构建完成后的行
    const formatToUse = determineTaskFormat(task, taskLine, enabledFormats);
    const completedContent = serializeTask(app, task, completedUpdates, formatToUse);
    const listMatch = taskLine.match(/^(\s*)([-*])\s+\[.\]\s*/);
    if (!listMatch) {
        throw new Error('Invalid task format: cannot find list marker');
    }

    const completedLine = `${listMatch[1]}${listMatch[2]} ${completedContent}`;

    // 步骤 2: 构建新的未完成任务行（推进日期）
    const newTaskUpdates: TaskUpdates = {
        completed: false,
        status: 'todo',
        completionDate: null,
        createdDate: new Date(),
    };

    // 推进主日期字段
    (newTaskUpdates as any)[dateField] = nextOccurrence;

    // 推进其他日期字段（保持相对偏移）
    advanceDateInUpdates(newTaskUpdates, task, dateField, nextOccurrence);

    // 序列化新任务行
    const newContent = serializeTask(app, task, newTaskUpdates, formatToUse);
    const newTaskLine = `${listMatch[1]}${listMatch[2]} ${newContent}`;

    // 步骤 3: 单次写入 - 替换原始行 + 插入新行
    lines[taskLineIndex] = completedLine;
    lines.splice(taskLineIndex + 1, 0, newTaskLine);

    await app.vault.modify(file, lines.join('\n'));

    Logger.debug('recurringTaskCompleter', 'Recurring task completed and next occurrence created', {
        originalLine: completedLine,
        newLine: newTaskLine,
    });
}

/**
 * 在 TaskUpdates 中推进日期字段，保持与基准字段的相对偏移
 */
function advanceDateInUpdates(
    updates: TaskUpdates,
    sourceTask: GCTask,
    dateField: string,
    nextOccurrence: Date
): void {
    const sourceBaseDate = getTaskDateField(sourceTask, dateField as DateFieldType);
    if (!sourceBaseDate) return;

    // 推进 startDate（如果存在且与主日期不同）
    if (sourceTask.startDate && dateField !== 'startDate') {
        const offset = sourceTask.startDate.getTime() - sourceBaseDate.getTime();
        updates.startDate = new Date(nextOccurrence.getTime() + offset);
    }

    // 推进 scheduledDate（如果存在且与主日期不同）
    if (sourceTask.scheduledDate && dateField !== 'scheduledDate') {
        const offset = sourceTask.scheduledDate.getTime() - sourceBaseDate.getTime();
        updates.scheduledDate = new Date(nextOccurrence.getTime() + offset);
    }

    // 推进 dueDate（如果存在且与主日期不同）
    if (sourceTask.dueDate && dateField !== 'dueDate') {
        const offset = sourceTask.dueDate.getTime() - sourceBaseDate.getTime();
        updates.dueDate = new Date(nextOccurrence.getTime() + offset);
    }
}
