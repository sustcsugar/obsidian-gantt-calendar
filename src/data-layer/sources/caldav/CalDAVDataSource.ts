/**
 * CalDAV 数据源
 *
 * 实现 IDataSource 接口，提供 CalDAV 日历服务集成。
 * 支持 VTODO（任务）和 VEVENT（事件）的读取和写入。
 */

import { IDataSource, ChangeEventHandler } from '../../IDataSource';
import type { GCTask } from '../../../types';
import type { DataSourceConfig, SyncStatus } from '../../types';
import type { GCTaskWithSync, DataSourceType } from '../../sync/syncTypes';
import { Logger } from '../../../utils/logger';
import { CalDAVClient, CalDAVConfig } from './CalDAVClient';
import { icsToGCTask, gcTaskToICS } from './transformers/ICSTaskTransformer';

/**
 * CalDAV 数据源配置
 */
export interface CalDAVDataSourceConfig extends DataSourceConfig {
    caldav: {
        provider: 'google' | 'outlook' | 'apple' | 'custom';
        url: string;
        username?: string;
        password?: string;
        accessToken?: string;
        refreshToken?: string;
        calendarPath?: string;
    };
}

/**
 * CalDAV 数据源
 */
export class CalDAVDataSource implements IDataSource {
    readonly sourceId: string;
    readonly sourceName: string;
    readonly isReadOnly = false;

    private config: CalDAVDataSourceConfig;
    private changeHandler?: ChangeEventHandler;
    private cache: Map<string, GCTaskWithSync> = new Map();
    private client: CalDAVClient;
    private lastFetchAt?: Date;
    private pollTimer?: number;

    constructor(sourceId: string, sourceName: string, config: CalDAVDataSourceConfig) {
        this.sourceId = sourceId;
        this.sourceName = sourceName;
        this.config = config;

        const caldavConfig: CalDAVConfig = {
            url: config.caldav.url,
            username: config.caldav.username,
            password: config.caldav.password,
            accessToken: config.caldav.accessToken,
            calendarPath: config.caldav.calendarPath,
        };

        this.client = new CalDAVClient(caldavConfig);
    }

    /**
     * 初始化数据源
     */
    async initialize(config: DataSourceConfig): Promise<void> {
        this.config = config as CalDAVDataSourceConfig;

        // 更新客户端配置
        const caldavConfig = (config as CalDAVDataSourceConfig).caldav;
        this.client.setConfig({
            url: caldavConfig.url,
            username: caldavConfig.username,
            password: caldavConfig.password,
            accessToken: caldavConfig.accessToken,
            calendarPath: caldavConfig.calendarPath,
        });

        // 验证连接
        const isValid = await this.client.validateConnection();
        if (!isValid) {
            throw new Error(`Failed to connect to ${this.sourceName}`);
        }

        // 初始拉取
        await this.fetchTasks();

        // 设置自动轮询（如果启用）
        if (config.autoSync && config.syncInterval) {
            this.startPolling(config.syncInterval * 60 * 1000);
        }

        Logger.info(this.sourceId, `Initialized successfully`);
    }

    /**
     * 获取所有任务
     */
    async getTasks(): Promise<GCTask[]> {
        // 返回缓存的任务
        return Array.from(this.cache.values());
    }

    /**
     * 监听数据变化
     */
    onChange(handler: ChangeEventHandler): void {
        this.changeHandler = handler;
    }

    /**
     * 创建任务
     */
    async createTask(task: GCTask): Promise<string> {
        // 转换为 ICS
        const ics = gcTaskToICS(task, this.generateSyncId());
        const response = await this.client.createEvent(ics);

        if (response.success && response.data) {
            // 更新缓存
            const taskWithSync: GCTaskWithSync = {
                ...task,
                source: 'caldav',
                sourceId: response.data.uid,
                syncId: (task as any).syncId || response.data.uid,
            };
            this.cache.set(response.data.uid, taskWithSync);

            // 通知变更
            this.notifyChange({
                created: [taskWithSync],
                updated: [],
                deleted: [],
            });

            return response.data.uid;
        }

        throw new Error(response.error || 'Failed to create task');
    }

    /**
     * 更新任务
     */
    async updateTask(taskId: string, changes: any): Promise<void> {
        const existing = this.cache.get(taskId);
        if (!existing) {
            throw new Error(`Task ${taskId} not found`);
        }

        const updatedTask = { ...existing, ...changes };

        // 转换为 ICS
        const ics = gcTaskToICS(updatedTask, taskId);

        // 获取事件 URL（从缓存或生成）
        const eventUrl = (existing as any).url || `${this.config.caldav.url}/${taskId}.ics`;

        const response = await this.client.updateEvent(eventUrl, ics);

        if (response.success) {
            this.cache.set(taskId, updatedTask);

            // 通知变更
            this.notifyChange({
                created: [],
                updated: [{ id: taskId, changes, task: updatedTask }],
                deleted: [],
            });
        } else {
            throw new Error(response.error || 'Failed to update task');
        }
    }

    /**
     * 删除任务
     */
    async deleteTask(taskId: string): Promise<void> {
        const task = this.cache.get(taskId);
        const eventUrl = (task as any)?.url || `${this.config.caldav.url}/${taskId}.ics`;

        const response = await this.client.deleteEvent(eventUrl);

        if (response.success) {
            this.cache.delete(taskId);

            // 通知变更
            this.notifyChange({
                created: [],
                updated: [],
                deleted: [task || this.createPlaceholderTask(taskId)],
            });
        } else {
            throw new Error(response.error || 'Failed to delete task');
        }
    }

    /**
     * 获取同步状态
     */
    async getSyncStatus(): Promise<SyncStatus> {
        return {
            lastSyncAt: this.lastFetchAt,
            syncDirection: this.config.syncDirection,
            conflictResolution: this.config.conflictResolution,
        };
    }

    /**
     * 销毁数据源
     */
    destroy(): void {
        this.stopPolling();
        this.cache.clear();
    }

    // ==================== 内部方法 ====================

    /**
     * 拉取任务并更新缓存
     */
    protected async fetchTasks(): Promise<void> {
        const response = await this.client.getEvents();

        if (response.success && response.data) {
            const oldCache = new Map(this.cache);
            this.cache.clear();

            for (const event of response.data) {
                try {
                    const task = icsToGCTask(event.ics);
                    const existing = oldCache.get(event.uid);

                    const taskWithSync: GCTaskWithSync = {
                        ...task,
                        source: 'caldav',
                        sourceId: event.uid,
                        syncId: existing?.syncId || event.uid,
                        version: (existing?.version || 0) + 1,
                        lastModified: new Date(),
                        url: event.url,
                    } as any;

                    this.cache.set(event.uid, taskWithSync);
                } catch (error) {
                    Logger.warn(this.sourceId, `Failed to parse event: ${event.uid}`, error);
                }
            }

            this.lastFetchAt = new Date();

            // 检测变化并通知
            this.detectChangesAndNotify(oldCache);
        }
    }

    /**
     * 检测变化并通知
     */
    protected detectChangesAndNotify(oldCache: Map<string, GCTaskWithSync>): void {
        const created: GCTask[] = [];
        const updated: any[] = [];
        const deleted: GCTask[] = [];

        // 检测新增和更新
        for (const [id, newTask] of this.cache) {
            const oldTask = oldCache.get(id);

            if (!oldTask) {
                created.push(newTask);
            } else if (this.hasTaskChanged(oldTask, newTask)) {
                updated.push({
                    id,
                    changes: this.getTaskChanges(oldTask, newTask),
                    task: newTask,
                });
            }
        }

        // 检测删除
        for (const [id, oldTask] of oldCache) {
            if (!this.cache.has(id)) {
                deleted.push(oldTask);
            }
        }

        if (created.length > 0 || updated.length > 0 || deleted.length > 0) {
            this.notifyChange({ created, updated, deleted });
        }
    }

    /**
     * 判断任务是否有变化
     */
    protected hasTaskChanged(old: GCTask, newTask: GCTask): boolean {
        return (
            old.description !== newTask.description ||
            old.completed !== newTask.completed ||
            old.priority !== newTask.priority ||
            old.dueDate?.getTime() !== newTask.dueDate?.getTime() ||
            old.startDate?.getTime() !== newTask.startDate?.getTime()
        );
    }

    /**
     * 获取任务变化
     */
    protected getTaskChanges(old: GCTask, newTask: GCTask): any {
        const changes: any = {};

        if (old.description !== newTask.description) {
            changes.description = newTask.description;
        }
        if (old.completed !== newTask.completed) {
            changes.completed = newTask.completed;
        }
        if (old.priority !== newTask.priority) {
            changes.priority = newTask.priority;
        }
        if (old.dueDate?.getTime() !== newTask.dueDate?.getTime()) {
            changes.dueDate = newTask.dueDate;
        }
        if (old.startDate?.getTime() !== newTask.startDate?.getTime()) {
            changes.startDate = newTask.startDate;
        }

        return changes;
    }

    /**
     * 通知变化
     */
    protected notifyChange(changes: any): void {
        if (this.changeHandler) {
            this.changeHandler({
                sourceId: this.sourceId,
                ...changes,
            });
        }
    }

    /**
     * 创建占位任务
     */
    protected createPlaceholderTask(id: string): GCTask {
        return {
            filePath: `${this.sourceId}/${id}`,
            fileName: `${this.sourceId}.md`,
            lineNumber: 0,
            content: '',
            description: 'Deleted task',
            completed: false,
            priority: 'normal',
            sourceId: id,
        };
    }

    /**
     * 生成 syncId
     */
    protected generateSyncId(): string {
        return `${this.sourceId}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    /**
     * 开始轮询
     */
    protected startPolling(intervalMs: number): void {
        this.stopPolling();

        this.pollTimer = window.setTimeout(() => {
            this.fetchTasks().then(() => {
                this.startPolling(intervalMs);
            });
        }, intervalMs);
    }

    /**
     * 停止轮询
     */
    protected stopPolling(): void {
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = undefined;
        }
    }

    /**
     * 获取 CalDAV 客户端
     */
    getClient(): CalDAVClient {
        return this.client;
    }
}
