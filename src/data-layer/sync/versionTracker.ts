/**
 * 版本追踪器
 *
 * 负责任务的版本控制和同步状态追踪。
 * 维护任务元数据，支持增量同步。
 */

import type { GCTask } from '../../types';
import type {
    GCTaskWithSync,
    GCTaskSyncMetadata,
    TaskSyncStatus,
    DataSourceType,
    SyncStateData,
    TaskMapping,
} from './syncTypes';

/**
 * 版本追踪器
 */
export class VersionTracker {
    // 任务元数据存储 (syncId -> metadata)
    private taskMetadata: Map<string, GCTaskSyncMetadata>;

    // 任务映射存储 (syncId -> mappings)
    private taskMappings: Map<string, TaskMapping>;

    // 数据源游标 (sourceId -> cursor)
    private sourceCursors: Map<string, string>;

    constructor() {
        this.taskMetadata = new Map();
        this.taskMappings = new Map();
        this.sourceCursors = new Map();
    }

    /**
     * 为任务添加同步元数据
     */
    addSyncMetadata(
        task: GCTask,
        source: DataSourceType,
        syncId?: string
    ): GCTaskWithSync {
        const now = new Date();
        const finalSyncId = syncId || this.generateSyncId();

        const metadata: GCTaskSyncMetadata = {
            syncId: finalSyncId,
            source,
            version: 1,
            lastModified: now,
            syncStatus: 'pending',
        };

        // 存储元数据
        this.taskMetadata.set(finalSyncId, metadata);

        // 更新任务映射
        this.updateMapping(finalSyncId, source, task);

        return {
            ...task,
            ...metadata,
        };
    }

    /**
     * 更新任务的同步元数据
     */
    updateSyncMetadata(
        task: GCTaskWithSync
    ): GCTaskWithSync {
        if (!task.syncId) {
            return this.addSyncMetadata(task, task.source || 'markdown');
        }

        const existing = this.taskMetadata.get(task.syncId);
        const now = new Date();

        const updated: GCTaskSyncMetadata = {
            syncId: task.syncId,
            source: task.source || 'markdown',
            sourceId: task.sourceId,
            version: (existing?.version || 0) + 1,
            lastModified: task.lastModified || now,
            lastSyncAt: existing?.lastSyncAt,
            syncStatus: task.syncStatus || 'pending',
            conflictWith: task.conflictWith,
            conflictResolved: task.conflictResolved,
        };

        this.taskMetadata.set(task.syncId, updated);

        return {
            ...task,
            ...updated,
        };
    }

    /**
     * 标记任务为已同步
     */
    markAsSynced(task: GCTaskWithSync, remoteVersion?: string): void {
        if (!task.syncId) return;

        const metadata = this.taskMetadata.get(task.syncId);
        if (!metadata) return;

        metadata.syncStatus = 'synced';
        metadata.lastSyncAt = new Date();
        if (remoteVersion) {
            metadata.remoteVersion = remoteVersion;
        }

        this.taskMetadata.set(task.syncId, metadata);
    }

    /**
     * 标记任务为有冲突
     */
    markAsConflict(task: GCTaskWithSync, conflictWith: string): void {
        if (!task.syncId) return;

        const metadata = this.taskMetadata.get(task.syncId);
        if (!metadata) return;

        metadata.syncStatus = 'conflict';
        metadata.conflictWith = conflictWith;

        this.taskMetadata.set(task.syncId, metadata);
    }

    /**
     * 获取任务的同步元数据
     */
    getMetadata(syncId: string): GCTaskSyncMetadata | undefined {
        return this.taskMetadata.get(syncId);
    }

    /**
     * 获取所有待同步的任务
     */
    getPendingTasks(): GCTaskSyncMetadata[] {
        return Array.from(this.taskMetadata.values()).filter(
            m => m.syncStatus === 'pending'
        );
    }

    /**
     * 获取所有有冲突的任务
     */
    getConflictTasks(): GCTaskSyncMetadata[] {
        return Array.from(this.taskMetadata.values()).filter(
            m => m.syncStatus === 'conflict'
        );
    }

    /**
     * 检查任务是否需要同步
     */
    needsSync(task: GCTaskWithSync): boolean {
        if (!task.syncId) return true;

        const metadata = this.taskMetadata.get(task.syncId);
        if (!metadata) return true;

        // 检查版本号
        if (metadata.remoteVersion && task.version) {
            return task.version > parseInt(metadata.remoteVersion);
        }

        // 检查修改时间
        if (metadata.lastSyncAt) {
            const lastModified = task.lastModified || metadata.lastModified;
            return lastModified > metadata.lastSyncAt;
        }

        return metadata.syncStatus === 'pending';
    }

    /**
     * 比较版本号
     */
    compareVersions(local: GCTaskWithSync, remote: GCTaskWithSync): number {
        const localVersion = local.version || 0;
        const remoteVersion = remote.version || 0;

        if (localVersion === remoteVersion) return 0;
        return localVersion > remoteVersion ? 1 : -1;
    }

    /**
     * 生成唯一 syncId
     */
    generateSyncId(): string {
        return `sync_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    /**
     * 更新任务映射
     */
    private updateMapping(syncId: string, source: DataSourceType, task: GCTask): void {
        let mapping = this.taskMappings.get(syncId);

        if (!mapping) {
            mapping = {
                syncId,
                mappings: new Map(),
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            this.taskMappings.set(syncId, mapping);
        }

        // 使用 filePath:lineNumber 作为本地任务的 sourceId
        const sourceId = source === 'markdown'
            ? `${task.filePath}:${task.lineNumber}`
            : task.sourceId || syncId;

        mapping.mappings.set(source, sourceId);
        mapping.updatedAt = new Date();
    }

    /**
     * 获取任务映射
     */
    getMapping(syncId: string): TaskMapping | undefined {
        return this.taskMappings.get(syncId);
    }

    /**
     * 根据数据源 ID 查找 syncId
     */
    findSyncIdBySourceId(sourceId: string, source: DataSourceType): string | undefined {
        for (const [syncId, mapping] of this.taskMappings) {
            if (mapping.mappings.get(source) === sourceId) {
                return syncId;
            }
        }
        return undefined;
    }

    /**
     * 设置数据源游标
     */
    setSourceCursor(sourceId: string, cursor: string): void {
        this.sourceCursors.set(sourceId, cursor);
    }

    /**
     * 获取数据源游标
     */
    getSourceCursor(sourceId: string): string | undefined {
        return this.sourceCursors.get(sourceId);
    }

    /**
     * 清除指定任务的元数据
     */
    clearMetadata(syncId: string): void {
        this.taskMetadata.delete(syncId);
        this.taskMappings.delete(syncId);
    }

    /**
     * 清除所有元数据
     */
    clearAll(): void {
        this.taskMetadata.clear();
        this.taskMappings.clear();
        this.sourceCursors.clear();
    }

    /**
     * 导出状态（用于持久化）
     */
    exportState(): Omit<SyncStateData, 'version' | 'configuration'> {
        const sourceStates = new Map<string, any>();

        for (const [sourceId, cursor] of this.sourceCursors) {
            sourceStates.set(sourceId, { cursor });
        }

        return {
            sourceStates,
            taskMetadata: this.taskMetadata,
        };
    }

    /**
     * 导入状态（从持久化恢复）
     */
    importState(state: Pick<SyncStateData, 'sourceStates' | 'taskMetadata'>): void {
        // 恢复任务元数据
        this.taskMetadata = new Map(state.taskMetadata);

        // 恢复数据源游标
        this.sourceCursors.clear();
        for (const [sourceId, stateData] of state.sourceStates) {
            if (stateData.cursor) {
                this.sourceCursors.set(sourceId, stateData.cursor);
            }
        }

        // 重建任务映射（从元数据）
        this.taskMappings.clear();
        for (const [syncId, metadata] of this.taskMetadata) {
            if (metadata.sourceId) {
                let mapping = this.taskMappings.get(syncId);
                if (!mapping) {
                    mapping = {
                        syncId,
                        mappings: new Map(),
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    };
                    this.taskMappings.set(syncId, mapping);
                }
                mapping.mappings.set(metadata.source, metadata.sourceId);
            }
        }
    }

    /**
     * 获取统计信息
     */
    getStats(): {
        totalTasks: number;
        pendingTasks: number;
        syncedTasks: number;
        conflictTasks: number;
        localOnlyTasks: number;
        remoteOnlyTasks: number;
    } {
        const all = Array.from(this.taskMetadata.values());

        return {
            totalTasks: all.length,
            pendingTasks: all.filter(m => m.syncStatus === 'pending').length,
            syncedTasks: all.filter(m => m.syncStatus === 'synced').length,
            conflictTasks: all.filter(m => m.syncStatus === 'conflict').length,
            localOnlyTasks: all.filter(m => m.source === 'markdown').length,
            remoteOnlyTasks: all.filter(m => m.source !== 'markdown').length,
        };
    }
}
