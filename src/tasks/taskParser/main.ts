/**
 * 主解析函数
 *
 * 整合四步解析流程，提供完整的任务解析功能。
 * 这是对外暴露的主要入口点，被 TaskCacheManager 等上层模块调用。
 *
 * @fileoverview 任务解析主入口
 * @module tasks/taskParser/main
 */

import { TFile, ListItemCache } from 'obsidian';
import type { GCTask } from '../../types';
import type { TaskFormatType } from '../taskSerializerSymbols';

// 导入各步骤的解析函数
import { parseTaskLine } from './step1';
import { passesGlobalFilter, removeGlobalFilter } from './step2';
import { detectFormat } from './step3';
import { parseCheckboxStatus, parseTaskAttributes } from './step4';
import { extractTaskDescription, extractTags, extractTicktick, findMetadataValue } from './utils';

// ==================== 主解析函数 ====================

/**
 * 从列表项缓存中解析任务
 *
 * 实现完整的四步解析流程：
 * 1. 识别任务行 - 使用 taskRegex 匹配
 * 2. 筛选任务行 - 根据 globalTaskFilter 过滤
 * 3. 判断格式 - 检测 Tasks 或 Dataview 格式
 * 4. 解析属性 - 提取优先级、日期等属性
 *
 * @param file - Obsidian 文件对象
 * @param lines - 文件的所有文本行
 * @param listItems - Obsidian 解析的列表项缓存
 * @param enabledFormats - 启用的任务格式列表
 * @param globalTaskFilter - 全局任务过滤器前缀（可选）
 * @returns 解析出的任务数组，按行号排序
 *
 * @example
 * ```ts
 * const tasks = parseTasksFromListItems(
 *   file,
 *   fileContent.split('\n'),
 *   metadataCache.getFileCache(file)?.listItems || [],
 *   ['tasks', 'dataview'],
 *   '🎯 '
 * );
 * ```
 */
export function parseTasksFromListItems(
    file: TFile,
    lines: string[],
    listItems: ListItemCache[],
    enabledFormats: TaskFormatType[],
    globalTaskFilter?: string
): GCTask[] {
    const tasks: GCTask[] = [];

    for (const item of listItems) {
        const lineNumber = item.position.start.line;
        const line = lines[lineNumber];
        if (!line) continue;

        // ==================== 第一步：识别任务行 ====================
        const taskMatch = parseTaskLine(line);
        if (!taskMatch) continue;

        const { checkboxStatus, content: rawContent } = taskMatch;

        // ==================== 第二步：筛选任务行 ====================
        if (!passesGlobalFilter(rawContent, globalTaskFilter)) {
            continue;
        }

        const contentWithoutFilter = removeGlobalFilter(rawContent, globalTaskFilter);

        // 解析复选框状态（包括 status）
        const { completed, cancelled, status } = parseCheckboxStatus(checkboxStatus);

        // ==================== 第三步：判断格式 ====================
        const detectedFormat = detectFormat(contentWithoutFilter, enabledFormats);
        // 混合格式默认使用 tasks 格式进行解析
        const format = detectedFormat === 'mixed' ? 'tasks' : detectedFormat;

        // 统一提取所有 %%[key::value]%% 内联元数据（包括 guid、desc 等）
        const { metadataFields, contentWithoutTicktick } = extractTicktick(contentWithoutFilter);

        // ==================== 第四步：解析属性 ====================
        const task: GCTask = {
            filePath: file.path,
            fileName: file.basename,
            lineNumber: lineNumber + 1, // 转换为 1-based 行号
            content: contentWithoutFilter,
            description: extractTaskDescription(contentWithoutTicktick),
            completed,
            cancelled,
            status,
            priority: 'normal', // 默认优先级
            metadataFields: metadataFields.length > 0 ? metadataFields : undefined,
            // 从统一的 metadataFields 数组中派生 feishuGuid（供飞书同步使用）
            feishuGuid: findMetadataValue(metadataFields, 'guid'),
        };

        // 解析标签
        const tags = extractTags(contentWithoutFilter);
        if (tags.length > 0) {
            task.tags = tags;
        }

        // 如果检测到有效格式，解析任务属性
        if (format && enabledFormats.includes(format)) {
            const { priority, dates, datePrecisions, hasCancelledDate, repeat } = parseTaskAttributes(
                contentWithoutFilter,
                format
            );

            task.format = format;
            task.priority = priority || 'normal'; // 确保有默认优先级
            task.createdDate = dates.createdDate;
            task.startDate = dates.startDate;
            task.scheduledDate = dates.scheduledDate;
            task.dueDate = dates.dueDate;
            task.cancelledDate = dates.cancelledDate;
            task.completionDate = dates.completionDate;
            task.repeat = repeat;
            task.datePrecision = datePrecisions;

            // 如果存在取消日期且任务未完成，确保取消状态被设置
            if (hasCancelledDate && !task.completed) {
                task.cancelled = true;
            }
        }

        // ==================== 警告检查 ====================
        // 混合格式警告
        if (detectedFormat === 'mixed') {
            task.warning = '混用任务格式，请修改';
        }
        // 未规划时间警告
        else if (
            !task.priority &&
            !task.createdDate &&
            !task.startDate &&
            !task.scheduledDate &&
            !task.dueDate &&
            !task.cancelledDate &&
            !task.completionDate
        ) {
            task.warning = '未规划任务时间，请设置';
        }

        tasks.push(task);
    }

    // 按行号排序返回
    const sortedTasks = tasks.sort((a, b) => a.lineNumber - b.lineNumber);

    return sortedTasks;
}

/**
 * 从文件内容中解析所有任务
 *
 * 便捷函数，自动处理文件读取和行分割。
 *
 * @param file - Obsidian 文件对象
 * @param fileContent - 文件的完整文本内容
 * @param listItems - Obsidian 解析的列表项缓存
 * @param enabledFormats - 启用的任务格式列表
 * @param globalTaskFilter - 全局任务过滤器前缀（可选）
 * @returns 解析出的任务数组
 *
 * @example
 * ```ts
 * const fileContent = await app.vault.read(file);
 * const listItems = metadataCache.getFileCache(file)?.listItems || [];
 * const tasks = parseTasksFromFile(file, fileContent, listItems, ['tasks', 'dataview'], '🎯 ');
 * ```
 */
export function parseTasksFromFile(
    file: TFile,
    fileContent: string,
    listItems: ListItemCache[],
    enabledFormats: TaskFormatType[],
    globalTaskFilter?: string
): GCTask[] {
    const lines = fileContent.split('\n');
    return parseTasksFromListItems(file, lines, listItems, enabledFormats, globalTaskFilter);
}

/**
 * 从文本行数组中解析任务
 *
 * 适用于需要自定义行来源的场景（如增量更新）。
 *
 * @param filePath - 文件路径
 * @param fileName - 文件名
 * @param lines - 文本行数组
 * @param listItems - Obsidian 解析的列表项缓存
 * @param enabledFormats - 启用的任务格式列表
 * @param globalTaskFilter - 全局任务过滤器前缀（可选）
 * @returns 解析出的任务数组
 *
 * @example
 * ```ts
 * // 增量更新场景：只解析变更的行
 * const changedLines = getChangedLines();
 * const tasks = parseTasksFromLines(
 *   'path/to/file.md',
 *   'file',
 *   changedLines,
 *   listItems,
 *   ['tasks', 'dataview'],
 *   '🎯 '
 * );
 * ```
 */
export function parseTasksFromLines(
    filePath: string,
    fileName: string,
    lines: string[],
    listItems: ListItemCache[],
    enabledFormats: TaskFormatType[],
    globalTaskFilter?: string
): GCTask[] {
    // 创建一个模拟的 TFile 对象（用于解析，不是真实的文件操作）
     
    const mockFile = {
        path: filePath,
        basename: fileName,
    // eslint-disable-next-line obsidianmd/no-tfile-tfolder-cast -- 构造 mock TFile 用于离线解析(非类型收窄)
    } as TFile;

    return parseTasksFromListItems(mockFile, lines, listItems, enabledFormats, globalTaskFilter);
}

/**
 * 解析单个任务行
 *
 * 用于快速解析单行任务，适用于命令面板等交互场景。
 *
 * @param line - 任务行文本
 * @param filePath - 文件路径（可选）
 * @param fileName - 文件名（可选）
 * @param lineNumber - 行号（可选）
 * @param enabledFormats - 启用的任务格式列表
 * @param globalTaskFilter - 全局任务过滤器前缀（可选）
 * @returns 解析出的任务对象，如果行不是任务则返回 null
 *
 * @example
 * ```ts
 * const task = parseSingleTaskLine(
 *   "- [ ] 🎯 完成项目 ⏫ 📅 2024-01-15",
 *   'path/to/file.md',
 *   'file',
 *   10,
 *   ['tasks', 'dataview'],
 *   '🎯 '
 * );
 * ```
 */
export function parseSingleTaskLine(
    line: string,
    filePath?: string,
    fileName?: string,
    lineNumber?: number,
    enabledFormats: TaskFormatType[] = ['tasks', 'dataview'],
    globalTaskFilter?: string
): GCTask | null {
    const taskMatch = parseTaskLine(line);
    if (!taskMatch) return null;

    const { checkboxStatus, content: rawContent } = taskMatch;

    if (!passesGlobalFilter(rawContent, globalTaskFilter)) {
        return null;
    }

    const contentWithoutFilter = removeGlobalFilter(rawContent, globalTaskFilter);
    const { completed, cancelled, status } = parseCheckboxStatus(checkboxStatus);

    const detectedFormat = detectFormat(contentWithoutFilter, enabledFormats);
    const format = detectedFormat === 'mixed' ? 'tasks' : detectedFormat;

    // 统一提取所有 %%[key::value]%% 内联元数据
    const { metadataFields, contentWithoutTicktick } = extractTicktick(contentWithoutFilter);

    const task: GCTask = {
        filePath: filePath || '',
        fileName: fileName || '',
        lineNumber: lineNumber || 0,
        content: contentWithoutFilter,
        description: extractTaskDescription(contentWithoutTicktick),
        completed,
        cancelled,
        status,
        priority: 'normal', // 默认优先级
        metadataFields: metadataFields.length > 0 ? metadataFields : undefined,
        feishuGuid: findMetadataValue(metadataFields, 'guid'),
    };

    // 解析标签
    const tags = extractTags(contentWithoutFilter);
    if (tags.length > 0) {
        task.tags = tags;
    }

    if (format && enabledFormats.includes(format)) {
        const { priority, dates, datePrecisions, hasCancelledDate, repeat } = parseTaskAttributes(
            contentWithoutFilter,
            format
        );

        task.format = format;
        task.priority = priority || 'normal'; // 确保有默认优先级
        Object.assign(task, dates);
        task.repeat = repeat;
        task.datePrecision = datePrecisions;

        if (hasCancelledDate && !task.completed) {
            task.cancelled = true;
        }
    }

    if (detectedFormat === 'mixed') {
        task.warning = '混用任务格式，请修改';
    }

    return task;
}
