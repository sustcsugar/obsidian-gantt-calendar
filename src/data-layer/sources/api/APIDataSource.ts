/**
 * API 数据源基类
 *
 * 为基于 API 的任务管理服务提供通用实现。
 * 子类只需实现具体的 API 调用逻辑。
 */

import { IDataSource, ChangeEventHandler } from '../../IDataSource';
import type { GCTask } from '../../../types';
import type { DataSourceConfig, SyncStatus } from '../../types';
import type { GCTaskWithSync, DataSourceType } from '../../sync/syncTypes';
import { Logger } from '../../../utils/logger';

/**
 * API 任务 DTO（通用格式）
 */
export interface APITaskDTO {
    id: string;
    title: string;
    description?: string;
    completed: boolean;
    dueDate?: string;  // ISO 8601
    startDate?: string;
    priority?: string;
    tags?: string[];
    status?: string;
    [key: string]: any;  // 允许扩展字段
}

/**
 * API 响应格式
 */
export interface APIResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    hasMore?: boolean;
    cursor?: string;
}

/**
 * 创建任务响应（可能返回字符串 ID 或带 ID 的对象）
 */
export type APICreateResponse = APIResponse<string | { id: string }>;

/**
 * API 数据源基类
 */
export abstract class APIDataSource implements IDataSource {
    abstract readonly sourceId: string;
    abstract readonly sourceName: string;
    readonly isReadOnly = false;

    protected config: DataSourceConfig;
    protected changeHandler?: ChangeEventHandler;
    protected cache: Map<string, GCTaskWithSync> = new Map();
    protected lastFetchAt?: Date;
    protected pollTimer?: number;

    constructor(config: DataSourceConfig) {
        this.config = config;
    }

    /**
     * 初始化数据源
     */
    async initialize(config: DataSourceConfig): Promise<void> {
        this.config = config;

        // 验证连接
        const isValid = await this.validateConnection();
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
        const dto = this.toAPIDTO(task);
        const response = await this.apiCreateTask(dto);

        if (response.success && response.data) {
            // 处理返回的 ID（可能是字符串或对象）
            let remoteId = '';
            if (typeof response.data === 'string') {
                remoteId = response.data;
            } else if (typeof response.data === 'object' && response.data.id) {
                remoteId = response.data.id;
            }

            // 更新缓存
            const taskWithSync: GCTaskWithSync = {
                ...task,
                source: 'api',
                sourceId: remoteId,
                syncId: (task as any).syncId || this.generateSyncId(),
            };
            this.cache.set(remoteId, taskWithSync);

            // 通知变更
            this.notifyChange({
                created: [taskWithSync],
                updated: [],
                deleted: [],
            });

            return remoteId;
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
        const dto = this.toAPIDTO(updatedTask);

        const response = await this.apiUpdateTask(taskId, dto);

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
        const response = await this.apiDeleteTask(taskId);

        if (response.success) {
            const task = this.cache.get(taskId);
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

    // ==================== 抽象方法（子类实现） ====================

    /**
     * 验证连接
     */
    protected abstract validateConnection(): Promise<boolean>;

    /**
     * 从 API 拉取任务列表
     */
    protected abstract apiFetchTasks(cursor?: string): Promise<APIResponse<APITaskDTO[]>>;

    /**
     * 创建任务
     */
    protected abstract apiCreateTask(dto: APITaskDTO): Promise<APICreateResponse>;

    /**
     * 更新任务
     */
    protected abstract apiUpdateTask(id: string, dto: APITaskDTO): Promise<APIResponse<void>>;

    /**
     * 删除任务
     */
    protected abstract apiDeleteTask(id: string): Promise<APIResponse<void>>;

    // ==================== 可选重写方法 ====================

    /**
     * 将 GCTask 转换为 API DTO
     */
    protected toAPIDTO(task: GCTask): APITaskDTO {
        return {
            id: task.sourceId || '',
            title: task.description,
            description: task.content,
            completed: task.completed,
            dueDate: task.dueDate?.toISOString(),
            startDate: task.startDate?.toISOString(),
            priority: task.priority,
            tags: task.tags,
            status: task.status,
        };
    }

    /**
     * 将 API DTO 转换为 GCTask
     */
    protected fromAPIDTO(dto: APITaskDTO): GCTask {
        return {
            filePath: `${this.sourceId}/${dto.id}`,
            fileName: `${this.sourceId}.md`,
            lineNumber: 0,
            content: dto.description || dto.title,
            description: dto.title,
            completed: dto.completed,
            priority: dto.priority || 'normal',
            tags: dto.tags,
            dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
            startDate: dto.startDate ? new Date(dto.startDate) : undefined,
            status: dto.status as any,
            sourceId: dto.id,
        };
    }

    /**
     * 生成 syncId
     */
    protected generateSyncId(): string {
        return `${this.sourceId}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    // ==================== 内部方法 ====================

    /**
     * 拉取任务并更新缓存
     */
    protected async fetchTasks(cursor?: string): Promise<void> {
        const response = await this.apiFetchTasks(cursor);

        if (response.success && response.data) {
            const oldCache = new Map(this.cache);
            this.cache.clear();

            for (const dto of response.data) {
                const task = this.fromAPIDTO(dto);
                const existing = oldCache.get(dto.id);

                const taskWithSync: GCTaskWithSync = {
                    ...task,
                    source: 'api',
                    sourceId: dto.id,
                    syncId: existing?.syncId,
                    version: (existing?.version || 0) + 1,
                    lastModified: new Date(),
                };

                this.cache.set(dto.id, taskWithSync);
            }

            this.lastFetchAt = new Date();

            // 检测变化并通知
            this.detectChangesAndNotify(oldCache);

            // 如果有更多数据，继续拉取
            if (response.hasMore && response.cursor) {
                await this.fetchTasks(response.cursor);
            }
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
}
