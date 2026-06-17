/**
 * Microsoft To Do 数据源
 *
 * 实现微软 Graph API (To Do API) 的对接。
 * API 文档: https://docs.microsoft.com/graph/api/resources/todo-overview
 *
 * 注意：Microsoft To Do 需要 OAuth 2.0 认证
 */

import { requestUrl } from 'obsidian';
import { APIDataSource, APIResponse, APITaskDTO } from '../APIDataSource';
import type { DataSourceConfig } from '../../../types';
import { Logger } from '../../../../utils/logger';

/**
 * Microsoft To Do 任务 DTO
 */
interface MicrosoftTodoDTO {
    id: string;
    title: string;
    body?: {
        content: string;
        contentType: string;
    };
    status: 'completed' | 'notCompleted';
    dueDateTime?: {
        dateTime: string;
        timeZone: string;
    };
    createdDateTime: string;
    lastModifiedDateTime: string;
    importance?: 'low' | 'normal' | 'high';
}

/**
 * Microsoft Graph API 响应
 */
interface MicrosoftGraphResponse<T> {
    error?: {
        code: string;
        message: string;
    };
    value?: T;
    '@odata.nextLink'?: string;
}

/**
 * Microsoft To Do 数据源
 */
export class MicrosoftTodoProvider extends APIDataSource {
    readonly sourceId = 'microsoft-todo';
    readonly sourceName = 'Microsoft To Do';

    private accessToken: string;
    private refreshToken?: string;

    constructor(config: DataSourceConfig) {
        super(config);

        if (!config.api?.accessToken) {
            throw new Error('Microsoft To Do requires accessToken');
        }

        this.accessToken = config.api.accessToken;
        this.refreshToken = config.api.refreshToken;
    }

    /**
     * 验证连接
     */
    protected async validateConnection(): Promise<boolean> {
        try {
            await this.getTaskList(1);
            return true;
        } catch (error) {
            Logger.error('MicrosoftTodoProvider', 'Connection validation failed', error);
            return false;
        }
    }

    /**
     * 拉取任务列表
     */
    protected async apiFetchTasks(cursor?: string): Promise<APIResponse<APITaskDTO[]>> {
        const top = 100;
        const url = cursor || `/me/todo/lists/tasks/tasks?$top=${top}`;

        try {
            const response = await this.callAPI<MicrosoftGraphResponse<MicrosoftTodoDTO[]>>(url);

            if (response.error) {
                return {
                    success: false,
                    error: response.error.message,
                };
            }

            const tasks = response.value || [];
            const dtoList: APITaskDTO[] = tasks.map(this.fromMicrosoftDTO);

            return {
                success: true,
                data: dtoList,
                hasMore: !!response['@odata.nextLink'],
                cursor: response['@odata.nextLink'],
            };
        } catch (error) {
            Logger.error('MicrosoftTodoProvider', 'Fetch tasks failed', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * 创建任务
     */
    protected async apiCreateTask(dto: APITaskDTO): Promise<APIResponse<string>> {
        const todoTask = this.toMicrosoftDTO(dto);

        try {
            const response = await this.callAPI<MicrosoftGraphResponse<MicrosoftTodoDTO>>(
                '/me/todo/lists/tasks/tasks',
                'POST',
                todoTask
            );

            if (response.error) {
                return {
                    success: false,
                    error: response.error.message,
                };
            }

            if (response.value) {
                return {
                    success: true,
                    data: response.value.id,
                };
            }

            return {
                success: false,
                error: 'Failed to create task',
            };
        } catch (error) {
            Logger.error('MicrosoftTodoProvider', 'Create task failed', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * 更新任务
     */
    protected async apiUpdateTask(id: string, dto: APITaskDTO): Promise<APIResponse<void>> {
        const todoTask = this.toMicrosoftDTO(dto);

        try {
            const response = await this.callAPI<MicrosoftGraphResponse<MicrosoftTodoDTO>>(
                `/me/todo/lists/tasks/tasks/${id}`,
                'PATCH',
                todoTask
            );

            if (response.error) {
                return {
                    success: false,
                    error: response.error.message,
                };
            }

            return { success: true };
        } catch (error) {
            Logger.error('MicrosoftTodoProvider', 'Update task failed', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * 删除任务
     */
    protected async apiDeleteTask(id: string): Promise<APIResponse<void>> {
        try {
            const response = await this.callAPI<MicrosoftGraphResponse<void>>(
                `/me/todo/lists/tasks/tasks/${id}`,
                'DELETE'
            );

            if (response.error) {
                return {
                    success: false,
                    error: response.error.message,
                };
            }

            return { success: true };
        } catch (error) {
            Logger.error('MicrosoftTodoProvider', 'Delete task failed', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * 更新访问令牌
     */
    updateAccessToken(accessToken: string, refreshToken?: string): void {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
    }

    // ==================== Microsoft Graph API 方法 ====================

    /**
     * 调用 Microsoft Graph API
     */
    private async callAPI<T>(
        path: string,
        method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
        body?: unknown
    ): Promise<T> {
        // 确保 path 以 /me 或 /users 开头
        const fullPath = path.startsWith('/') ? path : `/${path}`;
        const url = `https://graph.microsoft.com/v1.0${fullPath}`;

        try {
            const response = await requestUrl({
                url,
                method,
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: body ? JSON.stringify(body) : undefined,
            });

            return response.json;
        } catch (error) {
            const status = (error)?.status;
            if (status === 401) {
                // Token 过期，需要刷新
                throw new Error('Access token expired, please re-authenticate');
            }
            throw new Error(`API request failed: ${status || 'unknown'} ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 获取任务列表
     */
    private async getTaskList(top: number = 100, skipToken?: string): Promise<MicrosoftGraphResponse<MicrosoftTodoDTO[]>> {
        let url = `/me/todo/lists/tasks/tasks?$top=${top}`;

        if (skipToken) {
            url += `&$skiptoken=${encodeURIComponent(skipToken)}`;
        }

        return this.callAPI<MicrosoftGraphResponse<MicrosoftTodoDTO[]>>(url);
    }

    /**
     * 将 Microsoft DTO 转换为通用 DTO
     */
    private fromMicrosoftDTO = (ms: MicrosoftTodoDTO): APITaskDTO => {
        return {
            id: ms.id,
            title: ms.title,
            description: ms.body?.content,
            completed: ms.status === 'completed',
            dueDate: ms.dueDateTime?.dateTime
                ? new Date(ms.dueDateTime.dateTime).toISOString()
                : undefined,
            priority: this.mapMicrosoftPriority(ms.importance),
            lastModified: new Date(ms.lastModifiedDateTime),
        };
    };

    /**
     * 将通用 DTO 转换为 Microsoft DTO
     */
    private toMicrosoftDTO(dto: APITaskDTO): Partial<MicrosoftTodoDTO> {
        const result: Partial<MicrosoftTodoDTO> = {
            title: dto.title,
            status: dto.completed ? 'completed' : 'notCompleted',
            importance: this.mapToMicrosoftPriority(dto.priority),
        };

        if (dto.description) {
            result.body = {
                content: dto.description,
                contentType: 'text',
            };
        }

        if (dto.dueDate) {
            const date = new Date(dto.dueDate);
            result.dueDateTime = {
                dateTime: date.toISOString(),
                timeZone: 'UTC',
            };
        }

        return result;
    }

    /**
     * 映射 Microsoft 优先级到通用优先级
     */
    private mapMicrosoftPriority(importance?: string): string {
        switch (importance) {
            case 'high':
                return 'high';
            case 'low':
                return 'low';
            case 'normal':
            default:
                return 'normal';
        }
    }

    /**
     * 映射通用优先级到 Microsoft 优先级
     */
    private mapToMicrosoftPriority(priority?: string): 'low' | 'normal' | 'high' {
        if (!priority) return 'normal';

        switch (priority) {
            case 'highest':
            case 'high':
                return 'high';
            case 'low':
            case 'lowest':
                return 'low';
            default:
                return 'normal';
        }
    }
}
