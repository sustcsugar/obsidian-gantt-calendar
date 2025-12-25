/**
 * 任务状态定义
 *
 * 统一管理所有任务状态及其配置。
 * 所有颜色配置都从插件设置中读取。
 *
 * @fileoverview 任务状态定义和管理
 * @module tasks/taskStatus
 */

// ==================== 类型定义 ====================

/**
 * 默认任务状态类型
 */
export type DefaultTaskStatusType =
    | 'todo'
    | 'done'
    | 'important'
    | 'canceled'
    | 'in_progress'
    | 'question'
    | 'start';

/**
 * 任务状态类型（包括用户自定义）
 */
export type TaskStatusType = DefaultTaskStatusType | string;

/**
 * 复选框样式类型
 */
export type CheckboxIconStyle =
    | 'square'        // 方形复选框（默认）
    | 'circle'        // 圆形复选框
    | 'rounded'       // 圆角方形
    | 'minimal'       // 极简样式（无背景）
    | 'filled';       // 填充样式

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

    /** 卡片背景色 (hex) */
    backgroundColor: string;

    /** 文字颜色 (hex) */
    textColor: string;

    /** 复选框颜色 (hex) */
    checkboxColor: string;

    /** 复选框图标样式 */
    checkboxIcon: CheckboxIconStyle;

    /** 是否为默认状态 */
    isDefault: boolean;
}

// ==================== 默认状态配置 ====================

/**
 * 默认任务状态配置
 *
 * 用于插件初始化时的默认值。
 * 包含 7 种预定义状态。
 */
export const DEFAULT_TASK_STATUSES: TaskStatus[] = [
    {
        key: 'todo',
        symbol: ' ',
        name: '待办',
        description: '待办任务',
        backgroundColor: '#FFFFFF',
        textColor: '#333333',
        checkboxColor: '#999999',
        checkboxIcon: 'square',
        isDefault: true,
    },
    {
        key: 'done',
        symbol: 'x',
        name: '已完成',
        description: '已完成任务',
        backgroundColor: '#52c41a',
        textColor: '#FFFFFF',
        checkboxColor: '#52c41a',
        checkboxIcon: 'filled',
        isDefault: true,
    },
    {
        key: 'important',
        symbol: '!',
        name: '重要',
        description: '重要任务',
        backgroundColor: '#ff4d4f',
        textColor: '#FFFFFF',
        checkboxColor: '#ff4d4f',
        checkboxIcon: 'rounded',
        isDefault: true,
    },
    {
        key: 'canceled',
        symbol: '-',
        name: '已取消',
        description: '已取消任务',
        backgroundColor: '#d9d9d9',
        textColor: '#666666',
        checkboxColor: '#d9d9d9',
        checkboxIcon: 'minimal',
        isDefault: true,
    },
    {
        key: 'in_progress',
        symbol: '/',
        name: '进行中',
        description: '进行中任务',
        backgroundColor: '#faad14',
        textColor: '#FFFFFF',
        checkboxColor: '#faad14',
        checkboxIcon: 'circle',
        isDefault: true,
    },
    {
        key: 'question',
        symbol: '?',
        name: '有疑问',
        description: '有疑问任务',
        backgroundColor: '#ffc069',
        textColor: '#333333',
        checkboxColor: '#ffc069',
        checkboxIcon: 'rounded',
        isDefault: true,
    },
    {
        key: 'start',
        symbol: 'n',
        name: '已开始',
        description: '已开始任务',
        backgroundColor: '#40a9ff',
        textColor: '#FFFFFF',
        checkboxColor: '#40a9ff',
        checkboxIcon: 'square',
        isDefault: true,
    },
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
 * 只接受字母和数字作为状态符号
 */
export const STATUS_SYMBOL_REGEX = /^[a-zA-Z0-9]$/;

/**
 * 禁止使用的符号列表
 *
 * 这些符号有特殊含义或可能与 Markdown 语法冲突
 */
export const STATUS_SYMBOL_EXCLUDED = ['/', '|', '_', '$', '#', '^', '*'];

/**
 * 保留的符号列表（用于默认状态）
 *
 * 这些符号被默认状态使用，不允许用户自定义时使用
 */
export const RESERVED_SYMBOLS = [' ', 'x', '!', '-', '/', '?', 'n'];

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
    statuses: TaskStatus[] = DEFAULT_TASK_STATUSES
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
    statuses: TaskStatus[] = DEFAULT_TASK_STATUSES
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
 * validateStatusSymbol('/')     // { valid: false, error: '符号不能使用特殊字符' }
 * validateStatusSymbol('x', false)  // { valid: true } （非自定义，允许使用保留符号）
 * ```
 */
export function validateStatusSymbol(
    symbol: string,
    isCustom: boolean = true
): { valid: boolean; error?: string } {
    // 必须是单个字符
    if (symbol.length !== 1) {
        return { valid: false, error: '符号必须是单个字符' };
    }

    // 自定义状态不能使用保留符号
    if (isCustom && RESERVED_SYMBOLS.includes(symbol)) {
        return { valid: false, error: `符号 "${symbol}" 已被默认状态使用` };
    }

    // 不能使用禁止的符号
    if (STATUS_SYMBOL_EXCLUDED.includes(symbol)) {
        return { valid: false, error: '符号不能使用特殊字符' };
    }

    // 必须符合正则（字母或数字）
    if (!STATUS_SYMBOL_REGEX.test(symbol)) {
        return { valid: false, error: '符号只能是字母或数字' };
    }

    return { valid: true };
}

/**
 * 获取状态颜色配置
 *
 * @param statusKey - 状态 key
 * @param statuses - 状态配置列表
 * @returns 颜色配置对象，未找到则返回 undefined
 *
 * @example
 * ```ts
 * getStatusColor('done', DEFAULT_TASK_STATUSES)
 * // { bg: '#52c41a', text: '#FFFFFF' }
 * ```
 */
export function getStatusColor(
    statusKey: string,
    statuses: TaskStatus[]
): { bg: string; text: string } | undefined {
    const status = statuses.find(s => s.key === statusKey);
    if (!status) return undefined;

    return {
        bg: status.backgroundColor,
        text: status.textColor,
    };
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
    statuses: TaskStatus[] = DEFAULT_TASK_STATUSES
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
