/**
 * 工具函数
 *
 * 提供任务解析过程中使用的通用工具函数。
 * 包括描述提取、正则转义等辅助功能。
 *
 * @fileoverview 任务解析工具函数
 * @module tasks/taskParser/utils
 */

import { RegularExpressions } from '../../utils/RegularExpressions';

// ==================== 描述提取 ====================

/**
 * 提取任务描述（移除所有元数据标记）
 *
 * 从任务内容中提取纯文本描述，移除以下内容：
 * - Tasks 格式的优先级 emoji（🔺⏫🔼🔽⏬）
 * - Tasks 格式的日期属性（emoji + 日期值）
 * - Dataview 格式的字段（[field:: value]）
 *
 * @param content - 原始任务内容
 * @returns 清理后的任务描述
 *
 * @example
 * ```ts
 * // Tasks 格式
 * extractTaskDescription("🎯 完成项目 ⏫ ➕ 2024-01-10 📅 2024-01-15")
 * // 返回: "🎯 完成项目"
 *
 * // Dataview 格式
 * extractTaskDescription("任务 [priority:: high] [created:: 2024-01-10] [due:: 2024-01-15]")
 * // 返回: "任务"
 *
 * // 混合格式
 * extractTaskDescription("任务 ⏫ [due:: 2024-01-15]")
 * // 返回: "任务"
 *
 * // 普通文本
 * extractTaskDescription("普通任务描述")
 * // 返回: "普通任务描述"
 * ```
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

/**
 * 提取任务描述（Tasks 格式专用）
 *
 * 仅移除 Tasks 格式的元数据标记，保留 Dataview 格式的内容。
 *
 * @param content - 原始任务内容
 * @returns 清理后的任务描述
 *
 * @example
 * ```ts
 * extractTasksDescription("任务 ⏫ 📅 2024-01-15")
 * // 返回: "任务"
 *
 * extractTasksDescription("任务 ⏫ [due:: 2024-01-15]")
 * // 返回: "任务 [due:: 2024-01-15]"
 * ```
 */
export function extractTasksDescription(content: string): string {
    let text = content;

    // 移除 Tasks emoji 优先级标记
    text = text.replace(RegularExpressions.DescriptionExtraction.removePriorityEmoji, ' ');

    // 移除 Tasks emoji 日期属性
    text = text.replace(RegularExpressions.DescriptionExtraction.removeTasksDate, ' ');

    // 折叠多余空格
    text = text.replace(RegularExpressions.DescriptionExtraction.collapseWhitespace, ' ').trim();

    return text;
}

/**
 * 提取任务描述（Dataview 格式专用）
 *
 * 仅移除 Dataview 格式的元数据标记，保留 Tasks 格式的内容。
 *
 * @param content - 原始任务内容
 * @returns 清理后的任务描述
 *
 * @example
 * ```ts
 * extractDataviewDescription("任务 [priority:: high] [due:: 2024-01-15]")
 * // 返回: "任务"
 *
 * extractDataviewDescription("任务 [priority:: high] ⏫")
 * // 返回: "任务 ⏫"
 * ```
 */
export function extractDataviewDescription(content: string): string {
    let text = content;

    // 移除 Dataview 字段
    text = text.replace(RegularExpressions.DescriptionExtraction.removeDataviewField, ' ');

    // 折叠多余空格
    text = text.replace(RegularExpressions.DescriptionExtraction.collapseWhitespace, ' ').trim();

    return text;
}

// ==================== 字符串处理 ====================

/**
 * 转义正则表达式中的特殊字符
 *
 * 将字符串中的正则表达式特殊字符进行转义，用于安全的正则匹配。
 *
 * @param string - 需要转义的字符串
 * @returns 转义后的字符串
 *
 * @example
 * ```ts
 * escapeRegExp("任务[1]")
 * // 返回: "任务\\[1\\]"
 *
 * // 用于构建正则
 * const filter = escapeRegExp(userInput);
 * const regex = new RegExp(`^${filter}`);
 * ```
 */
export function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 规范化空格
 *
 * 将多个连续空格替换为单个空格，并修剪首尾空格。
 *
 * @param text - 待处理的文本
 * @returns 规范化后的文本
 *
 * @example
 * ```ts
 * normalizeSpaces("  任务    内容  ")
 * // 返回: "任务 内容"
 * ```
 */
export function normalizeSpaces(text: string): string {
    return text.replace(/\s{2,}/g, ' ').trim();
}

/**
 * 安全截取文本
 *
 * 限制文本长度，超出部分用省略号表示。
 *
 * @param text - 待截取的文本
 * @param maxLength - 最大长度
 * @param suffix - 后缀（默认为 "..."）
 * @returns 截取后的文本
 *
 * @example
 * ```ts
 * truncateText("这是一段很长的任务描述", 10)
 * // 返回: "这是一段很长的..."
 * ```
 */
export function truncateText(text: string, maxLength: number, suffix = '...'): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - suffix.length) + suffix;
}

// ==================== 日期处理 ====================

/**
 * 判断日期字符串是否有效
 *
 * @param dateStr - 日期字符串（YYYY-MM-DD 格式）
 * @returns 是否为有效日期
 *
 * @example
 * ```ts
 * isValidDateString("2024-01-15")  // true
 * isValidDateString("2024-13-01")  // false
 * isValidDateString("invalid")     // false
 * ```
 */
export function isValidDateString(dateStr: string): boolean {
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
}

/**
 * 格式化日期为 YYYY-MM-DD 格式
 *
 * @param date - 日期对象
 * @returns 格式化后的日期字符串
 *
 * @example
 * ```ts
 * formatDate(new Date('2024-01-15'))
 * // 返回: "2024-01-15"
 * ```
 */
export function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 解析日期字符串
 *
 * 安全地解析 YYYY-MM-DD 格式的日期字符串。
 *
 * @param dateStr - 日期字符串
 * @returns 日期对象，解析失败则返回 null
 *
 * @example
 * ```ts
 * parseDate("2024-01-15")  // Date('2024-01-15T00:00:00.000Z')
 * parseDate("invalid")     // null
 * ```
 */
export function parseDate(dateStr: string): Date | null {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
}

// ==================== 验证函数 ====================

/**
 * 检查任务是否至少有一个日期属性
 *
 * @param dates - 日期字段对象
 * @returns 是否存在至少一个日期
 *
 * @example
 * ```ts
 * hasAnyDate({ dueDate: Date(...) })      // true
 * hasAnyDate({})                          // false
 * hasAnyDate({ priority: 'high' })        // false
 * ```
 */
export function hasAnyDate(dates: ParsedDates): boolean {
    return Object.values(dates).some(date => date instanceof Date && !isNaN(date.getTime()));
}

/**
 * 检查任务是否有优先级
 *
 * @param priority - 优先级值
 * @returns 是否有有效优先级
 *
 * @example
 * ```ts
 * hasValidPriority('high')    // true
 * hasValidPriority('medium')  // true
 * hasValidPriority(undefined) // false
 * hasValidPriority('')        // false
 * ```
 */
export function hasValidPriority(priority?: string): boolean {
    return !!priority && ['highest', 'high', 'medium', 'low', 'lowest'].includes(priority);
}

// ==================== 类型导入 ====================

/**
 * 解析后的日期类型
 */
type ParsedDates = Partial<Record<'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'cancelledDate' | 'completionDate', Date>>;

// ==================== 标签提取 ====================

/**
 * 标签提取正则
 * 匹配 #tag 格式的标签
 */
const TAG_REGEX = /#([a-zA-Z\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)/g;

/**
 * 提取任务标签
 *
 * 从任务描述中提取所有 #tag 格式的标签。
 * 标签规则：
 * - 以 # 开头
 * - 后续字符可以是字母、数字、下划线、中文
 * - 第一个字符不能是数字（可选限制）
 *
 * @param description - 任务描述
 * @returns 标签数组（不含 # 符号）
 *
 * @example
 * ```ts
 * extractTags("完成项目 #work #urgent")
 * // 返回: ['work', 'urgent']
 *
 * extractTags("普通任务描述")
 * // 返回: []
 *
 * extractTags("任务 #前端 #vue3 开发")
 * // 返回: ['前端', 'vue3']
 * ```
 */
export function extractTags(description: string): string[] {
    const tags: string[] = [];
    let match: RegExpExecArray | null;

    // 重置正则索引
    TAG_REGEX.lastIndex = 0;

    while ((match = TAG_REGEX.exec(description)) !== null) {
        tags.push(match[1]);
    }

    return tags;
}

/**
 * 从任务描述中移除标签
 *
 * 移除所有 #tag 格式的标签，返回清理后的文本。
 *
 * @param description - 任务描述
 * @returns 移除标签后的描述
 *
 * @example
 * ```ts
 * removeTags("完成项目 #work #urgent")
 * // 返回: "完成项目"
 * ```
 */
export function removeTags(description: string): string {
    return description.replace(TAG_REGEX, '').replace(/\s+/g, ' ').trim();
}
