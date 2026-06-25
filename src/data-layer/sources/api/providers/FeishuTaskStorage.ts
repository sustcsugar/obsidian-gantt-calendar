/**
 * 飞书任务存储管理器
 *
 * 负责将飞书任务存储到 Obsidian vault 的 Markdown 文件中
 * 按任务清单分类，使用表格格式展示
 */

import { App, TFile } from 'obsidian';
import type { FeishuTask } from './feishu/FeishuTypes';
import { Logger } from '../../../../utils/logger';

/** 任务存储配置 */
export interface TaskStorageConfig {
    /** 存储文件名（不含扩展名） */
    fileName?: string;
    /** 是否覆盖现有文件 */
    overwrite?: boolean;
}

/** 任务存储结果 */
export interface TaskStorageResult {
    /** 存储的文件 */
    file?: TFile;
    /** 存储的任务数量 */
    taskCount: number;
    /** 是否是新创建的文件 */
    isNew: boolean;
}

/**
 * 飞书任务存储管理器
 */
export class FeishuTaskStorage {
    /**
     * 将飞书任务转换为Markdown格式
     * 按任务清单分类，使用表格展示
     * @param tasks 任务列表
     * @returns Markdown内容
     */
    static tasksToMarkdown(tasks: FeishuTask[]): string {
        const lines: string[] = [];

        // 按任务清单分组
        const tasksByList = this.groupTasksByList(tasks);

        // 文件头部
        lines.push('---');
        lines.push('feishu_tasks: true');
        lines.push(`task_count: ${tasks.length}`);
        lines.push(`list_count: ${tasksByList.size}`);
        lines.push(`synced_at: ${new Date().toISOString()}`);
        lines.push('---');
        lines.push('');
        lines.push('# 飞书任务列表');
        lines.push('');
        lines.push(`> 共 ${tasks.length} 个任务，${tasksByList.size} 个清单，同步时间: ${new Date().toLocaleString('zh-CN')}`);
        lines.push('');

        // 为每个任务清单生成表格
        tasksByList.forEach((listTasks, listName) => {
            lines.push(`## ${listName}`);
            lines.push('');
            lines.push(this.createTaskTable(listTasks));
            lines.push('');
        });

        return lines.join('\n');
    }

    /**
     * 按任务清单分组任务
     * @param tasks 任务列表
     * @returns 任务清单Map
     */
    private static groupTasksByList(tasks: FeishuTask[]): Map<string, FeishuTask[]> {
        const grouped = new Map<string, FeishuTask[]>();

        tasks.forEach(task => {
            const listName = task.tasklist_name || '未分类';
            if (!grouped.has(listName)) {
                grouped.set(listName, []);
            }
            grouped.get(listName)!.push(task);
        });

        return grouped;
    }

    /**
     * 创建任务表格
     * @param tasks 任务列表
     * @returns Markdown表格字符串
     */
    private static createTaskTable(tasks: FeishuTask[]): string {
        // 排序：未完成在前，已完成在后
        const sortedTasks = [...tasks].sort((a, b) => {
            if (a.completed !== b.completed) {
                return a.completed ? 1 : -1;
            }
            // 按截止时间排序（timestamp 是字符串，需要转为数字）
            const aDue = a.due_time?.timestamp ? parseInt(a.due_time.timestamp, 10) : 0;
            const bDue = b.due_time?.timestamp ? parseInt(b.due_time.timestamp, 10) : 0;
            return aDue - bDue;
        });

        const lines: string[] = [];

        // 表头
        lines.push('| 任务 | 状态 | 优先级 | 开始时间 | 截止时间 | 负责人 | 任务ID | 创建时间 | 更新时间 | 完成时间 |');
        lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');

        // 表格行
        sortedTasks.forEach(task => {
            const status = task.completed ? '✅ 已完成' : '⏳ 进行中';
            const priority = this.formatPriority(task.priority);

            // 格式化开始时间（考虑 is_all_day 属性）
            const startTime = task.start_time?.timestamp
                ? this.formatTaskTime(task.start_time.timestamp, task.start_time.is_all_day)
                : '-';

            // 格式化截止时间（考虑 is_all_day 属性）
            const dueTime = task.due_time?.timestamp
                ? this.formatTaskTime(task.due_time.timestamp, task.due_time.is_all_day)
                : '-';

            const assignee = task.assignee?.name || '-';

            // 任务标题，添加完成标记
            const title = task.completed ? `~~${task.summary}~~` : task.summary;

            // 格式化时间戳（时间戳是字符串形式的毫秒数）
            const formatTimestamp = (ts?: string) => {
                if (!ts || ts === '0') return '-';
                const num = parseInt(ts, 10);
                if (isNaN(num) || num === 0) return '-';
                return new Date(num).toLocaleString('zh-CN');
            };

            const createdAt = formatTimestamp(task.created_at);
            const updatedAt = formatTimestamp(task.updated_at);
            const completedAt = formatTimestamp(task.completed_at);

            lines.push(`| ${title} | ${status} | ${priority} | ${startTime} | ${dueTime} | ${assignee} | ${task.task_guid} | ${createdAt} | ${updatedAt} | ${completedAt} |`);
        });

        return lines.join('\n');
    }

    /**
     * 格式化优先级
     * @param priority 优先级
     * @returns 格式化后的优先级字符串
     */
    private static formatPriority(priority?: string): string {
        const priorityMap: Record<string, string> = {
            'high': '🔴 高',
            'medium': '🟡 中',
            'low': '🟢 低',
            'urgent': '🔴 紧急',
        };
        return priorityMap[priority || ''] || priority || '-';
    }

    /**
     * 格式化任务时间
     * @param timestamp 时间戳（字符串格式的毫秒数）
     * @param isAllDay 是否全天任务
     * @returns 格式化后的时间字符串
     */
    private static formatTaskTime(timestamp: string, isAllDay?: boolean): string {
        const num = parseInt(timestamp, 10);
        if (isNaN(num) || num === 0) return '-';

        const date = new Date(num);
        if (isAllDay) {
            // 全天任务只显示日期
            return date.toLocaleDateString('zh-CN');
        } else {
            // 非全天任务显示日期和时间
            return date.toLocaleString('zh-CN');
        }
    }

    /**
     * 存储任务到Markdown文件
     * @param app Obsidian App实例
     * @param tasks 任务列表
     * @param config 存储配置
     * @returns 存储结果
     */
    static async saveTasks(
        app: App,
        tasks: FeishuTask[],
        config: TaskStorageConfig = {}
    ): Promise<TaskStorageResult> {
        const fileName = config.fileName || '飞书任务';
        const filePath = `/${fileName}.md`;
        const overwrite = config.overwrite ?? true;

        Logger.info('FeishuTaskStorage', `Saving ${tasks.length} tasks to ${filePath}`);

        // 检查文件是否已存在
        const abstractFile = app.vault.getAbstractFileByPath(filePath);
        let existingFile = abstractFile instanceof TFile ? abstractFile : null;
        const isNew = !existingFile;

        // 生成Markdown内容
        const content = this.tasksToMarkdown(tasks);

        if (existingFile && overwrite) {
            // 覆盖现有文件
            await app.vault.modify(existingFile, content);
            Logger.info('FeishuTaskStorage', `Updated existing file: ${filePath}`);
        } else if (!existingFile) {
            // 创建新文件
            existingFile = await app.vault.create(filePath, content);
            Logger.info('FeishuTaskStorage', `Created new file: ${filePath}`);
        }

        return {
            file: existingFile || undefined,
            taskCount: tasks.length,
            isNew,
        };
    }

    /**
     * 追加任务到现有文件
     * @param app Obsidian App实例
     * @param tasks 任务列表
     * @param fileName 文件名
     * @returns 存储结果
     */
    static async appendTasks(
        app: App,
        tasks: FeishuTask[],
        fileName: string = '飞书任务'
    ): Promise<TaskStorageResult> {
        const filePath = `/${fileName}.md`;

        Logger.info('FeishuTaskStorage', `Appending ${tasks.length} tasks to ${filePath}`);

        const abstractFile = app.vault.getAbstractFileByPath(filePath);
        const existingFile = abstractFile instanceof TFile ? abstractFile : null;

        if (!existingFile) {
            // 文件不存在，创建新文件
            return this.saveTasks(app, tasks, { fileName });
        }

        // 读取现有内容并追加
        const existingContent = await app.vault.read(existingFile);
        const newContent = existingContent + '\n\n' + this.tasksToMarkdown(tasks);
        await app.vault.modify(existingFile, newContent);

        Logger.info('FeishuTaskStorage', `Appended ${tasks.length} tasks to ${filePath}`);

        return {
            file: existingFile,
            taskCount: tasks.length,
            isNew: false,
        };
    }
}
