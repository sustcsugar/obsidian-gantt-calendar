/**
 * 飞书相关命令
 */

import { Notice } from 'obsidian';
import type GanttCalendarPlugin from '../../main';
import { FeishuProvider } from '../data-layer/sources/api/providers/FeishuProvider';
import { FeishuTaskSync } from '../data-layer/feishu-sync/FeishuTaskSync';
import { SyncStateManager } from '../data-layer/feishu-sync/syncState';
import { DEFAULT_PUSH_FILTER } from '../utils/taskFilter';
import { Logger } from '../utils/logger';
import { showSyncResultModal } from '../modals/SyncResultModal';

/**
 * 注册飞书相关命令
 */
export function registerFeishuCommands(plugin: GanttCalendarPlugin): void {
    plugin.addCommand({
        id: 'feishu-sync-tasks',
        name: '飞书任务双向同步',
        callback: async () => {
            await syncFeishuTasks(plugin);
        }
    });
}

/**
 * 执行飞书任务双向同步
 *
 * 与设置面板"立即同步"按钮共用此函数，确保行为一致。
 */
export async function syncFeishuTasks(plugin: GanttCalendarPlugin): Promise<void> {
	try {
		// 读取同步配置（与 SyncSettingsBuilder.getSyncConfiguration 逻辑一致）
		let syncConfig = plugin.settings.syncConfiguration;
		if (!syncConfig) {
			syncConfig = {
				enabledSources: {},
				syncDirection: 'bidirectional',
				syncInterval: 30,
				conflictResolution: 'local-win',
				feishuSyncTargetFile: 'gantt-calendar-feishu-sync.md',
			};
			plugin.settings.syncConfiguration = syncConfig;
		}
		if (!syncConfig.pushFilter) {
			syncConfig.pushFilter = { ...DEFAULT_PUSH_FILTER };
		}
		const apiConfig = syncConfig.api;

		if (!apiConfig?.accessToken) {
			new Notice('请先在设置中完成飞书授权');
			return;
		}

		const clientId = apiConfig.clientId || apiConfig.appId;
		const clientSecret = apiConfig.clientSecret || apiConfig.appSecret;

		if (!clientId || !clientSecret) {
			new Notice('请先配置飞书 App ID 和 App Secret');
			return;
		}

		// 第一步：验证授权有效性（token 过期时尝试刷新，刷新失败则立即提示，不创建任何 UI）
		const provider = new FeishuProvider({
			enabled: true,
			syncDirection: syncConfig.syncDirection,
			autoSync: false,
			syncInterval: 0,
			conflictResolution: syncConfig.conflictResolution,
			api: {
				provider: 'feishu',
				accessToken: apiConfig.accessToken,
				refreshToken: apiConfig.refreshToken,
				tokenExpireAt: apiConfig.tokenExpireAt,
				clientId,
				clientSecret,
				redirectUri: apiConfig.redirectUri,
			},
		});

		// token 刷新后持久化回 settings
		const currentSyncConfig = syncConfig;
		provider.setConfigUpdateCallback(async (data) => {
			const api = currentSyncConfig.api;
			if (api) {
				if (data.accessToken) api.accessToken = data.accessToken;
				if (data.refreshToken) api.refreshToken = data.refreshToken;
				if (data.tokenExpireAt) api.tokenExpireAt = data.tokenExpireAt;
			}
			await plugin.saveSettings();
		});

		try {
			await provider.validateAuth();
		} catch (authError) {
			new Notice('飞书授权已失效，请重新授权', 8000);
			return;
		}

		// 授权有效，开始同步流程
		plugin.setSyncStatus('🔄 同步中...');
		const controller = new AbortController();
		const progressNotice = new Notice('🔄 正在同步飞书任务...', 0);
		const stopBtn = progressNotice.noticeEl.createEl('button', { text: '停止同步' });
		stopBtn.style.cssText = 'margin-left:12px;padding:2px 10px;cursor:pointer;';
		stopBtn.onclick = () => {
			controller.abort();
			stopBtn.disabled = true;
			stopBtn.textContent = '已停止';
		};

		const stateManager = new SyncStateManager(plugin.app);
		const syncEngine = new FeishuTaskSync(plugin.app, provider, stateManager, {
			conflictStrategy: syncConfig.conflictResolution as 'newest-win' | 'local-win' | 'remote-win' || 'newest-win',
			targetFile: syncConfig.feishuSyncTargetFile || 'gantt-calendar-feishu-sync.md',
			enabledFormats: (plugin.settings.enabledTaskFormats as ('tasks' | 'dataview')[]) || ['tasks', 'dataview'],
			globalFilter: plugin.settings.globalTaskFilter,
			pushFilter: syncConfig.pushFilter as any,
			tasklistGuid: apiConfig.tasklistGuid,
			creatorOpenId: apiConfig.userOpenId,
			creatorUserId: apiConfig.userId,
			abortSignal: controller.signal,
			onProgress: (msg: string) => {
				const btnHtml = stopBtn.disabled ? '' : '<button style="margin-left:12px;padding:2px 10px;cursor:pointer;" onclick="this.previousElementSibling?.click()">停止同步</button>';
				progressNotice.noticeEl.innerHTML = '<span>' + msg + '</span>' + btnHtml;
				const newBtn = progressNotice.noticeEl.querySelector('button');
				if (newBtn && !controller.signal.aborted) {
					newBtn.onclick = () => {
						controller.abort();
						newBtn.remove();
					};
				}
			},
		});

		const result = await syncEngine.sync();

		progressNotice.hide();

		// 状态栏显示同步结果，10 秒后恢复就绪
		if (result.errors.length > 0) {
			plugin.setSyncStatus('❌ 同步失败');
		} else {
			const parts_status: string[] = [];
			if (result.pushed > 0) parts_status.push(result.pushed + ' 推送');
			if (result.pulled > 0) parts_status.push(result.pulled + ' 拉取');
			plugin.setSyncStatus('✅ 已同步' + (parts_status.length > 0 ? ' ' + parts_status.join(' ') : ''));
		}
		setTimeout(() => plugin.clearSyncStatus(), 10000);

		const parts: string[] = [];
		if (result.pushed > 0) parts.push('推送 ' + result.pushed + ' 个');
		if (result.pulled > 0) parts.push('拉取 ' + result.pulled + ' 个');
		if (result.conflicted > 0) parts.push('冲突 ' + result.conflicted + ' 个');
		if (result.skipped > 0) parts.push('跳过 ' + result.skipped + ' 个');
		const summary = parts.length > 0 ? parts.join('，') : '无变更';

		// 有详细变更记录时弹出详细结果弹窗
		if (result.details.length > 0) {
			showSyncResultModal(plugin.app, '飞书同步完成: ' + summary, result);
		} else if (result.errors.length > 0) {
			new Notice("同步完成: " + summary + "\n" + result.errors.join("\n"), 10000);
		} else {
			new Notice('同步完成: ' + summary);
		}
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		new Notice('同步出错: ' + errorMsg);
		plugin.setSyncStatus('❌ 同步失败');
		setTimeout(() => plugin.clearSyncStatus(), 10000);
	}
}
