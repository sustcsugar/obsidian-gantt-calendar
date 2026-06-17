/**
 * 冲突解决器
 *
 * 负责检测和解决同步过程中的任务冲突。
 * 支持多种解决策略和字段级合并。
 */

import type { GCTask } from '../../types';
import { setTaskMergeableField } from '../../types';
import type { MergeableTaskField } from '../../types';
import type {
    GCTaskWithSync,
    ConflictResolution,
    ConflictInfo,
    FieldMergeRule,
    SyncError,
} from './syncTypes';

/**
 * 关键字段列表
 * 这些字段的变化会触发冲突检测
 */
const CRITICAL_FIELDS: (keyof GCTask)[] = [
    'description',
    'completed',
    'dueDate',
    'startDate',
    'priority',
    'status',
];

/**
 * 冲突解决器
 */
export class ConflictResolver {
    private strategy: ConflictResolution;
    private fieldMergeRules?: FieldMergeRule[];

    constructor(
        strategy: ConflictResolution = 'local-win',
        fieldMergeRules?: FieldMergeRule[]
    ) {
        this.strategy = strategy;
        this.fieldMergeRules = fieldMergeRules;
    }

    /**
     * 检测冲突
     */
    detectConflicts(
        localTasks: GCTaskWithSync[],
        remoteTasks: GCTaskWithSync[]
    ): ConflictInfo[] {
        const conflicts: ConflictInfo[] = [];

        // 按 syncId 分组
        const localMap = new Map<string, GCTaskWithSync>();
        const remoteMap = new Map<string, GCTaskWithSync>();

        for (const task of localTasks) {
            if (task.syncId) {
                localMap.set(task.syncId, task);
            }
        }

        for (const task of remoteTasks) {
            if (task.syncId) {
                remoteMap.set(task.syncId, task);
            }
        }

        // 检测版本冲突
        for (const [syncId, localTask] of localMap) {
            const remoteTask = remoteMap.get(syncId);

            if (remoteTask && this.hasConflict(localTask, remoteTask)) {
                const conflictFields = this.getConflictFields(localTask, remoteTask);

                conflicts.push({
                    syncId,
                    localTask,
                    remoteTask,
                    conflictFields,
                    suggestedResolution: this.suggestResolution(localTask, remoteTask),
                });
            }
        }

        return conflicts;
    }

    /**
     * 判断两个任务是否冲突
     */
    private hasConflict(local: GCTaskWithSync, remote: GCTaskWithSync): boolean {
        // 条件1：双方都在上次同步后被修改
        const localModified = this.wasModifiedSinceLastSync(local);
        const remoteModified = this.wasModifiedSinceLastSync(remote);

        if (localModified && remoteModified) {
            // 检查关键字段是否有差异
            return this.hasFieldDifferences(local, remote);
        }

        return false;
    }

    /**
     * 判断任务是否在上次同步后被修改
     */
    private wasModifiedSinceLastSync(task: GCTaskWithSync): boolean {
        if (!task.lastSyncAt) {
            // 从未同步过，视为有修改
            return true;
        }

        if (!task.lastModified) {
            return false;
        }

        return task.lastModified > task.lastSyncAt;
    }

    /**
     * 判断两个任务是否有字段差异
     */
    private hasFieldDifferences(task1: GCTask, task2: GCTask): boolean {
        return this.getConflictFields(task1, task2).length > 0;
    }

    /**
     * 获取冲突的字段列表
     */
    private getConflictFields(task1: GCTask, task2: GCTask): string[] {
        const conflicts: string[] = [];

        for (const field of CRITICAL_FIELDS) {
            const val1 = task1[field];
            const val2 = task2[field];

            if (val1 !== val2) {
                // 处理 Date 类型的比较
                if (val1 instanceof Date && val2 instanceof Date) {
                    if (val1.getTime() !== val2.getTime()) {
                        conflicts.push(field);
                    }
                } else {
                    conflicts.push(field);
                }
            }
        }

        return conflicts;
    }

    /**
     * 根据策略解决冲突
     */
    resolveConflict(conflict: ConflictInfo): GCTask {
        switch (this.strategy) {
            case 'local-win':
                return conflict.localTask;

            case 'remote-win':
                return conflict.remoteTask;

            case 'newest-win':
                return this.resolveByNewest(conflict);

            case 'manual':
                // 手动模式返回本地任务，但标记为需要手动处理
                return {
                    ...conflict.localTask,
                    syncStatus: 'conflict',
                    conflictWith: conflict.remoteTask.source || 'api',
                } as GCTask;

            default:
                return conflict.localTask;
        }
    }

    /**
     * 按最新修改时间解决冲突
     */
    private resolveByNewest(conflict: ConflictInfo): GCTask {
        const localTime = conflict.localTask.lastModified?.getTime() || 0;
        const remoteTime = conflict.remoteTask.lastModified?.getTime() || 0;

        return localTime >= remoteTime ? conflict.localTask : conflict.remoteTask;
    }

    /**
     * 字段级合并
     * 根据字段合并规则合并两个任务
     */
    mergeFields(local: GCTaskWithSync, remote: GCTaskWithSync): GCTask {
        if (!this.fieldMergeRules || this.fieldMergeRules.length === 0) {
            // 没有合并规则，使用默认策略
            return this.resolveByNewest({ localTask: local, remoteTask: remote } as ConflictInfo);
        }

        const merged: GCTask = { ...local };

        for (const rule of this.fieldMergeRules) {
            const localVal = local[rule.field];
            const remoteVal = remote[rule.field];

            // 如果值相同，跳过
            if (localVal === remoteVal) {
                continue;
            }

            switch (rule.winner) {
                case 'local':
                    // 保持本地值（已默认）
                    break;

                case 'remote':
                    if (remoteVal !== undefined) {
                        setTaskMergeableField(merged, rule.field as MergeableTaskField, remoteVal);
                    }
                    break;

                case 'newest': {
                    // 比较修改时间
                    const localTime = local.lastModified?.getTime() || 0;
                    const remoteTime = remote.lastModified?.getTime() || 0;

                    if (remoteTime > localTime && remoteVal !== undefined) {
                        setTaskMergeableField(merged, rule.field as MergeableTaskField, remoteVal);
                    }
                    break;
                }
            }
        }

        return merged;
    }

    /**
     * 建议解决方案
     */
    private suggestResolution(local: GCTaskWithSync, remote: GCTaskWithSync): 'local' | 'remote' | 'merge' {
        const localTime = local.lastModified?.getTime() || 0;
        const remoteTime = remote.lastModified?.getTime() || 0;

        // 如果修改时间相差很小（1分钟内），建议合并
        if (Math.abs(localTime - remoteTime) < 60000) {
            return 'merge';
        }

        // 否则建议使用最新的
        return localTime >= remoteTime ? 'local' : 'remote';
    }

    /**
     * 批量解决冲突
     */
    resolveConflicts(conflicts: ConflictInfo[]): Map<string, GCTask> {
        const results = new Map<string, GCTask>();

        for (const conflict of conflicts) {
            const resolved = this.resolveConflict(conflict);
            results.set(conflict.syncId, resolved);
        }

        return results;
    }

    /**
     * 将冲突转换为错误信息
     */
    conflictToError(conflict: ConflictInfo): SyncError {
        return {
            taskId: conflict.syncId,
            taskDescription: conflict.localTask.description,
            error: `Conflict with ${conflict.remoteTask.source}: ${conflict.conflictFields.join(', ')}`,
            source: conflict.localTask.source,
        };
    }

    /**
     * 设置冲突解决策略
     */
    setStrategy(strategy: ConflictResolution): void {
        this.strategy = strategy;
    }

    /**
     * 设置字段合并规则
     */
    setFieldMergeRules(rules: FieldMergeRule[]): void {
        this.fieldMergeRules = rules;
    }

    /**
     * 获取当前策略
     */
    getStrategy(): ConflictResolution {
        return this.strategy;
    }
}

/**
 * 创建默认的字段合并规则
 */
export function createDefaultMergeRules(): FieldMergeRule[] {
    return [
        { field: 'description', winner: 'newest' },
        { field: 'dueDate', winner: 'local' },
        { field: 'startDate', winner: 'local' },
        { field: 'completed', winner: 'remote' },
        { field: 'priority', winner: 'newest' },
    ];
}
