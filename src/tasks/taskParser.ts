/**
 * 任务解析模块 - 向后兼容层
 *
 * 此文件保留原有的函数接口，内部使用新的 taskParser 模块实现。
 * 原有函数已标记为 @deprecated，建议使用 taskParser/index.ts 中的新接口。
 *
 * @fileoverview 任务解析向后兼容层
 * @deprecated 请使用 './taskParser' 模块中的新接口
 */

import { TFile, ListItemCache } from 'obsidian';
import { GCTask } from '../types';
import { RegularExpressions } from '../utils/RegularExpressions';
import { createDate } from '../dateUtils/timezone';

// 导入新模块的实现
import {
    parseTasksFromListItems as newParseTasksFromListItems,
} from './taskParser/index';

// 为了兼容性，从 taskSerializerSymbols 导入配置
import { parsePriorityFromEmoji, parsePriorityFromDataview } from './taskSerializerSymbols';

// ==================== 主解析函数（保留） ====================

/**
 * 从列表项缓存中解析任务
 *
 * 这是插件的主要任务解析入口，由 TaskCacheManager 调用。
 * 此函数已更新为使用新的 taskParser 模块实现。
 *
 * @param file - Obsidian 文件对象
 * @param lines - 文件的所有文本行
 * @param listItems - Obsidian 解析的列表项缓存
 * @param enabledFormats - 启用的任务格式列表
 * @param globalTaskFilter - 全局任务过滤器前缀
 * @returns 解析出的任务数组
 */
export function parseTasksFromListItems(
    file: TFile,
    lines: string[],
    listItems: ListItemCache[],
    enabledFormats: string[],
    globalTaskFilter: string
): GCTask[] {
    return newParseTasksFromListItems(
        file,
        lines,
        listItems,
        enabledFormats as Array<'tasks' | 'dataview'>,
        globalTaskFilter || undefined
    );
}

// ==================== 向后兼容函数（已弃用） ====================

/**
 * 解析 Tasks 插件格式日期和优先级（使用emoji表示）
 *
 * 优先级: 🔺 highest, ⏫ high, 🔼 medium, 🔽 low, ⏬ lowest
 * 日期: ➕ 创建日期, 🛫 开始日期, ⏳ 计划日期, 📅 due日期, ❌ 取消日期, ✅ 完成日期
 *
 * @param content - 任务内容
 * @param task - 任务对象（会被直接修改）
 * @returns 返回 true 表示匹配到 Tasks 格式
 *
 * @deprecated 请使用 taskParser 模块中的 parseTasksPriority 和 parseTasksDates 函数
 * @see {@link ./taskParser/step4.ts} 中的新实现
 */
export function parseTasksFormat(content: string, task: GCTask): boolean {
    // 解析优先级
    const priorityRegex = RegularExpressions.Tasks.priorityRegex;
    priorityRegex.lastIndex = 0;
    const priorityMatch = priorityRegex.exec(content);
    if (priorityMatch) {
        const priority = parsePriorityFromEmoji(priorityMatch[1]);
        if (priority) {
            task.priority = priority;
        }
    }

    // 解析日期
    const dates = {
        createdDate: parseTasksDateField(content, 'createdDate'),
        startDate: parseTasksDateField(content, 'startDate'),
        scheduledDate: parseTasksDateField(content, 'scheduledDate'),
        dueDate: parseTasksDateField(content, 'dueDate'),
        cancelledDate: parseTasksDateField(content, 'cancelledDate'),
        completionDate: parseTasksDateField(content, 'completionDate'),
    };
    Object.assign(task, dates);

    if (task.cancelledDate && !task.completed) {
        task.cancelled = true;
    }

    const hasTasksFormat = RegularExpressions.Tasks.formatDetectionRegex.test(content);
    if (hasTasksFormat) {
        task.format = 'tasks';
    }

    return hasTasksFormat;
}

/**
 * 解析 Tasks 格式的单个日期字段
 */
function parseTasksDateField(content: string, field: string): Date | undefined {
    const fieldToRegex: Record<string, RegExp> = {
        createdDate: RegularExpressions.Tasks.createdDateRegex,
        startDate: RegularExpressions.Tasks.startDateRegex,
        scheduledDate: RegularExpressions.Tasks.scheduledDateRegex,
        dueDate: RegularExpressions.Tasks.dueDateRegex,
        cancelledDate: RegularExpressions.Tasks.cancelledDateRegex,
        completionDate: RegularExpressions.Tasks.completionDateRegex,
    };

    const regex = fieldToRegex[field];
    if (!regex) return undefined;

    regex.lastIndex = 0;
    const match = regex.exec(content);
    if (match && match[1]) {
        return createDate(match[1]);
    }
    return undefined;
}

/**
 * 解析 Dataview 插件格式日期和优先级（使用字段表示）
 *
 * 字段格式: [priority:: ...], [created:: ...], [start:: ...], [scheduled:: ...], [due:: ...], [cancelled:: ...], [completion:: ...]
 *
 * @param content - 任务内容
 * @param task - 任务对象（会被直接修改）
 * @returns 返回 true 表示匹配到 Dataview 格式
 *
 * @deprecated 请使用 taskParser 模块中的 parseDataviewPriority 和 parseDataviewDates 函数
 * @see {@link ./taskParser/step4.ts} 中的新实现
 */
export function parseDataviewFormat(content: string, task: GCTask): boolean {
    // 解析优先级
    const priorityRegex = RegularExpressions.Dataview.priorityRegex;
    priorityRegex.lastIndex = 0;
    const priorityMatch = priorityRegex.exec(content);
    if (priorityMatch) {
        const priority = parsePriorityFromDataview(priorityMatch[1]);
        if (priority) {
            task.priority = priority;
        }
    }

    // 解析日期
    const dates = {
        createdDate: parseDataviewDateField(content, 'createdDate'),
        startDate: parseDataviewDateField(content, 'startDate'),
        scheduledDate: parseDataviewDateField(content, 'scheduledDate'),
        dueDate: parseDataviewDateField(content, 'dueDate'),
        cancelledDate: parseDataviewDateField(content, 'cancelledDate'),
        completionDate: parseDataviewDateField(content, 'completionDate'),
    };
    Object.assign(task, dates);

    if (task.cancelledDate && !task.completed) {
        task.cancelled = true;
    }

    const hasDataviewFormat = RegularExpressions.Dataview.formatDetectionRegex.test(content);
    if (hasDataviewFormat) {
        task.format = 'dataview';
    }

    return hasDataviewFormat;
}

/**
 * 解析 Dataview 格式的单个日期字段
 */
function parseDataviewDateField(content: string, field: string): Date | undefined {
    const fieldToRegex: Record<string, RegExp> = {
        createdDate: RegularExpressions.Dataview.createdDateRegex,
        startDate: RegularExpressions.Dataview.startDateRegex,
        scheduledDate: RegularExpressions.Dataview.scheduledDateRegex,
        dueDate: RegularExpressions.Dataview.dueDateRegex,
        cancelledDate: RegularExpressions.Dataview.cancelledDateRegex,
        completionDate: RegularExpressions.Dataview.completionDateRegex,
    };

    const regex = fieldToRegex[field];
    if (!regex) return undefined;

    regex.lastIndex = 0;
    const match = regex.exec(content);
    if (match && match[1]) {
        const date = createDate(match[1]);
        if (!isNaN(date.getTime())) {
            return date;
        }
    }
    return undefined;
}

/**
 * 转义正则表达式中的特殊字符
 *
 * @param string - 需要转义的字符串
 * @returns 转义后的字符串
 *
 * @deprecated 请使用 taskParser/utils 模块中的 escapeRegExp 函数
 * @see {@link ./taskParser/utils.ts}
 */
export function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 提取任务描述（移除所有元数据标记）
 *
 * 从任务内容中提取纯文本描述，移除：
 * - Tasks 格式的优先级 emoji (🔺⏫🔼🔽⏬)
 * - Tasks 格式的日期 emoji + 日期值 (➕🛫⏳📅❌✅ + 日期)
 * - Dataview 格式的字段 ([field:: value])
 *
 * @param content - 原始任务内容
 * @returns 清理后的任务描述
 *
 * @deprecated 请使用 taskParser/utils 模块中的 extractTaskDescription 函数
 * @see {@link ./taskParser/utils.ts}
 */
export function extractTaskDescription(content: string): string {
    let text = content;

    // 移除 Tasks emoji 优先级标记
    text = text.replace(RegularExpressions.DescriptionExtraction.removePriorityEmoji, ' ');

    // 移除 Tasks emoji 日期属性
    text = text.replace(RegularExpressions.DescriptionExtraction.removeTasksDate, ' ');

    // 移除 Dataview [field:: value] 块
    text = text.replace(RegularExpressions.DescriptionExtraction.removeDataviewField, ' ');

    // 折叠多余空格并修剪首尾空格
    text = text.replace(RegularExpressions.DescriptionExtraction.collapseWhitespace, ' ').trim();

    return text;
}

// ==================== 新模块导入说明 ====================

/**
 * 新的 taskParser 模块位于 ./taskParser/index.ts
 *
 * 建议使用此模块中的新接口，提供更清晰的四步解析流程：
 * - step1: 识别任务行
 * - step2: 筛选任务行
 * - step3: 判断格式
 * - step4: 解析属性
 *
 * @example
 * ```ts
 * import {
 *   parseTasksFromListItems,
 *   parseTaskLine,
 *   detectFormat
 * } from './taskParser';
 * ```
 */

// ==================== 迁移指南 ====================

/**
 * 迁移指南：
 *
 * 旧代码：
 * ```ts
 * import { parseTasksFormat, parseDataviewFormat } from './taskParser';
 *
 * const task = { ... };
 * parseTasksFormat(content, task);
 * parseDataviewFormat(content, task);
 * ```
 *
 * 新代码：
 * ```ts
 * import {
 *   parseTasksPriority,
 *   parseDataviewPriority,
 *   parseTasksFromListItems
 * } from './taskParser';
 *
 * // 或使用完整流程
 * import { parseTasksFromListItems } from './taskParser';
 *
 * const tasks = parseTasksFromListItems(file, lines, listItems, ['tasks', 'dataview'], '🎯 ');
 * ```
 */
