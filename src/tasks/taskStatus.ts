/**
 * 任务状态定义
 *
 * 统一管理所有任务状态及其配置。
 * 所有颜色配置都从插件设置中读取。
 *
 * @fileoverview 任务状态定义和管理
 * @module tasks/taskStatus
 */

import { i18n } from '../i18n/i18n';

// ==================== 类型定义 ====================

/**
 * 默认任务状态类型（不可删除）
 */
export type DefaultTaskStatusType = 'todo' | 'done';

/**
 * 任务状态类型（包括用户自定义）
 */
export type TaskStatusType = string;

/**
 * 主题模式类型
 */
export type ThemeMode = 'light' | 'dark';

/**
 * 主题颜色配置
 */
export interface ThemeColors {
    /** 卡片背景色 (hex) */
    backgroundColor: string;
    /** 文字颜色 (hex) */
    textColor: string;
}

/**
 * 任务状态配置接口
 */
export interface TaskStatus {
    /** 状态唯一标识 */
    key: TaskStatusType;

    /** 复选框符号 (单个字符) */
    symbol: string;

    /** 显示名称 */
    name: string;

    /** 描述 */
    description: string;

    /** 亮色主题颜色配置 */
    lightColors: ThemeColors;

    /** 暗色主题颜色配置 */
    darkColors: ThemeColors;

    /** 
     * 卡片背景色 (hex)
     * @deprecated 向后兼容保留。请使用 lightColors.backgroundColor 代替
     */
    backgroundColor?: string;

    /** 
     * 文字颜色 (hex)
     * @deprecated 向后兼容保留。请使用 lightColors.textColor 代替
     */
    textColor?: string;

    /** 是否为默认状态 */
    isDefault: boolean;
}

// ==================== 遗留字段辅助 ====================

/**
 * 通过类型擦除访问 TaskStatus 上已弃用的 backgroundColor / textColor。
 * 使用 `as Record<string, unknown>` 绕过 @typescript-eslint/no-deprecated，
 * 从而无需 eslint-disable 注释。
 */
export function getLegacyColor(
    status: TaskStatus,
    field: 'backgroundColor' | 'textColor'
): string | undefined {
    return (status as unknown as Record<string, unknown>)[field] as string | undefined;
}

/**
 * 删除 TaskStatus 上已弃用的 backgroundColor / textColor 字段。
 * 迁移代码专用，正常运行时不应调用。
 */
export function deleteLegacyColors(status: TaskStatus): void {
    const rec = status as unknown as Record<string, unknown>;
    delete rec.backgroundColor;
    delete rec.textColor;
}

// ==================== 默认状态配置 ====================

/**
 * 默认任务状态配置（不可删除）
 *
 * 仅包含待办和已完成两种核心状态。
 */
export const DEFAULT_TASK_STATUSES: TaskStatus[] = [
    {
        key: 'todo',
        symbol: ' ',
        name: i18n.t('taskStatus.todo'),
        description: i18n.t('taskStatus.todoDescription'),
        lightColors: {
            backgroundColor: '#FFFFFF',
            textColor: '#333333',
        },
        darkColors: {
            backgroundColor: '#2d333b',
            textColor: '#adbac7',
        },
        isDefault: true,
    },
    {
        key: 'done',
        symbol: 'x',
        name: i18n.t('taskStatus.done'),
        description: i18n.t('taskStatus.doneDescription'),
        lightColors: {
            backgroundColor: '#52c41a',
            textColor: '#FFFFFF',
        },
        darkColors: {
            backgroundColor: '#3c8524',
            textColor: '#e6e6e6',
        },
        isDefault: true,
    },
];

/**
 * 预设自定义状态
 *
 * 初始安装时作为自定义状态提供，用户可修改或删除。
 */
export const PRESET_CUSTOM_STATUSES: TaskStatus[] = [
    {
        key: 'important',
        symbol: '!',
        name: i18n.t('taskStatus.important'),
        description: i18n.t('taskStatus.importantDescription'),
        lightColors: {
            backgroundColor: '#ff4d4f',
            textColor: '#FFFFFF',
        },
        darkColors: {
            backgroundColor: '#cc3a3c',
            textColor: '#ffe6e6',
        },
        isDefault: false,
    },
    {
        key: 'canceled',
        symbol: '-',
        name: i18n.t('taskStatus.canceled'),
        description: i18n.t('taskStatus.canceledDescription'),
        lightColors: {
            backgroundColor: '#d9d9d9',
            textColor: '#666666',
        },
        darkColors: {
            backgroundColor: '#4a525c',
            textColor: '#8b949e',
        },
        isDefault: false,
    },
    {
        key: 'in_progress',
        symbol: '/',
        name: i18n.t('taskStatus.inProgress'),
        description: i18n.t('taskStatus.inProgressDescription'),
        lightColors: {
            backgroundColor: '#faad14',
            textColor: '#FFFFFF',
        },
        darkColors: {
            backgroundColor: '#c78a0f',
            textColor: '#fff5e6',
        },
        isDefault: false,
    },
    {
        key: 'question',
        symbol: '?',
        name: i18n.t('taskStatus.question'),
        description: i18n.t('taskStatus.questionDescription'),
        lightColors: {
            backgroundColor: '#ffc069',
            textColor: '#333333',
        },
        darkColors: {
            backgroundColor: '#cc9a54',
            textColor: '#ffe6cc',
        },
        isDefault: false,
    },
    {
        key: 'start',
        symbol: 'n',
        name: i18n.t('taskStatus.started'),
        description: i18n.t('taskStatus.startedDescription'),
        lightColors: {
            backgroundColor: '#40a9ff',
            textColor: '#FFFFFF',
        },
        darkColors: {
            backgroundColor: '#3387cc',
            textColor: '#e6f3ff',
        },
        isDefault: false,
    },
];

/**
 * 所有内置状态（默认 + 预设自定义）
 *
 * 用作工具函数的默认参数，确保所有内置符号都能被识别。
 */
export const ALL_BUILTIN_STATUSES: TaskStatus[] = [
    ...DEFAULT_TASK_STATUSES,
    ...PRESET_CUSTOM_STATUSES,
];

// ==================== 马卡龙配色 ====================

/**
 * 马卡龙配色方案
 *
 * 仅供设置界面的色卡选择器使用。
 * 用户可以从这些预设颜色中快速选择状态颜色。
 */
export const MACARON_COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B195', '#A3E4D7',
    '#FFB6B9', '#C7CEEA', '#FFD700', '#98D8C8', '#FAD7A0',
    '#FFCC5C', '#F4E1D2', '#FFA07A', '#C8F7C5', '#B8E0D2',
];

// ==================== 状态符号验证 ====================

/**
 * 状态符号验证正则
 *
 * 接受任意单个非空白字符作为状态符号
 */
export const STATUS_SYMBOL_REGEX = /^\S$/;

/**
 * 禁止使用的符号列表
 *
 * 仅禁止会破坏复选框语法（- [x]）的字符
 */
export const STATUS_SYMBOL_EXCLUDED = ['[', ']'];

/**
 * 保留的符号列表（用于默认状态）
 *
 * 仅待办（空格）和已完成（x）为不可删除的默认状态
 */
export const RESERVED_SYMBOLS = [' ', 'x'];

/**
 * 根据当前语言刷新默认和预设状态的名称与描述
 * 用于用户切换语言时更新已持久化的状态配置
 */
export function refreshPresetStatusNames(statuses: TaskStatus[]): void {
	const keyToI18n: Record<string, { nameKey: string; descKey: string }> = {
		todo: { nameKey: 'taskStatus.todo', descKey: 'taskStatus.todoDescription' },
		done: { nameKey: 'taskStatus.done', descKey: 'taskStatus.doneDescription' },
		important: { nameKey: 'taskStatus.important', descKey: 'taskStatus.importantDescription' },
		canceled: { nameKey: 'taskStatus.canceled', descKey: 'taskStatus.canceledDescription' },
		in_progress: { nameKey: 'taskStatus.inProgress', descKey: 'taskStatus.inProgressDescription' },
		question: { nameKey: 'taskStatus.question', descKey: 'taskStatus.questionDescription' },
		start: { nameKey: 'taskStatus.started', descKey: 'taskStatus.startedDescription' },
	};

	for (const status of statuses) {
		const mapping = keyToI18n[status.key];
		if (mapping) {
			status.name = i18n.t(mapping.nameKey);
			status.description = i18n.t(mapping.descKey);
		}
	}
}

// ==================== 工具函数 ====================

/**
 * 根据符号获取状态配置
 *
 * @param symbol - 复选框符号
 * @param statuses - 状态配置列表（默认使用 DEFAULT_TASK_STATUSES）
 * @returns 状态配置对象，未找到则返回 undefined
 *
 * @example
 * ```ts
 * getStatusBySymbol('x')  // { key: 'done', symbol: 'x', ... }
 * getStatusBySymbol(' ')  // { key: 'todo', symbol: ' ', ... }
 * getStatusBySymbol('z')  // undefined
 * ```
 */
export function getStatusBySymbol(
    symbol: string,
    statuses: TaskStatus[] = ALL_BUILTIN_STATUSES
): TaskStatus | undefined {
    return statuses.find(s => s.symbol === symbol);
}

/**
 * 根据状态 key 获取状态配置
 *
 * @param key - 状态 key
 * @param statuses - 状态配置列表（默认使用 DEFAULT_TASK_STATUSES）
 * @returns 状态配置对象，未找到则返回 undefined
 *
 * @example
 * ```ts
 * getStatusByKey('done')  // { key: 'done', symbol: 'x', ... }
 * getStatusByKey('todo')  // { key: 'todo', symbol: ' ', ... }
 * ```
 */
export function getStatusByKey(
    key: string,
    statuses: TaskStatus[] = ALL_BUILTIN_STATUSES
): TaskStatus | undefined {
    return statuses.find(s => s.key === key);
}

/**
 * 验证状态符号是否有效
 *
 * @param symbol - 待验证的符号
 * @param isCustom - 是否为用户自定义状态（默认为 true）
 * @returns 验证结果，包含是否有效和错误信息
 *
 * @example
 * ```ts
 * validateStatusSymbol('a')     // { valid: true }
 * validateStatusSymbol('!')     // { valid: true }
 * validateStatusSymbol('/')     // { valid: true }
 * validateStatusSymbol('x', false)  // { valid: true } （非自定义，允许使用保留符号）
 * ```
 */
export function validateStatusSymbol(
    symbol: string,
    isCustom: boolean = true
): { valid: boolean; error?: string } {
    // 必须是单个字符
    if (symbol.length !== 1) {
        return { valid: false, error: i18n.t('taskStatus.validation.symbolSingleChar') };
    }

    // 自定义状态不能使用保留符号
    if (isCustom && RESERVED_SYMBOLS.includes(symbol)) {
        return { valid: false, error: i18n.t('taskStatus.validation.symbolReserved', { symbol }) };
    }

    // 不能使用禁止的符号
    if (STATUS_SYMBOL_EXCLUDED.includes(symbol)) {
        return { valid: false, error: i18n.t('taskStatus.validation.symbolSpecial') };
    }

    // 必须符合正则（非空白字符）
    if (!STATUS_SYMBOL_REGEX.test(symbol)) {
        return { valid: false, error: i18n.t('taskStatus.validation.symbolWhitespace') };
    }

    return { valid: true };
}

/**
 * 获取状态颜色配置
 *
 * @param statusKey - 状态 key
 * @param statuses - 状态配置列表
 * @param themeMode - 主题模式 ('light' | 'dark')，默认自动检测
 * @returns 颜色配置对象，未找到则返回 undefined
 *
 * @example
 * ```ts
 * getStatusColor('done', DEFAULT_TASK_STATUSES)
 * // { bg: '#52c41a', text: '#FFFFFF' }
 * getStatusColor('done', DEFAULT_TASK_STATUSES, 'dark')
 * // { bg: '#3c8524', text: '#e6e6e6' }
 * ```
 */
export function getStatusColor(
    statusKey: string,
    statuses: TaskStatus[],
    themeMode?: ThemeMode
): { bg: string; text: string } | undefined {
    const status = statuses.find(s => s.key === statusKey);
    if (!status) return undefined;

    // 确定主题模式
    const mode = themeMode ?? getCurrentThemeMode();

    // 处理新旧数据格式兼容，并使用合理的默认值
    if (status.lightColors && status.darkColors) {
        // 新格式：使用主题分离颜色
        const colors = mode === 'dark' ? status.darkColors : status.lightColors;
        return {
            bg: colors.backgroundColor || (mode === 'dark' ? '#2d333b' : '#FFFFFF'),
            text: colors.textColor || (mode === 'dark' ? '#adbac7' : '#333333'),
        };
    } else {
        // 旧格式：使用单一颜色（向后兼容）
        const bg = getLegacyColor(status, 'backgroundColor');
        const text = getLegacyColor(status, 'textColor');
        if (bg && text) {
            return { bg, text };
        }
    }

    // 如果没有任何颜色配置，返回基于当前主题的默认值
    // 这确保了即使状态数据不完整，也能正常显示
    return {
        bg: mode === 'dark' ? '#2d333b' : '#FFFFFF',
        text: mode === 'dark' ? '#adbac7' : '#333333',
    };
}

/**
 * 获取当前主题模式
 *
 * @returns 当前主题模式 ('light' | 'dark')
 */
export function getCurrentThemeMode(): ThemeMode {
    return activeDocument.body.hasClass('theme-dark') ? 'dark' : 'light';
}

/**
 * 根据复选框状态字符解析状态类型
 *
 * @param checkboxStatus - 复选框状态字符
 * @param statuses - 状态配置列表（默认使用 DEFAULT_TASK_STATUSES）
 * @returns 状态 key，未找到则返回 'todo'
 *
 * @example
 * ```ts
 * parseStatusFromCheckbox('x')  // 'done'
 * parseStatusFromCheckbox(' ')  // 'todo'
 * parseStatusFromCheckbox('/')  // 'in_progress'
 * parseStatusFromCheckbox('-')  // 'canceled'
 * ```
 */
export function parseStatusFromCheckbox(
    checkboxStatus: string,
    statuses: TaskStatus[] = ALL_BUILTIN_STATUSES
): string {
    const status = statuses.find(s => s.symbol === checkboxStatus);
    return status?.key || 'todo';
}

/**
 * 检查是否为默认状态
 *
 * @param key - 状态 key
 * @returns 是否为默认状态
 */
export function isDefaultStatus(key: string): key is DefaultTaskStatusType {
    return DEFAULT_TASK_STATUSES.some(s => s.key === key);
}

/**
 * 获取所有默认状态的 key 列表
 *
 * @returns 默认状态 key 数组
 */
export function getDefaultStatusKeys(): DefaultTaskStatusType[] {
    return DEFAULT_TASK_STATUSES.map(s => s.key as DefaultTaskStatusType);
}
