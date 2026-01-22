/**
 * 飞书任务 API
 *
 * 处理任务和任务清单相关的 API 请求
 */

import { Logger } from '../../../../../utils/logger';
import type { FeishuTask, FeishuTaskList, FeishuTaskRaw, FeishuTaskMember, FetchFunction } from './FeishuTypes';
import { API_ENDPOINTS } from './FeishuConstants';
import { FeishuHttpClient } from './FeishuHttpClient';
import type { FeishuTaskListResponse, FeishuTaskResponse, FeishuTaskUser } from './FeishuTypes';

/**
 * 飞书任务 API
 */
export class FeishuTaskApi {
    /**
     * 获取用户任务列表（已废弃，请使用按清单获取任务）
     * @param accessToken 访问令牌
     * @param fetchFn 可选的请求函数（用于绕过 CORS）
     * @param pageSize 每页数量，默认100
     * @param pageToken 分页令牌
     * @returns 任务列表
     * @deprecated 使用 getTasksByTaskList 代替
     */
    static async getTaskList(
        accessToken: string,
        fetchFn?: FetchFunction,
        pageSize: number = 100,
        pageToken?: string
    ): Promise<{ tasks: FeishuTask[]; hasMore: boolean; nextPageToken?: string }> {
        Logger.info('FeishuTaskApi', 'Fetching task list (deprecated)');

        // 构建 URL 参数
        const url = new URL(API_ENDPOINTS.TASK_LIST);
        url.searchParams.append('page_size', pageSize.toString());
        if (pageToken) {
            url.searchParams.append('page_token', pageToken);
        }

        const response = await FeishuHttpClient.fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }, fetchFn);

        Logger.debug('FeishuTaskApi', 'Task list response', {
            status: response.status,
            body: response.text,
        });

        const data = await FeishuHttpClient.parseResponse<FeishuTaskResponse>(response);

        if (data.code !== 0) {
            Logger.error('FeishuTaskApi', 'Get task list failed', { code: data.code, msg: data.msg });
            throw new Error(`获取任务列表失败: ${data.msg}`);
        }

        const rawTasks = data.data?.items || [];
        const hasMore = data.data?.has_more || false;
        const nextPageToken = data.data?.page_token;

        // 映射字段：FeishuTaskRaw -> FeishuTask
        const tasks: FeishuTask[] = rawTasks.map(task => ({
            task_guid: task.guid,
            summary: task.summary,
            description: task.description,
            completed: task.completed,
            completed_at: task.completed_at ? String(task.completed_at) : undefined,
            created_at: task.create_time ? String(task.create_time) : undefined,
            updated_at: task.update_time ? String(task.update_time) : undefined,
            start_time: task.start,
            due_time: task.due,
            status: task.status,
            priority: task.priority,
            assignee: task.assignee ? { user_id: task.assignee.id, name: task.assignee.name || '' } : undefined,
            followers: task.members?.filter(m => m.role === 'follower').map(m => ({ user_id: m.id, name: m.name || '' })),
            sub_task_count: task.subtask_count,
            sub_task_completed_count: 0,
        }));

        Logger.debug('FeishuTaskApi', `Fetched ${tasks.length} tasks`,
            tasks.map((task, index) => {
                const status = task.completed ? '[已完成]' : '[未完成]';
                return `${index + 1}. ${task.summary} ${status}`;
            })
        );

        return {
            tasks,
            hasMore,
            nextPageToken,
        };
    }

    /**
     * 获取用户任务清单列表
     * @param accessToken 访问令牌
     * @param fetchFn 可选的请求函数（用于绕过 CORS）
     * @param pageSize 每页数量，默认50
     * @param pageToken 分页令牌
     * @returns 任务清单列表
     */
    static async getTaskLists(
        accessToken: string,
        fetchFn?: FetchFunction,
        pageSize: number = 50,
        pageToken?: string
    ): Promise<{ taskLists: FeishuTaskList[]; hasMore: boolean; nextPageToken?: string }> {
        Logger.info('FeishuTaskApi', 'Fetching task lists');

        // 构建 URL 参数
        const url = new URL(API_ENDPOINTS.TASK_LISTS);
        url.searchParams.append('page_size', pageSize.toString());
        url.searchParams.append('user_id_type', 'open_id');
        if (pageToken) {
            url.searchParams.append('page_token', pageToken);
        }

        const response = await FeishuHttpClient.fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }, fetchFn);

        Logger.debug('FeishuTaskApi', 'Task lists response', {
            status: response.status,
            body: response.text,
        });

        const data = await FeishuHttpClient.parseResponse<FeishuTaskListResponse>(response);

        if (data.code !== 0) {
            Logger.error('FeishuTaskApi', 'Get task lists failed', { code: data.code, msg: data.msg });
            throw new Error(`获取任务清单失败: ${data.msg}`);
        }

        const taskLists = data.data?.items || [];
        const hasMore = data.data?.has_more || false;
        const nextPageToken = data.data?.page_token;

        Logger.debug('FeishuTaskApi', `Fetched ${taskLists.length} task lists`,
            taskLists.map((list, index) => `${index + 1}. ${list.name} (${list.guid})`)
        );

        return {
            taskLists,
            hasMore,
            nextPageToken,
        };
    }

    /**
     * 获取所有任务清单（自动分页）
     * @param accessToken 访问令牌
     * @param fetchFn 可选的请求函数（用于绕过 CORS）
     * @returns 所有任务清单列表
     */
    static async getAllTaskLists(
        accessToken: string,
        fetchFn?: FetchFunction
    ): Promise<FeishuTaskList[]> {
        const allTaskLists: FeishuTaskList[] = [];
        let pageToken: string | undefined = undefined;
        let pageCount = 0;
        const maxPages = 10; // 最多获取10页，防止无限循环

        while (pageCount < maxPages) {
            const result: Awaited<ReturnType<typeof FeishuTaskApi.getTaskLists>> = await this.getTaskLists(accessToken, fetchFn, 50, pageToken);
            allTaskLists.push(...result.taskLists);

            if (!result.hasMore || !result.nextPageToken) {
                break;
            }

            pageToken = result.nextPageToken;
            pageCount++;
        }

        Logger.info('FeishuTaskApi', `Fetched ${allTaskLists.length} task lists total`);
        return allTaskLists;
    }

    /**
     * 获取指定任务清单中的任务
     * @param accessToken 访问令牌
     * @param tasklistGuid 任务清单GUID
     * @param tasklistName 任务清单名称
     * @param fetchFn 可选的请求函数（用于绕过 CORS）
     * @returns 任务列表
     */
    static async getTasksByTaskList(
        accessToken: string,
        tasklistGuid: string,
        tasklistName: string,
        fetchFn?: FetchFunction
    ): Promise<FeishuTask[]> {
        Logger.info('FeishuTaskApi', `Fetching tasks for task list: ${tasklistName}`);

        // 构建请求 URL
        const url = `${API_ENDPOINTS.TASK_LISTS}/${tasklistGuid}/tasks`;

        const response = await FeishuHttpClient.fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }, fetchFn);

        Logger.debug('FeishuTaskApi', `Tasks response for "${tasklistName}"`, {
            status: response.status,
            body: response.text,
        });

        const data = await FeishuHttpClient.parseResponse<FeishuTaskResponse>(response);

        if (data.code !== 0) {
            Logger.error('FeishuTaskApi', 'Get tasks by task list failed', { code: data.code, msg: data.msg });
            throw new Error(`获取清单任务失败: ${data.msg}`);
        }

        const tasks = data.data?.items || [];

        // 调试：打印第一个任务的原始数据
        if (tasks.length > 0) {
            Logger.debug('FeishuTaskApi', `First task raw data for "${tasklistName}"`, tasks[0]);
        }

        // 将 API 返回的原始任务数据转换为我们需要的格式
        const tasksWithListInfo: FeishuTask[] = tasks.map(task => ({
            task_guid: task.guid,
            summary: task.summary,
            description: task.description,
            completed: task.completed,
            completed_at: task.completed_at ? String(task.completed_at) : undefined,
            created_at: task.create_time ? String(task.create_time) : undefined,
            updated_at: task.update_time ? String(task.update_time) : undefined,
            start_time: task.start,
            due_time: task.due,
            status: task.status,
            priority: task.priority,
            assignee: task.assignee ? { user_id: task.assignee.id, name: task.assignee.name || '' } : undefined,
            followers: task.members?.filter(m => m.role === 'follower').map(m => ({ user_id: m.id, name: m.name || '' })),
            tasklist_guid: tasklistGuid,
            tasklist_name: tasklistName,
            sub_task_count: task.subtask_count,
            sub_task_completed_count: 0,
        }));

        Logger.stats('FeishuTaskApi', `Fetched ${tasks.length} tasks from "${tasklistName}"`);

        return tasksWithListInfo;
    }

    /**
     * 获取所有任务（通过任务清单获取）
     * @param accessToken 访问令牌
     * @param fetchFn 可选的请求函数（用于绕过 CORS）
     * @returns 所有任务列表
     */
    static async getAllTasks(
        accessToken: string,
        fetchFn?: FetchFunction
    ): Promise<FeishuTask[]> {
        Logger.info('FeishuTaskApi', 'Starting to fetch all tasks via task lists');

        // 1. 获取所有任务清单
        const taskLists = await this.getAllTaskLists(accessToken, fetchFn);

        if (taskLists.length === 0) {
            Logger.warn('FeishuTaskApi', 'No task lists found');
            return [];
        }

        // 2. 获取每个任务清单中的任务
        const allTasks: FeishuTask[] = [];
        for (const taskList of taskLists) {
            const tasks = await this.getTasksByTaskList(
                accessToken,
                taskList.guid,
                taskList.name,
                fetchFn
            );
            allTasks.push(...tasks);
        }

        Logger.stats('FeishuTaskApi', `Fetched ${allTasks.length} tasks from ${taskLists.length} task lists`);
        return allTasks;
    }
}
