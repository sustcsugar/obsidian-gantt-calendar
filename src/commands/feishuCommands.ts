/**
 * 飞书相关命令
 *
 * 提供从飞书获取任务等功能的命令
 */

import { Notice, requestUrl } from 'obsidian';
import type GanttCalendarPlugin from '../../main';
import { FeishuHttpClient } from '../data-layer/sources/api/providers/feishu/FeishuHttpClient';
import { FeishuTaskApi } from '../data-layer/sources/api/providers/feishu/FeishuTaskApi';
import { FeishuTaskStorage } from '../data-layer/sources/api/providers/FeishuTaskStorage';
import { Logger } from '../utils/logger';

/**
 * 注册飞书相关命令
 * @param plugin 插件实例
 */
export function registerFeishuCommands(plugin: GanttCalendarPlugin): void {
    // 从飞书获取任务命令
    plugin.addCommand({
        id: 'fetch-feishu-tasks',
        name: '从飞书获取任务',
        callback: async () => {
            await fetchFeishuTasks(plugin);
        }
    });
}

/**
 * 从飞书获取任务并存储到Markdown文件
 * @param plugin 插件实例
 */
async function fetchFeishuTasks(plugin: GanttCalendarPlugin): Promise<void> {
    try {
        new Notice('正在从飞书获取任务...');

        // 获取同步配置中的访问令牌
        const syncConfig = plugin.settings.syncConfiguration;
        const apiConfig = syncConfig?.api;

        if (!apiConfig?.accessToken) {
            new Notice('请先完成飞书授权');
            Logger.warn('FeishuCommands', 'No access token found');
            return;
        }

        // 检查令牌是否过期
        const tokenExpireAt = apiConfig.tokenExpireAt;
        if (tokenExpireAt && Date.now() > tokenExpireAt) {
            new Notice('访问令牌已过期，请重新授权');
            Logger.warn('FeishuCommands', 'Access token expired');
            return;
        }

        // 创建兼容Obsidian的fetch函数
        const requestFetch = FeishuHttpClient.createRequestFetch(requestUrl);

        // 获取所有任务
        Logger.info('FeishuCommands', 'Fetching tasks from Feishu');
        const tasks = await FeishuTaskApi.getAllTasks(apiConfig.accessToken, requestFetch);

        if (tasks.length === 0) {
            new Notice('未获取到任何任务');
            Logger.info('FeishuCommands', 'No tasks found');
            return;
        }

        // 存储任务到Markdown文件
        const result = await FeishuTaskStorage.saveTasks(plugin.app, tasks, {
            fileName: '飞书任务',
            overwrite: true,
        });

        new Notice(`成功获取 ${tasks.length} 个任务，已保存到 ${result.file?.path}`);

        Logger.info('FeishuCommands', `Successfully fetched ${tasks.length} tasks`);

        // 尝试打开任务文件
        const taskFile = plugin.app.vault.getAbstractFileByPath('/飞书任务.md');
        if (taskFile) {
            await plugin.app.workspace.openLinkText(taskFile.path, '/', false);
        }

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        Logger.error('FeishuCommands', 'Failed to fetch tasks', error);
        new Notice(`获取任务失败: ${errorMsg}`);
    }
}
