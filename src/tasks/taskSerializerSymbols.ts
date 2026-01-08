/**
 * 任务格式符号映射配置
 *
 * 作为中间层，将 GCTask 属性映射到 Tasks 或 Dataview 格式的具体字段和正则匹配项。
 * 提供 formatDetection、parsePriority、parseDates 等解析功能的统一接口。
 *
 * @fileoverview 任务格式符号映射和正则表达式配置
 * @module tasks/taskSerializerSymbols
 */

import { RegularExpressions } from '../utils/RegularExpressions';

// ==================== 类型定义 ====================

/**
 * 任务格式类型
 * 'tasks' - Obsidian Tasks 插件的 emoji 格式
 * 'dataview' - Dataview 插件的 inline field 格式
 */
export type TaskFormatType = 'tasks' | 'dataview';

/**
 * 优先级级别
 * 对应 GCTask.priority 属性的六种级别
 */
export type PriorityLevel = 'highest' | 'high' | 'medium' | 'normal' | 'low' | 'lowest';

/**
 * 日期字段类型
 * 对应 GCTask 中的日期属性
 */
export type DateFieldType =
    | 'createdDate'
    | 'startDate'
    | 'scheduledDate'
    | 'dueDate'
    | 'cancelledDate'
    | 'completionDate';

// ==================== 接口定义 ====================

/**
 * 符号映射接口
 * 定义 GCTask 属性到具体格式符号的映射关系
 */
export interface TaskSymbolMapping {
    /** 优先级符号映射 */
    priority: Readonly<Record<PriorityLevel, string>>;

    /** 日期字段符号映射 */
    dates: Readonly<Record<DateFieldType, string>>;
}

/**
 * 正则表达式映射接口
 * 定义各字段对应的匹配正则表达式
 */
export interface TaskRegexMapping {
    /** 优先级匹配正则 */
    priority: RegExp;

    /** 日期字段正则映射 */
    dates: Readonly<Record<DateFieldType, RegExp>>;

    /** 格式检测正则（快速判断是否包含该格式的标记） */
    formatDetection: RegExp;
}

/**
 * 任务格式配置接口
 * 完整定义一种任务格式的符号和正则配置
 */
export interface TaskFormatConfig {
    /** 格式类型标识 */
    readonly type: TaskFormatType;

    /** 格式名称（用于显示） */
    readonly name: string;

    /** 符号映射 */
    readonly symbols: TaskSymbolMapping;

    /** 正则表达式映射 */
    readonly regex: TaskRegexMapping;
}

// ==================== Tasks 格式配置 ====================

/**
 * Tasks 格式配置
 * 基于 Obsidian Tasks 插件的 emoji 格式
 *
 * @example
 * - [ ] 任务 ⏫ ➕ 2024-01-10 📅 2024-01-15
 */
export const TASKS_FORMAT_CONFIG: TaskFormatConfig = {
    type: 'tasks',
    name: 'Tasks (Emoji)',

    symbols: {
        priority: {
            highest: RegularExpressions.Tasks.prioritySymbols.highest,
            high: RegularExpressions.Tasks.prioritySymbols.high,
            medium: RegularExpressions.Tasks.prioritySymbols.medium,
            normal: '', // normal 优先级不输出 emoji
            low: RegularExpressions.Tasks.prioritySymbols.low,
            lowest: RegularExpressions.Tasks.prioritySymbols.lowest,
        },
        dates: {
            createdDate: RegularExpressions.Tasks.dateSymbols.created,
            startDate: RegularExpressions.Tasks.dateSymbols.start,
            scheduledDate: RegularExpressions.Tasks.dateSymbols.scheduled,
            dueDate: RegularExpressions.Tasks.dateSymbols.due,
            cancelledDate: RegularExpressions.Tasks.dateSymbols.cancelled,
            completionDate: RegularExpressions.Tasks.dateSymbols.completion,
        },
    },

    regex: {
        priority: RegularExpressions.Tasks.priorityRegex,
        dates: {
            createdDate: RegularExpressions.Tasks.createdDateRegex,
            startDate: RegularExpressions.Tasks.startDateRegex,
            scheduledDate: RegularExpressions.Tasks.scheduledDateRegex,
            dueDate: RegularExpressions.Tasks.dueDateRegex,
            cancelledDate: RegularExpressions.Tasks.cancelledDateRegex,
            completionDate: RegularExpressions.Tasks.completionDateRegex,
        },
        formatDetection: RegularExpressions.Tasks.formatDetectionRegex,
    },
} as const;

// ==================== Dataview 格式配置 ====================

/**
 * Dataview 格式配置
 * 基于 Dataview 插件的 inline field 格式
 *
 * @example
 * - [ ] 任务 [priority:: high] [created:: 2024-01-10] [due:: 2024-01-15]
 */
export const DATAVIEW_FORMAT_CONFIG: TaskFormatConfig = {
    type: 'dataview',
    name: 'Dataview (Fields)',

    symbols: {
        priority: {
            highest: 'priority:: highest',
            high: 'priority:: high',
            medium: 'priority:: medium',
            normal: 'priority:: normal',
            low: 'priority:: low',
            lowest: 'priority:: lowest',
        },
        dates: {
            createdDate: '[created::',
            startDate: '[start::',
            scheduledDate: '[scheduled::',
            dueDate: '[due::',
            cancelledDate: '[cancelled::',
            completionDate: '[completion::',
        },
    },

    regex: {
        priority: RegularExpressions.Dataview.priorityRegex,
        dates: {
            createdDate: RegularExpressions.Dataview.createdDateRegex,
            startDate: RegularExpressions.Dataview.startDateRegex,
            scheduledDate: RegularExpressions.Dataview.scheduledDateRegex,
            dueDate: RegularExpressions.Dataview.dueDateRegex,
            cancelledDate: RegularExpressions.Dataview.cancelledDateRegex,
            completionDate: RegularExpressions.Dataview.completionDateRegex,
        },
        formatDetection: RegularExpressions.Dataview.formatDetectionRegex,
    },
} as const;

// ==================== 格式注册表 ====================

/**
 * 格式配置注册表
 * 提供按类型访问格式配置的统一入口
 */
export const FORMAT_CONFIGS: Readonly<Record<TaskFormatType, TaskFormatConfig>> = {
    tasks: TASKS_FORMAT_CONFIG,
    dataview: DATAVIEW_FORMAT_CONFIG,
} as const;

// ==================== 工具函数 ====================

/**
 * 获取指定格式的配置
 *
 * @param format - 格式类型
 * @returns 对应的格式配置对象
 *
 * @example
 * ```ts
 * const tasksConfig = getFormatConfig('tasks');
 * console.log(tasksConfig.symbols.priority.high); // "⏫"
 * ```
 */
export function getFormatConfig(format: TaskFormatType): TaskFormatConfig {
    return FORMAT_CONFIGS[format];
}

/**
 * 检测任务内容使用的格式
 *
 * 根据内容中的特征判断使用的是 Tasks 格式、Dataview 格式，还是两者混用。
 *
 * @param content - 任务内容（复选框后的部分）
 * @param enabledFormats - 启用的格式列表
 * @returns 检测到的格式类型，'mixed' 表示混用，undefined 表示无法检测
 *
 * @example
 * ```ts
 * detectTaskFormat("任务 ⏫ 📅 2024-01-15", ['tasks', 'dataview'])
 * // 返回: 'tasks'
 *
 * detectTaskFormat("任务 [priority:: high] [due:: 2024-01-15]", ['tasks', 'dataview'])
 * // 返回: 'dataview'
 *
 * detectTaskFormat("任务 ⏫ [due:: 2024-01-15]", ['tasks', 'dataview'])
 * // 返回: 'mixed'
 * ```
 */
export function detectTaskFormat(
    content: string,
    enabledFormats: TaskFormatType[]
): TaskFormatType | 'mixed' | undefined {
    const hasTasks =
        enabledFormats.includes('tasks') &&
        TASKS_FORMAT_CONFIG.regex.formatDetection.test(content);

    const hasDataview =
        enabledFormats.includes('dataview') &&
        DATAVIEW_FORMAT_CONFIG.regex.formatDetection.test(content);

    // 两种格式都存在时，视为混合格式
    if (hasTasks && hasDataview) {
        return 'mixed';
    }

    if (hasTasks) return 'tasks';
    if (hasDataview) return 'dataview';

    return undefined;
}

/**
 * 从 emoji 符号解析优先级
 *
 * @param symbol - 优先级 emoji 符号
 * @returns 对应的优先级级别，无法识别则返回 undefined
 *
 * @example
 * ```ts
 * parsePriorityFromEmoji('⏫')  // 返回: 'high'
 * parsePriorityFromEmoji('🔺')  // 返回: 'highest'
 * parsePriorityFromEmoji('❓')  // 返回: undefined
 * ```
 */
export function parsePriorityFromEmoji(symbol: string): PriorityLevel | undefined {
    for (const [level, emoji] of Object.entries(TASKS_FORMAT_CONFIG.symbols.priority)) {
        if (symbol === emoji) {
            return level as PriorityLevel;
        }
    }
    return undefined;
}

/**
 * 从 Dataview 字段值解析优先级
 *
 * @param value - Dataview 优先级字段值
 * @returns 对应的优先级级别，无法识别则返回 undefined
 *
 * @example
 * ```ts
 * parsePriorityFromDataview('high')    // 返回: 'high'
 * parsePriorityFromDataview('HIGHEST') // 返回: 'highest'
 * parsePriorityFromDataview('invalid') // 返回: undefined
 * ```
 */
export function parsePriorityFromDataview(value: string): PriorityLevel | undefined {
    const normalized = value.toLowerCase().trim();
    if (RegularExpressions.Dataview.priorityValues.includes(normalized as PriorityLevel)) {
        return normalized as PriorityLevel;
    }
    return undefined;
}

/**
 * 将优先级级别转换为 Tasks 格式的 emoji 符号
 *
 * @param level - 优先级级别
 * @returns 对应的 emoji 符号
 *
 * @example
 * ```ts
 * priorityLevelToEmoji('high')   // 返回: '⏫'
 * priorityLevelToEmoji('medium') // 返回: '🔼'
 * ```
 */
export function priorityLevelToEmoji(level: PriorityLevel): string {
    return TASKS_FORMAT_CONFIG.symbols.priority[level];
}

/**
 * 将优先级级别转换为 Dataview 格式的字段表示
 *
 * @param level - 优先级级别
 * @returns Dataview 字段表示（如 "[priority:: high]"）
 *
 * @example
 * ```ts
 * priorityLevelToDataview('high')   // 返回: "[priority:: high]"
 * priorityLevelToDataview('medium') // 返回: "[priority:: medium]"
 * ```
 */
export function priorityLevelToDataview(level: PriorityLevel): string {
    return TASKS_FORMAT_CONFIG.symbols.priority[level];
}
