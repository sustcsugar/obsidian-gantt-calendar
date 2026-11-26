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

/**
 * 任务解析所需的文件元信息（结构子类型）。
 *
 * 使用该接口而非直接用 `TFile`，既能接收真实 `TFile`（结构兼容），
 * 也能在离线/测试场景下传入纯字面量对象，从而避免 `as unknown as TFile`
 * 类型断言（obsidianmd/no-tfile-tfolder-cast 规则禁止此类断言）。
 */
export interface TaskFileRef {
    path: string;
    basename: string;
}

// 导入各步骤的解析函数
import { parseTaskLine, type TaskLineMatch } from './step1';
import { passesGlobalFilter, removeGlobalFilter } from './step2';
import { detectFormat } from './step3';
import { parseCheckboxStatus, parseTaskAttributes } from './step4';
import { extractTaskDescription, extractTags, extractTicktick, findMetadataValue } from './utils';
import { RegularExpressions } from '../../utils/RegularExpressions';

// ==================== 缩进与词法辅助 ====================

/**
 * 将任务行前缀缩进字符串归一化为宽度（1 Tab = 4 spaces，其余字符计 1）
 */
export function calculateIndentWidth(indent: string): number {
    let width = 0;
    for (let i = 0; i < indent.length; i++) {
        width += indent[i] === '\t' ? 4 : 1;
    }
    return width;
}

/**
 * 计算文本行首空白（空格与制表符）的归一化宽度（1 Tab = 4 spaces）
 */
function calculateLeadingIndentWidth(line: string): number {
    let width = 0;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === ' ') {
            width += 1;
        } else if (ch === '\t') {
            width += 4;
        } else {
            break;
        }
    }
    return width;
}

/**
 * 构建单个 GCTask 对象（步骤三/四共用逻辑）
 */
function buildGCTask(
    file: TaskFileRef,
    lineNumber: number,
    checkboxStatus: string,
    contentForParse: string,
    enabledFormats: TaskFormatType[]
): GCTask {
    // 解析复选框状态（包括 status）
    const { completed, cancelled, status } = parseCheckboxStatus(checkboxStatus);

    // ==================== 第三步：判断格式 ====================
    const detectedFormat = detectFormat(contentForParse, enabledFormats);
    // 混合格式默认使用 tasks 格式进行解析
    const format = detectedFormat === 'mixed' ? 'tasks' : detectedFormat;

    // 统一提取所有 %%[key::value]%% 内联元数据（包括 guid、desc 等）
    const { metadataFields, contentWithoutTicktick } = extractTicktick(contentForParse);

    // ==================== 第四步：解析属性 ====================
    const task: GCTask = {
        filePath: file.path,
        fileName: file.basename,
        lineNumber,
        content: contentForParse,
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
    const tags = extractTags(contentForParse);
    if (tags.length > 0) {
        task.tags = tags;
    }

    // 如果检测到有效格式，解析任务属性
    if (format && enabledFormats.includes(format)) {
        const { priority, dates, datePrecisions, hasCancelledDate, repeat } = parseTaskAttributes(
            contentForParse,
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

    return task;
}

interface ParsedTaskCandidate {
    lineNumber: number; // 1-based
    taskMatch: TaskLineMatch;
    indentWidth: number;
    parentLineNumber?: number;
    childLineNumbers: number[];
    directMatch: boolean;
}

// ==================== 主解析函数 ====================

/**
 * 统一的两阶段缩进任务解析器（冷启动与实时编辑共享入口）
 *
 * 阶段一（词法清洗 + 单调缩进栈建树）：
 * - 跳过文件首行 --- 开启的 YAML Frontmatter
 * - 跳过 ``` / ~~~ 围栏代码块（支持 3 个及以上字符及闭合匹配）
 * - 遇到标题、分割线或零缩进非空非任务段落时清空缩进栈
 * - 遇到空行或带缩进的非任务备注行时保持缩进栈不变
 * - 为所有合法任务行建立 1-based parentLineNumber / childLineNumbers 关系
 *
 * 阶段二（globalFilter 过滤与自底向上虚拟父节点保留）：
 * - globalFilter 非空时：保留所有通过过滤的任务及其祖先链；未通过过滤但有合规后代的父节点
 *   标记为 isVirtualContainer = true（保留原文不剥离 globalFilter），孤立未通过任务丢弃
 * - globalFilter 为空时：全部合法任务保留且 isVirtualContainer = false
 * - 剪枝后同步清理父节点 childLineNumbers 中已被丢弃的行号
 */
export function parseTasksFromContent(
    file: TaskFileRef,
    fileContent: string,
    enabledFormats: TaskFormatType[],
    globalTaskFilter?: string
): GCTask[] {
    if (!fileContent) return [];

    const rawLines = fileContent.split('\n');
    const lines = rawLines.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
    if (lines.length > 0 && lines[0].charCodeAt(0) === 0xFEFF) {
        lines[0] = lines[0].slice(1);
    }

    // 1. 跳过文件首行 --- 开启且存在闭合标记的 YAML Frontmatter
    let startIndex = 0;
    if (lines.length > 0 && RegularExpressions.MarkdownLexical.frontmatterOpenRegex.test(lines[0])) {
        for (let i = 1; i < lines.length; i++) {
            if (RegularExpressions.MarkdownLexical.frontmatterCloseRegex.test(lines[i])) {
                startIndex = i + 1;
                break;
            }
        }
    }

    const hasGlobalFilter = Boolean(globalTaskFilter && globalTaskFilter.trim().length > 0);
    const candidates: ParsedTaskCandidate[] = [];
    const byLine = new Map<number, ParsedTaskCandidate>();
    const stack: Array<{ lineNumber: number; indent: number }> = [];

    let inCodeBlock = false;
    let fenceChar = '';
    let fenceLength = 0;

    // 2. 阶段一：逐行扫描与单调缩进栈维护
    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];

        if (inCodeBlock) {
            const closeMatch = line.match(RegularExpressions.MarkdownLexical.fenceCloseRegex);
            if (closeMatch && closeMatch[1][0] === fenceChar && closeMatch[1].length >= fenceLength) {
                inCodeBlock = false;
                fenceChar = '';
                fenceLength = 0;
            }
            continue;
        }

        const openMatch = line.match(RegularExpressions.MarkdownLexical.fenceOpenRegex);
        if (openMatch) {
            const marker = openMatch[1];
            const info = openMatch[2] || '';
            // CommonMark 规范：反引号围栏的 info string 不能包含反引号（排除单行内联代码）
            if (marker[0] !== '`' || !info.includes('`')) {
                inCodeBlock = true;
                fenceChar = marker[0];
                fenceLength = marker.length;
                continue;
            }
        }

        const taskMatch = parseTaskLine(line);
        if (!taskMatch) {
            // 空行保持栈不变
            if (line.trim().length === 0) {
                continue;
            }
            // 标题、水平分割线或零缩进非空非任务段落：清空缩进栈
            if (
                RegularExpressions.MarkdownLexical.headingRegex.test(line) ||
                RegularExpressions.MarkdownLexical.horizontalRuleRegex.test(line) ||
                calculateLeadingIndentWidth(line) === 0
            ) {
                stack.length = 0;
            }
            // 带缩进的非任务备注行保持栈不变
            continue;
        }

        const lineNumber = i + 1; // 1-based 行号
        const indentWidth = calculateIndentWidth(taskMatch.indent);

        while (stack.length > 0 && stack[stack.length - 1].indent >= indentWidth) {
            stack.pop();
        }

        const parentLineNumber = stack.length > 0 ? stack[stack.length - 1].lineNumber : undefined;
        const directMatch = !hasGlobalFilter || passesGlobalFilter(taskMatch.content, globalTaskFilter);

        const candidate: ParsedTaskCandidate = {
            lineNumber,
            taskMatch,
            indentWidth,
            parentLineNumber,
            childLineNumbers: [],
            directMatch,
        };

        candidates.push(candidate);
        byLine.set(lineNumber, candidate);

        if (parentLineNumber !== undefined) {
            byLine.get(parentLineNumber)?.childLineNumbers.push(lineNumber);
        }

        stack.push({ lineNumber, indent: indentWidth });
    }

    if (candidates.length === 0) {
        return [];
    }

    // 3. 阶段二：globalFilter 过滤与自底向上虚拟父节点保留
    const keptLines = new Set<number>();
    const virtualLines = new Set<number>();

    if (!hasGlobalFilter) {
        for (const c of candidates) {
            keptLines.add(c.lineNumber);
        }
    } else {
        for (const c of candidates) {
            if (!c.directMatch) continue;
            keptLines.add(c.lineNumber);

            let parentLine = c.parentLineNumber;
            while (parentLine !== undefined) {
                if (keptLines.has(parentLine)) break;
                keptLines.add(parentLine);
                const parentCandidate = byLine.get(parentLine);
                if (!parentCandidate) break;
                if (!parentCandidate.directMatch) {
                    virtualLines.add(parentLine);
                }
                parentLine = parentCandidate.parentLineNumber;
            }
        }
    }

    // 4. 构造最终 GCTask 列表（candidates 已按 1-based 行号升序）
    const tasks: GCTask[] = [];
    for (const c of candidates) {
        if (!keptLines.has(c.lineNumber)) continue;

        const isVirtualContainer = virtualLines.has(c.lineNumber);
        const contentForParse = isVirtualContainer
            ? c.taskMatch.content
            : removeGlobalFilter(c.taskMatch.content, globalTaskFilter);

        const task = buildGCTask(
            file,
            c.lineNumber,
            c.taskMatch.checkboxStatus,
            contentForParse,
            enabledFormats
        );

        task.indentWidth = c.indentWidth;
        task.parentLineNumber = c.parentLineNumber;
        task.childLineNumbers = c.childLineNumbers.filter((childLine) => keptLines.has(childLine));
        task.isVirtualContainer = isVirtualContainer;

        tasks.push(task);
    }

    return tasks;
}

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
    file: TaskFileRef,
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
        const task = buildGCTask(file, lineNumber + 1, checkboxStatus, contentWithoutFilter, enabledFormats);
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
    // 离线解析场景：仅需 path/basename 元信息，无需真实 TFile。
    // 通过 TaskFileRef 结构类型直接传字面量，避免 `as unknown as TFile` 断言
    // （obsidianmd/no-tfile-tfolder-cast 规则禁止对 TFile/TFolder 做类型断言）。
    const fileRef: TaskFileRef = {
        path: filePath,
        basename: fileName,
    };

    return parseTasksFromListItems(fileRef, lines, listItems, enabledFormats, globalTaskFilter);
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
