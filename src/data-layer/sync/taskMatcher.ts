/**
 * 任务匹配器
 *
 * 负责将来自不同数据源的任务进行匹配和分组。
 * 匹配规则：
 * 1. 优先按 syncId 精确匹配
 * 2. 模糊匹配：描述 + 日期相似度
 */

import { v4 as uuidv4 } from 'uuid';
import type { GCTask } from '../../types';
import type { GCTaskWithSync, TaskMatchGroup, DataSourceType } from './syncTypes';
import { toISOStringLocal } from '../../dateUtils/timezone';

/**
 * 生成模糊匹配键
 * 基于任务描述和日期生成唯一键
 */
function generateFuzzyKey(task: GCTask): string {
    // 标准化描述：转小写、去除空格和特殊字符
    const normalizedDesc = task.description
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[^\w\u4e00-\u9fa5]/g, '');

    // 获取主要日期（优先 dueDate，其次 startDate）
    const primaryDate = task.dueDate || task.startDate;
    const dateStr = primaryDate ? toISOStringLocal(primaryDate) : '';

    return `${normalizedDesc}:${dateStr}`;
}

/**
 * 任务匹配器
 */
export class TaskMatcher {
    // 模糊匹配的相似度阈值（0-1）
    private readonly SIMILARITY_THRESHOLD = 0.8;

    /**
     * 将任务按 syncId 或模糊匹配进行分组
     */
    matchTasks(tasks: GCTaskWithSync[]): TaskMatchGroup[] {
        const syncIdMap = new Map<string, GCTaskWithSync[]>();
        const fuzzyMap = new Map<string, GCTaskWithSync[]>();
        const grouped = new Set<string>();

        // 首先按 syncId 分组
        for (const task of tasks) {
            if (task.syncId) {
                if (!syncIdMap.has(task.syncId)) {
                    syncIdMap.set(task.syncId, []);
                }
                syncIdMap.get(task.syncId)!.push(task);
                grouped.add(task.syncId);
            }
        }

        // 剩余没有 syncId 的任务进行模糊匹配
        const tasksWithoutSyncId = tasks.filter(t => !t.syncId);

        for (const task of tasksWithoutSyncId) {
            const fuzzyKey = generateFuzzyKey(task);
            let matched = false;

            // 尝试与现有 syncId 组匹配
            for (const [syncId, groupTasks] of syncIdMap) {
                if (this.isFuzzyMatch(task, groupTasks[0])) {
                    // 为该任务分配 syncId
                    task.syncId = syncId;
                    groupTasks.push(task);
                    matched = true;
                    grouped.add(syncId);
                    break;
                }
            }

            // 如果没有匹配到现有组，尝试与其他无 syncId 任务匹配
            if (!matched) {
                for (const [key, groupTasks] of fuzzyMap) {
                    if (this.isFuzzyMatch(task, groupTasks[0])) {
                        // 生成新的 syncId
                        const newSyncId = uuidv4();
                        task.syncId = newSyncId;
                        groupTasks.forEach(t => t.syncId = newSyncId);

                        // 移动到 syncIdMap
                        syncIdMap.set(newSyncId, [...groupTasks, task]);
                        fuzzyMap.delete(key);
                        matched = true;
                        break;
                    }
                }
            }

            // 如果仍没有匹配，创建新组
            if (!matched) {
                const newSyncId = uuidv4();
                task.syncId = newSyncId;
                fuzzyMap.set(fuzzyKey, [task]);
                syncIdMap.set(newSyncId, [task]);
            }
        }

        // 转换为 TaskMatchGroup 数组
        return Array.from(syncIdMap.values()).map(tasks => ({
            syncId: tasks[0].syncId,
            tasks,
            hasLocal: tasks.some(t => t.source === 'markdown'),
            hasRemote: tasks.some(t => t.source !== 'markdown'),
            sources: [...new Set(tasks.map(t => t.source || 'markdown'))],
        }));
    }

    /**
     * 判断两个任务是否模糊匹配
     */
    private isFuzzyMatch(task1: GCTask, task2: GCTask): boolean {
        // 描述相似度
        const descSimilarity = this.calculateStringSimilarity(
            task1.description,
            task2.description
        );

        if (descSimilarity < this.SIMILARITY_THRESHOLD) {
            return false;
        }

        // 日期匹配检查
        if (!this.isDateMatch(task1, task2)) {
            return false;
        }

        return true;
    }

    /**
     * 计算两个字符串的相似度（使用编辑距离）
     */
    private calculateStringSimilarity(str1: string, str2: string): number {
        const s1 = str1.toLowerCase().trim();
        const s2 = str2.toLowerCase().trim();

        if (s1 === s2) return 1;

        const len1 = s1.length;
        const len2 = s2.length;
        const maxLen = Math.max(len1, len2);

        if (maxLen === 0) return 1;

        // 计算编辑距离
        const dp = Array.from({ length: len1 + 1 }, () =>
            Array.from<number>({ length: len2 + 1 }).fill(0)
        );

        for (let i = 0; i <= len1; i++) {
            dp[i][0] = i;
        }
        for (let j = 0; j <= len2; j++) {
            dp[0][j] = j;
        }

        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                if (s1[i - 1] === s2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = Math.min(
                        dp[i - 1][j] + 1,
                        dp[i][j - 1] + 1,
                        dp[i - 1][j - 1] + 1
                    );
                }
            }
        }

        const editDistance = dp[len1][len2];
        return 1 - editDistance / maxLen;
    }

    /**
     * 判断两个任务的日期是否匹配
     */
    private isDateMatch(task1: GCTask, task2: GCTask): boolean {
        // 检查 dueDate
        const date1 = task1.dueDate || task1.startDate;
        const date2 = task2.dueDate || task2.startDate;

        // 如果两个都没有日期，认为匹配
        if (!date1 && !date2) return true;

        // 如果只有一个有日期，不匹配
        if (!date1 || !date2) return false;

        // 比较日期（忽略时间）
        const d1 = new Date(date1);
        const d2 = new Date(date2);

        return (
            d1.getFullYear() === d2.getFullYear() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getDate() === d2.getDate()
        );
    }

    /**
     * 为新任务生成 syncId
     */
    generateSyncId(): string {
        return uuidv4();
    }

    /**
     * 按数据源分组任务
     */
    groupBySource(tasks: GCTaskWithSync[]): Map<DataSourceType, GCTaskWithSync[]> {
        const grouped = new Map<DataSourceType, GCTaskWithSync[]>();

        for (const task of tasks) {
            const source = task.source || 'markdown';
            if (!grouped.has(source)) {
                grouped.set(source, []);
            }
            grouped.get(source)!.push(task);
        }

        return grouped;
    }

    /**
     * 找出本地独有的任务
     */
    findLocalOnlyTasks(tasks: GCTaskWithSync[]): GCTaskWithSync[] {
        return tasks.filter(t => t.source === 'markdown' && t.syncStatus !== 'synced');
    }

    /**
     * 找出远程独有的任务
     */
    findRemoteOnlyTasks(tasks: GCTaskWithSync[]): GCTaskWithSync[] {
        return tasks.filter(t => t.source !== 'markdown' && t.syncStatus !== 'synced');
    }

    /**
     * 找出已同步的任务（本地和远程都有）
     */
    findSyncedTasks(tasks: GCTaskWithSync[]): GCTaskWithSync[] {
        const syncIdMap = new Map<string, GCTaskWithSync[]>();

        for (const task of tasks) {
            if (task.syncId) {
                if (!syncIdMap.has(task.syncId)) {
                    syncIdMap.set(task.syncId, []);
                }
                syncIdMap.get(task.syncId)!.push(task);
            }
        }

        // 返回有本地和远程任务的任务组
        const result: GCTaskWithSync[] = [];
        for (const [, groupTasks] of syncIdMap) {
            const hasLocal = groupTasks.some(t => t.source === 'markdown');
            const hasRemote = groupTasks.some(t => t.source !== 'markdown');
            if (hasLocal && hasRemote) {
                result.push(...groupTasks);
            }
        }

        return result;
    }
}
