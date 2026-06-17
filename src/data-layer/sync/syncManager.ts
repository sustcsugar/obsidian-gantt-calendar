/**
 * 同步管理器
 *
 * 负责协调多数据源之间的任务同步。
 * 核心职责：
 * - 拉取所有数据源的任务
 * - 匹配和检测冲突
 * - 执行同步操作
 * - 推送变更到远程
 */

import { EventBus } from '../EventBus';
import { IDataSource } from '../IDataSource';
import type { GCTask } from '../../types';
import { setTaskMergeableField } from '../../types';
import type { MergeableTaskField } from '../../types';
import type { GCTaskWithSync, SyncConfiguration, SyncResult, DataSourceType } from './syncTypes';
import { TaskMatcher } from './taskMatcher';
import { ConflictResolver } from './conflictResolver';
import { VersionTracker } from './versionTracker';
import { Logger } from '../../utils/logger';

/**
 * 同步管理器
 */
export class SyncManager {
    private eventBus: EventBus;
    private configuration: SyncConfiguration;
    private dataSources: Map<string, IDataSource>;
    private matcher: TaskMatcher;
    private resolver: ConflictResolver;
    private versionTracker: VersionTracker;
    private isSyncing: boolean = false;
    private syncTimer?: number;

    // 自动同步定时器（由外部管理）
    autoSyncTimer?: number;

    constructor(eventBus: EventBus, config: SyncConfiguration) {
        this.eventBus = eventBus;
        this.configuration = config;
        this.dataSources = new Map();
        this.matcher = new TaskMatcher();
        this.resolver = new ConflictResolver(
            config.conflictResolution,
            config.fieldMergeRules
        );
        this.versionTracker = new VersionTracker();
    }

    /**
     * 注册数据源
     */
    registerDataSource(source: IDataSource): void {
        this.dataSources.set(source.sourceId, source);

        // 监听数据源变化
        source.onChange(async (changes) => {
            await this.handleSourceChanges(source.sourceId, changes);
        });
    }

    /**
     * 注销数据源
     */
    unregisterDataSource(sourceId: string): void {
        this.dataSources.delete(sourceId);
    }

    /**
     * 更新配置
     */
    updateConfiguration(config: Partial<SyncConfiguration>): void {
        this.configuration = { ...this.configuration, ...config };

        // 更新冲突解决策略
        if (config.conflictResolution) {
            this.resolver.setStrategy(config.conflictResolution);
        }
        if (config.fieldMergeRules) {
            this.resolver.setFieldMergeRules(config.fieldMergeRules);
        }

        // 自动同步由 SyncManagerBridge 管理，此处仅停止 SyncManager 自身的废弃定时器
        this.stopAutoSync();
    }

    /**
     * 执行同步
     */
    async sync(): Promise<SyncResult> {
        if (this.isSyncing) {
            Logger.warn('SyncManager', 'Sync already in progress, skipping');
            return {
                success: false,
                startTime: new Date(),
                endTime: new Date(),
                stats: {
                    fetched: 0,
                    created: 0,
                    updated: 0,
                    deleted: 0,
                    skipped: 0,
                    conflicts: 0,
                },
                errors: [{ error: 'Sync already in progress' }],
            };
        }

        this.isSyncing = true;
        const startTime = new Date();

        Logger.info('SyncManager', 'Starting sync...');

        // 发布同步开始事件
        this.eventBus.emit('sync:started', {
            timestamp: startTime,
        });

        const result: SyncResult = {
            success: false,
            startTime,
            endTime: new Date(),
            stats: {
                fetched: 0,
                created: 0,
                updated: 0,
                deleted: 0,
                skipped: 0,
                conflicts: 0,
            },
            errors: [],
        };

        try {
            // 阶段1：拉取所有数据源的任务
            const allTasks = await this.fetchAllTasks();
            result.stats.fetched = allTasks.length;

            Logger.debug('SyncManager', `Fetched ${allTasks.length} tasks from ${this.dataSources.size} sources`);

            // 阶段2：匹配任务
            const groups = this.matcher.matchTasks(allTasks);
            Logger.debug('SyncManager', `Matched into ${groups.length} groups`);

            // 阶段3：分离本地和远程任务
            const localTasks = allTasks.filter(t => t.source === 'markdown');
            const remoteTasks = allTasks.filter(t => t.source !== 'markdown');

            // 阶段4：检测冲突
            const conflicts = this.resolver.detectConflicts(localTasks, remoteTasks);
            result.stats.conflicts = conflicts.length;

            if (conflicts.length > 0) {
                Logger.warn('SyncManager', `Detected ${conflicts.length} conflicts`);

                if (this.configuration.conflictResolution === 'manual') {
                    // 手动模式，记录冲突但不自动解决
                    result.conflicts = conflicts;
                } else {
                    // 自动解决冲突
                    await this.resolveConflicts(conflicts);
                }
            }

            // 阶段5：计算变更
            const changes = this.calculateChanges(groups, localTasks, remoteTasks);

            // 阶段6：执行同步（根据同步方向）
            if (this.configuration.syncDirection !== 'export-only') {
                // 导入/双向：应用远程变更到本地
                await this.applyRemoteChanges(changes);
            }

            if (this.configuration.syncDirection !== 'import-only') {
                // 导出/双向：推送本地变更到远程
                await this.pushLocalChanges(changes);
            }

            result.stats.created = changes.toCreate.length;
            result.stats.updated = changes.toUpdate.length;
            result.stats.deleted = changes.toDelete.length;
            result.stats.skipped = changes.skipped.length;

            result.success = true;

            Logger.info('SyncManager', 'Sync completed', result.stats);

        } catch (error) {
            Logger.error('SyncManager', 'Sync failed', error);
            result.errors.push({
                error: error instanceof Error ? error.message : String(error),
            });
        }

        result.endTime = new Date();
        this.isSyncing = false;

        // 发布同步完成事件
        this.eventBus.emit('sync:completed', {
            timestamp: result.endTime,
            result,
        });

        return result;
    }

    /**
     * 拉取所有数据源的任务
     */
    private async fetchAllTasks(): Promise<GCTaskWithSync[]> {
        const allTasks: GCTaskWithSync[] = [];

        for (const [sourceId, source] of this.dataSources) {
            try {
                const tasks = await source.getTasks();
                const sourceType = this.getDataSourceType(sourceId);

                // 添加同步元数据
                const tasksWithMeta = tasks.map(task => {
                    const existing = this.versionTracker.getMetadata(
                        task.sourceId || `${sourceId}:${task.filePath}:${task.lineNumber}`
                    );

                    return {
                        ...task,
                        source: sourceType,
                        syncId: existing?.syncId,
                        version: existing?.version || 1,
                        lastModified: task.lastModified || new Date(),
                        lastSyncAt: existing?.lastSyncAt,
                        syncStatus: existing?.syncStatus || 'pending',
                    };
                });

                allTasks.push(...tasksWithMeta);
            } catch (error) {
                Logger.error('SyncManager', `Failed to fetch from ${sourceId}`, error);
            }
        }

        return allTasks;
    }

    /**
     * 计算需要同步的变更
     */
    private calculateChanges(
        groups: any[],
        localTasks: GCTaskWithSync[],
        remoteTasks: GCTaskWithSync[]
    ) {
        const toCreate: GCTaskWithSync[] = [];
        const toUpdate: Array<{ task: GCTaskWithSync; changes: Partial<GCTask> }> = [];
        const toDelete: GCTaskWithSync[] = [];
        const toSync: GCTaskWithSync[] = [];
        const skipped: GCTaskWithSync[] = [];

        for (const group of groups) {
            const local = group.tasks.find((t: GCTaskWithSync) => t.source === 'markdown');
            const remotes = group.tasks.filter((t: GCTaskWithSync) => t.source !== 'markdown');

            if (!local && remotes.length > 0) {
                // 远程独有：需要创建到本地（import/export 模式）
                if (this.configuration.syncDirection !== 'export-only') {
                    toCreate.push(...remotes);
                } else {
                    skipped.push(...remotes);
                }
            } else if (local && !remotes.length) {
                // 本地独有：需要推送到远程（bidirectional/export 模式）
                if (this.configuration.syncDirection !== 'import-only') {
                    toSync.push(local);
                } else {
                    skipped.push(local);
                }
            } else if (local && remotes.length > 0) {
                // 双方都有：检查是否需要更新
                const needsSync = this.versionTracker.needsSync(local);
                const remoteNeedsSync = remotes.some((r: GCTaskWithSync) => this.versionTracker.needsSync(r));

                if (needsSync || remoteNeedsSync) {
                    toUpdate.push({
                        task: local,
                        changes: this.calculateTaskChanges(local, remotes[0]),
                    });
                    toSync.push(local, ...remotes);
                } else {
                    skipped.push(local, ...remotes);
                }
            }
        }

        return { toCreate, toUpdate, toDelete, toSync, skipped };
    }

    /**
     * 计算任务变更
     */
    private calculateTaskChanges(local: GCTaskWithSync, remote: GCTaskWithSync): Partial<GCTask> {
        const changes: Partial<GCTask> = {};

        // 比较关键字段
        const fieldsToCompare: (keyof GCTask)[] = [
            'description', 'completed', 'dueDate', 'startDate',
            'priority', 'status', 'tags',
        ];

        for (const field of fieldsToCompare) {
            const localVal = local[field];
            const remoteVal = remote[field];

            if (localVal !== remoteVal) {
                // 根据合并规则决定使用哪个值
                const rule = this.configuration.fieldMergeRules?.find(r => r.field === field);

                if (rule) {
                    switch (rule.winner) {
                        case 'local':
                            setTaskMergeableField(changes as GCTask, field as MergeableTaskField, localVal);
                            break;
                        case 'remote':
                            if (remoteVal !== undefined) {
                                setTaskMergeableField(changes as GCTask, field as MergeableTaskField, remoteVal);
                            }
                            break;
                        case 'newest': {
                            const localTime = local.lastModified?.getTime() || 0;
                            const remoteTime = remote.lastModified?.getTime() || 0;
                            setTaskMergeableField(changes as GCTask, field as MergeableTaskField, localTime >= remoteTime ? localVal : remoteVal);
                            break;
                        }
                    }
                } else {
                    // 默认使用本地值
                    setTaskMergeableField(changes as GCTask, field as MergeableTaskField, localVal);
                }
            }
        }

        return changes;
    }

    /**
     * 应用远程变更到本地
     */
    private async applyRemoteChanges(changes: any): Promise<void> {
        // 在实际实现中，这里需要更新 Markdown 文件
        // 由于 MarkdownDataSource 暂不支持直接写入，这里暂时只是记录日志
        Logger.debug('SyncManager', 'Applying remote changes:', {
            toCreate: changes.toCreate.length,
            toUpdate: changes.toUpdate.length,
        });
    }

    /**
     * 推送本地变更到远程
     */
    private async pushLocalChanges(changes: any): Promise<void> {
        for (const task of changes.toSync) {
            if (task.source === 'markdown') {
                // 推送到远程数据源
                for (const [sourceId, source] of this.dataSources) {
                    if (sourceId === 'markdown') continue;
                    if (!source.isReadOnly) {
                        try {
                            if (task.syncId) {
                                await source.updateTask(task.syncId, {});
                            } else {
                                const newId = await source.createTask(task);
                                this.versionTracker.updateSyncMetadata({
                                    ...task,
                                    sourceId: newId,
                                });
                            }
                            this.versionTracker.markAsSynced(task);
                        } catch (error) {
                            Logger.error('SyncManager', `Failed to push to ${sourceId}`, error);
                        }
                    }
                }
            }
        }
    }

    /**
     * 解决冲突
     */
    private async resolveConflicts(conflicts: any[]): Promise<void> {
        const resolved = this.resolver.resolveConflicts(conflicts);

        for (const [syncId, resolvedTask] of resolved) {
            // 更新版本追踪
            this.versionTracker.updateSyncMetadata(resolvedTask);
        }
    }

    /**
     * 处理数据源变化
     */
    private async handleSourceChanges(sourceId: string, changes: any): Promise<void> {
        Logger.debug('SyncManager', `Handling changes from ${sourceId}`);

        // 触发增量同步
        if (this.configuration.syncInterval > 0) {
            // 防抖处理
            if (this.syncTimer) {
                window.clearTimeout(this.syncTimer);
            }
            this.syncTimer = window.setTimeout(() => {
                this.sync();
            }, 5000); // 5秒后同步
        }
    }

    /**
     * 启动自动同步
     */
    startAutoSync(): void {
        if (this.configuration.syncInterval > 0) {
            const intervalMs = this.configuration.syncInterval * 60 * 1000;

            this.syncTimer = window.setTimeout(() => {
                this.sync().then(() => {
                    this.startAutoSync(); // 递归调用实现周期同步
                }).catch(error => {
                    Logger.error('SyncManager', 'Auto-sync error:', error);
                    this.startAutoSync(); // 即使出错也继续同步
                });
            }, intervalMs);

            Logger.info('SyncManager', `Auto-sync started (interval: ${this.configuration.syncInterval} minutes)`);
        }
    }

    /**
     * 停止自动同步
     */
    stopAutoSync(): void {
        if (this.syncTimer) {
            window.clearTimeout(this.syncTimer);
            this.syncTimer = undefined;
        }
        Logger.info('SyncManager', 'Auto-sync stopped');
    }

    /**
     * 获取数据源类型
     */
    private getDataSourceType(sourceId: string): DataSourceType {
        if (sourceId === 'markdown') return 'markdown';
        if (sourceId.startsWith('api-')) return 'api';
        if (sourceId.startsWith('caldav-')) return 'caldav';
        return 'markdown';
    }

    /**
     * 获取同步状态
     */
    getStatus(): {
        isSyncing: boolean;
        lastSyncAt?: Date;
        stats: any;
    } {
        return {
            isSyncing: this.isSyncing,
            stats: this.versionTracker.getStats(),
        };
    }

    /**
     * 销毁
     */
    destroy(): void {
        this.stopAutoSync();
        this.dataSources.clear();
        this.versionTracker.clearAll();
    }
}
