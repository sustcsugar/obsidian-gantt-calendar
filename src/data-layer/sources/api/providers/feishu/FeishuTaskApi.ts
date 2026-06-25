/**
 * 飞书任务 API
 *
 * 处理任务和任务清单相关的 API 请求
 */

import { Logger } from '../../../../../utils/logger';
import type { FeishuTask, FeishuTaskList, FeishuTaskRaw, FetchFunction } from './FeishuTypes';
import { API_ENDPOINTS } from './FeishuConstants';
import { FeishuHttpClient } from './FeishuHttpClient';
import type { FeishuTaskListResponse, FeishuTaskResponse } from './FeishuTypes';

/**
 * 飞书任务 API
 */
export class FeishuTaskApi {
    /**
     * 获取用户任务列表（已废弃，请使用按清单获取任务）
     * @deprecated 使用 getTasksByTaskList 代替
     */
    static async getTaskList(
        accessToken: string,
        fetchFn?: FetchFunction,
        pageSize: number = 100,
        pageToken?: string
    ): Promise<{ tasks: FeishuTask[]; hasMore: boolean; nextPageToken?: string }> {
        Logger.info('FeishuTaskApi', 'Fetching task list (deprecated)');

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

        const data = await FeishuHttpClient.parseResponse<FeishuTaskResponse>(response);

        if (data.code !== 0) {
            Logger.error('FeishuTaskApi', 'Get task list failed', { code: data.code, msg: data.msg });
            throw new Error(`获取任务列表失败: ${data.msg}`);
        }

        const rawTasks = data.data?.items || [];
        const hasMore = data.data?.has_more || false;
        const nextPageToken = data.data?.page_token;

        const tasks: FeishuTask[] = rawTasks.map(task => ({
            task_guid: task.guid,
            summary: task.summary,
            description: task.description,
            completed: task.completed,
            completed_at: task.completed_at ? String(task.completed_at) : undefined,
            created_at: task.created_at ? String(task.created_at) : undefined,
            updated_at: task.updated_at ? String(task.updated_at) : undefined,
            start_time: task.start,
            due_time: task.due,
            status: task.status,
            priority: task.priority,
            assignee: task.assignee ? { user_id: task.assignee.id, name: task.assignee.name || '' } : undefined,
            followers: task.members?.filter(m => m.role === 'follower').map(m => ({ user_id: m.id, name: m.name || '' })),
            sub_task_count: task.subtask_count,
            sub_task_completed_count: 0,
        }));

        return { tasks, hasMore, nextPageToken };
    }

    /**
     * 获取用户任务清单列表
     */
    static async getTaskLists(
        accessToken: string,
        fetchFn?: FetchFunction,
        pageSize: number = 50,
        pageToken?: string
    ): Promise<{ taskLists: FeishuTaskList[]; hasMore: boolean; nextPageToken?: string }> {
        Logger.info('FeishuTaskApi', 'Fetching task lists');

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

        const data = await FeishuHttpClient.parseResponse<FeishuTaskListResponse>(response);

        if (data.code !== 0) {
            Logger.error('FeishuTaskApi', 'Get task lists failed', { code: data.code, msg: data.msg });
            throw new Error(`获取任务清单失败: ${data.msg}`);
        }

        const taskLists = data.data?.items || [];
        const hasMore = data.data?.has_more || false;
        const nextPageToken = data.data?.page_token;

        return { taskLists, hasMore, nextPageToken };
    }

    /**
     * 获取所有任务清单（自动分页）
     */
    static async getAllTaskLists(
        accessToken: string,
        fetchFn?: FetchFunction
    ): Promise<FeishuTaskList[]> {
        const allTaskLists: FeishuTaskList[] = [];
        let pageToken: string | undefined = undefined;
        let pageCount = 0;

        while (pageCount < 10) {
            const result: { taskLists: FeishuTaskList[]; hasMore: boolean; nextPageToken?: string } = await this.getTaskLists(accessToken, fetchFn, 50, pageToken);
            allTaskLists.push(...result.taskLists);

            if (!result.hasMore || !result.nextPageToken) break;

            pageToken = result.nextPageToken;
            pageCount++;
        }

        Logger.info('FeishuTaskApi', `Fetched ${allTaskLists.length} task lists total`);
        return allTaskLists;
    }

    /**
     * 获取指定任务清单中的任务（支持分页）
     */
    static async getTasksByTaskList(
        accessToken: string,
        tasklistGuid: string,
        tasklistName: string,
        fetchFn?: FetchFunction
    ): Promise<FeishuTask[]> {
        Logger.info('FeishuTaskApi', `Fetching tasks for task list: ${tasklistName}`);

        const allRawTasks: FeishuTaskRaw[] = [];
        let pageToken: string | undefined;
        let pageCount = 0;

        do {
            const url = new URL(`${API_ENDPOINTS.TASK_LISTS}/${tasklistGuid}/tasks`);
            url.searchParams.append('page_size', '100');
            if (pageToken) url.searchParams.append('page_token', pageToken);

            const response = await FeishuHttpClient.fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
            }, fetchFn);

            const data = await FeishuHttpClient.parseResponse<FeishuTaskResponse>(response);

            if (data.code !== 0) {
                throw new Error(`获取清单任务失败: ${data.msg}`);
            }

            const items = data.data?.items || [];
            allRawTasks.push(...items);
            pageToken = data.data?.has_more ? data.data?.page_token : undefined;
            pageCount++;
        } while (pageToken && pageCount < 20);

        const tasksWithListInfo: FeishuTask[] = allRawTasks.map(task => ({
            task_guid: task.guid,
            summary: task.summary,
            description: task.description,
            completed: task.completed,
            completed_at: task.completed_at ? String(task.completed_at) : undefined,
            created_at: task.created_at ? String(task.created_at) : undefined,
            updated_at: task.updated_at ? String(task.updated_at) : undefined,
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

        Logger.stats('FeishuTaskApi', `Fetched ${allRawTasks.length} tasks from "${tasklistName}"`);

        return tasksWithListInfo;
    }

    /**
     * 获取所有任务（通过任务清单获取）
     */
    static async getAllTasks(
        accessToken: string,
        fetchFn?: FetchFunction
    ): Promise<FeishuTask[]> {
        Logger.info('FeishuTaskApi', 'Starting to fetch all tasks via task lists');

        const taskLists = await this.getAllTaskLists(accessToken, fetchFn);

        if (taskLists.length === 0) {
            Logger.warn('FeishuTaskApi', 'No task lists found');
            return [];
        }

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
