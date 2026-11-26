/**
 * taskParser 模块统一导出入口
 *
 * 整合 taskParser 目录下的所有导出，提供统一的模块访问接口。
 *
 * @fileoverview taskParser 模块入口
 * @module tasks/taskParser
 */

// ==================== 第一步：识别任务行 ====================
export * from './step1';

// ==================== 第二步：筛选任务行 ====================
export * from './step2';

// ==================== 第三步：判断格式 ====================
export * from './step3';

// ==================== 第四步：解析属性 ====================
export * from './step4';

// ==================== 工具函数 ====================
export * from './utils';

// ==================== 主解析函数 ====================
export {
    calculateIndentWidth,
    parseTasksFromContent,
    parseTasksFromListItems,
    parseTasksFromFile,
    parseTasksFromLines,
    parseSingleTaskLine,
} from './main';

// ==================== 便捷导出 ====================
// 为了方便使用，从各步骤重新导出常用函数

export {
    // step1
    isTaskLine,
    parseTaskLine,
    extractTaskLines,
    type TaskLineMatch,
} from './step1';

export {
    // step2
    passesGlobalFilter,
    removeGlobalFilter,
    applyFilter,
    filterTasks,
    type FilterResult,
} from './step2';

export {
    // step3
    detectFormat,
    detectFormatDetailed,
    hasTasksFormat,
    hasDataviewFormat,
    isMixedFormat,
    type FormatDetectionResult,
} from './step3';

export {
    // step4
    parseCheckboxStatus,
    isIncomplete,
    isCompleted,
    isCancelled,
    parseTasksPriority,
    parseTasksDates,
    parseTasksAttributes,
    parseDataviewPriority,
    parseDataviewDates,
    parseDataviewAttributes,
    parseTaskAttributes,
    parseDateField,
    type CheckboxStatus,
    type ParsedDates,
    type ParsedTaskAttributes,
} from './step4';

export {
    // utils
    extractTaskDescription,
    extractTasksDescription,
    extractDataviewDescription,
    escapeRegExp,
    normalizeSpaces,
    truncateText,
    isValidDateString,
    formatDate,
    parseDate,
    hasAnyDate,
    hasValidPriority,
} from './utils';
