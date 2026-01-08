/**
 * 第四步：解析任务属性
 *
 * 负责根据任务格式（Tasks 或 Dataview）解析任务的具体属性。
 * 包括：复选框状态、优先级、各种日期字段。
 *
 * @fileoverview 任务属性解析
 * @module tasks/taskParser/step4
 */

import { RegularExpressions } from '../../utils/RegularExpressions';
import {
    TaskFormatType,
    PriorityLevel,
    DateFieldType,
    parsePriorityFromEmoji,
    parsePriorityFromDataview,
} from '../taskSerializerSymbols';
import { TaskStatusType, parseStatusFromCheckbox } from '../taskStatus';

// ==================== 类型定义 ====================

/**
 * 复选框状态解析结果
 */
export interface CheckboxStatus {
    /** 是否已完成 */
    completed: boolean;

    /** 是否已取消 */
    cancelled: boolean;

    /** 任务状态类型 */
    status: TaskStatusType;

    /** 原始状态字符 */
    originalStatus: string;
}

/**
 * 日期字段解析结果
 * 将日期字段名映射到对应的 Date 对象
 */
export type ParsedDates = Partial<Record<DateFieldType, Date>>;

/**
 * 任务属性解析结果
 * 包含所有可解析的任务属性
 */
export interface ParsedTaskAttributes {
    /** 优先级级别 */
    priority?: PriorityLevel;

    /** 解析出的日期字段 */
    dates: ParsedDates;

    /** 是否存在取消日期（用于设置 cancelled 状态） */
    hasCancelledDate: boolean;
}

// ==================== 复选框状态解析 ====================

/**
 * 解析复选框状态
 *
 * 根据复选框内的字符判断任务的完成状态。
 *
 * 支持的状态：
 * - `[ ]` (空格) → TODO → completed=false, cancelled=false
 * - `[x]` (x/X) → DONE → completed=true, cancelled=false
 * - `[!]` (!) → IMPORTANT → completed=false, cancelled=false
 * - `[-]` (-) → CANCELED → completed=false, cancelled=true
 * - `[/]` (/) → IN_PROGRESS → completed=false, cancelled=false
 * - `[?]` (?) → QUESTION → completed=false, cancelled=false
 * - `[n]` (n) → START → completed=false, cancelled=false
 *
 * @param status - 复选框状态字符
 * @returns 复选框状态对象
 *
 * @example
 * ```ts
 * parseCheckboxStatus(' ')  // { completed: false, cancelled: false, status: 'todo', originalStatus: ' ' }
 * parseCheckboxStatus('x')  // { completed: true, cancelled: false, status: 'done', originalStatus: 'x' }
 * parseCheckboxStatus('-')  // { completed: false, cancelled: true, status: 'canceled', originalStatus: '-' }
 * parseCheckboxStatus('/')  // { completed: false, cancelled: false, status: 'in_progress', originalStatus: '/' }
 * ```
 */
export function parseCheckboxStatus(status: string): CheckboxStatus {
    const normalized = status.toLowerCase();

    let completed = false;
    let cancelled = false;

    // 使用 taskStatus 中的状态映射
    const taskStatus = parseStatusFromCheckbox(status);

    // 判断完成状态
    if (normalized === 'x' || taskStatus === 'done') {
        completed = true;
    }

    // 判断取消状态（注意：是 [-] 不是 [/]）
    if (normalized === '-' || taskStatus === 'canceled') {
        cancelled = true;
    }

    return { completed, cancelled, status: taskStatus, originalStatus: status };
}

/**
 * 判断复选框是否为未完成状态
 *
 * @param status - 复选框状态字符
 * @returns 是否为未完成状态
 *
 * @example
 * ```ts
 * isIncomplete(' ')  // true
 * isIncomplete('x')  // false
 * isIncomplete('/')  // false
 * ```
 */
export function isIncomplete(status: string): boolean {
    return RegularExpressions.Checkbox.incompleteRegex.test(`[${status}]`);
}

/**
 * 判断复选框是否为完成状态
 *
 * @param status - 复选框状态字符
 * @returns 是否为完成状态
 *
 * @example
 * ```ts
 * isCompleted('x')  // true
 * isCompleted('X')  // true
 * isCompleted(' ')  // false
 * isCompleted('/')  // false
 * ```
 */
export function isCompleted(status: string): boolean {
    return RegularExpressions.Checkbox.completedRegex.test(`[${status}]`);
}

/**
 * 判断复选框是否为取消状态
 *
 * 注意：取消状态是 [-] 不是 [/]
 * [/] 是进行中状态 (IN_PROGRESS)
 *
 * @param status - 复选框状态字符
 * @returns 是否为取消状态
 *
 * @example
 * ```ts
 * isCancelled('-')  // true
 * isCancelled(' ')  // false
 * isCancelled('x')  // false
 * isCancelled('/')  // false (这是进行中状态，不是取消)
 * ```
 */
export function isCancelled(status: string): boolean {
    return status === '-';
}

// ==================== Tasks 格式解析 ====================

/**
 * 解析 Tasks 格式的优先级
 *
 * 从任务内容中提取优先级 emoji 并转换为优先级级别。
 *
 * @param content - 任务内容
 * @returns 优先级级别，未找到则返回 undefined
 *
 * @example
 * ```ts
 * parseTasksPriority("任务 ⏫ 内容")    // 返回: 'high'
 * parseTasksPriority("🔺 重要任务")     // 返回: 'highest'
 * parseTasksPriority("普通任务")        // 返回: undefined
 * ```
 */
export function parseTasksPriority(content: string): PriorityLevel | undefined {
    const regex = RegularExpressions.Tasks.priorityRegex;
    regex.lastIndex = 0; // 重置正则索引

    const match = regex.exec(content);
    if (!match) return undefined;

    return parsePriorityFromEmoji(match[1]);
}

/**
 * 解析 Tasks 格式的日期字段
 *
 * 从任务内容中提取所有日期字段（创建、开始、计划、截止、取消、完成）。
 *
 * @param content - 任务内容
 * @returns 日期字段映射对象
 *
 * @example
 * ```ts
 * parseTasksDates("任务 ➕ 2024-01-10 📅 2024-01-15")
 * // 返回: {
 * //   createdDate: Date('2024-01-10'),
 * //   dueDate: Date('2024-01-15')
 * // }
 * ```
 */
export function parseTasksDates(content: string): ParsedDates {
    const dates: ParsedDates = {};
    const { TASKS_FORMAT_CONFIG } = require('../taskSerializerSymbols');
    const config = TASKS_FORMAT_CONFIG as { regex: { dates: Record<string, RegExp> } };

    for (const [field, regex] of Object.entries(config.regex.dates)) {
        regex.lastIndex = 0; // 重置正则索引
        const match = regex.exec(content);
        if (match && match[1]) {
            dates[field as DateFieldType] = new Date(match[1]);
        }
    }

    return dates;
}

/**
 * 解析 Tasks 格式的所有属性
 *
 * 一次性解析 Tasks 格式的所有可解析属性。
 *
 * @param content - 任务内容
 * @returns 解析结果对象
 *
 * @example
 * ```ts
 * parseTasksAttributes("任务 ⏫ ➕ 2024-01-10 📅 2024-01-15")
 * // 返回: {
 * //   priority: 'high',
 * //   dates: {
 * //     createdDate: Date('2024-01-10'),
 * //     dueDate: Date('2024-01-15')
 * //   },
 * //   hasCancelledDate: false
 * // }
 * ```
 */
export function parseTasksAttributes(content: string): ParsedTaskAttributes {
    const priority = parseTasksPriority(content) || 'normal'; // 未指定优先级时默认为 normal
    const dates = parseTasksDates(content);

    return {
        priority,
        dates,
        hasCancelledDate: !!dates.cancelledDate,
    };
}

// ==================== Dataview 格式解析 ====================

/**
 * 解析 Dataview 格式的优先级
 *
 * 从任务内容中提取优先级字段并转换为优先级级别。
 *
 * @param content - 任务内容
 * @returns 优先级级别，未找到则返回 undefined
 *
 * @example
 * ```ts
 * parseDataviewPriority("任务 [priority:: high]")
 * // 返回: 'high'
 *
 * parseDataviewPriority("任务 [priority:: HIGHEST]")
 * // 返回: 'highest'
 *
 * parseDataviewPriority("普通任务")
 * // 返回: undefined
 * ```
 */
export function parseDataviewPriority(content: string): PriorityLevel | undefined {
    const regex = RegularExpressions.Dataview.priorityRegex;
    regex.lastIndex = 0;

    const match = regex.exec(content);
    if (!match) return undefined;

    return parsePriorityFromDataview(match[1]);
}

/**
 * 解析 Dataview 格式的日期字段
 *
 * 从任务内容中提取所有日期字段。
 *
 * @param content - 任务内容
 * @returns 日期字段映射对象
 *
 * @example
 * ```ts
 * parseDataviewDates("任务 [created:: 2024-01-10] [due:: 2024-01-15]")
 * // 返回: {
 * //   createdDate: Date('2024-01-10'),
 * //   dueDate: Date('2024-01-15')
 * // }
 * ```
 */
export function parseDataviewDates(content: string): ParsedDates {
    const dates: ParsedDates = {};
    const { DATAVIEW_FORMAT_CONFIG } = require('../taskSerializerSymbols');
    const config = DATAVIEW_FORMAT_CONFIG as { regex: { dates: Record<string, RegExp> } };

    for (const [field, regex] of Object.entries(config.regex.dates)) {
        regex.lastIndex = 0;
        const match = regex.exec(content);
        if (match && match[1]) {
            const date = new Date(match[1]);
            // 验证日期有效性
            if (!isNaN(date.getTime())) {
                dates[field as DateFieldType] = date;
            }
        }
    }

    return dates;
}

/**
 * 解析 Dataview 格式的所有属性
 *
 * 一次性解析 Dataview 格式的所有可解析属性。
 *
 * @param content - 任务内容
 * @returns 解析结果对象
 *
 * @example
 * ```ts
 * parseDataviewAttributes("任务 [priority:: high] [created:: 2024-01-10] [due:: 2024-01-15]")
 * // 返回: {
 * //   priority: 'high',
 * //   dates: {
 * //     createdDate: Date('2024-01-10'),
 * //     dueDate: Date('2024-01-15')
 * //   },
 * //   hasCancelledDate: false
 * // }
 * ```
 */
export function parseDataviewAttributes(content: string): ParsedTaskAttributes {
    const priority = parseDataviewPriority(content) || 'normal'; // 未指定优先级时默认为 normal
    const dates = parseDataviewDates(content);

    return {
        priority,
        dates,
        hasCancelledDate: !!dates.cancelledDate,
    };
}

// ==================== 统一解析接口 ====================

/**
 * 统一的任务属性解析器
 *
 * 根据格式自动选择正确的解析方法，返回统一格式的解析结果。
 *
 * @param content - 任务内容
 * @param format - 任务格式类型
 * @returns 解析结果对象
 *
 * @example
 * ```ts
 * // Tasks 格式
 * parseTaskAttributes("任务 ⏫ 📅 2024-01-15", 'tasks')
 * // 返回: { priority: 'high', dates: { dueDate: Date }, hasCancelledDate: false }
 *
 * // Dataview 格式
 * parseTaskAttributes("任务 [priority:: high] [due:: 2024-01-15]", 'dataview')
 * // 返回: { priority: 'high', dates: { dueDate: Date }, hasCancelledDate: false }
 * ```
 */
export function parseTaskAttributes(
    content: string,
    format: TaskFormatType
): ParsedTaskAttributes {
    if (format === 'tasks') {
        return parseTasksAttributes(content);
    } else if (format === 'dataview') {
        return parseDataviewAttributes(content);
    }

    // 未知格式返回空结果（优先级默认为 normal）
    return {
        priority: 'normal',
        dates: {},
        hasCancelledDate: false,
    };
}

/**
 * 解析特定日期字段
 *
 * 从任务内容中解析指定的日期字段，自动处理 Tasks 和 Dataview 两种格式。
 *
 * @param content - 任务内容
 * @param field - 日期字段类型
 * @param format - 任务格式类型
 * @returns 日期对象或 undefined
 *
 * @example
 * ```ts
 * parseDateField("任务 📅 2024-01-15", 'dueDate', 'tasks')
 * // 返回: Date('2024-01-15')
 *
 * parseDateField("任务 [due:: 2024-01-15]", 'dueDate', 'dataview')
 * // 返回: Date('2024-01-15')
 * ```
 */
export function parseDateField(
    content: string,
    field: DateFieldType,
    format: TaskFormatType
): Date | undefined {
    const { TASKS_FORMAT_CONFIG, DATAVIEW_FORMAT_CONFIG } = require('../taskSerializerSymbols');

    const regex =
        format === 'tasks'
            ? TASKS_FORMAT_CONFIG.regex.dates[field]
            : DATAVIEW_FORMAT_CONFIG.regex.dates[field];

    regex.lastIndex = 0;
    const match = regex.exec(content);

    if (match && match[1]) {
        const date = new Date(match[1]);
        return isNaN(date.getTime()) ? undefined : date;
    }

    return undefined;
}
