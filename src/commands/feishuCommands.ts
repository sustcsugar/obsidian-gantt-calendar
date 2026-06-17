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
import { i18n } from '../i18n/i18n';

/**
 * 注册飞书相关命令
 */
export function registerFeishuCommands(plugin: GanttCalendarPlugin): void {
    plugin.addCommand({
        id: 'feishu-sync-tasks',
        name: i18n.t('commands.feishuSync'),
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
export async function syncFeishuTasks(plugin: GanttCalendarPlugin, options?: { isAutoSync?: boolean }): Promise<void> {
	const isAutoSync = options?.isAutoSync ?? false;
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
			new Notice(i18n.t('commands.sync.authRequired'));
			return;
		}

		const clientId = apiConfig.clientId || apiConfig.appId;
		const clientSecret = apiConfig.clientSecret || apiConfig.appSecret;

		if (!clientId || !clientSecret) {
			new Notice(i18n.t('commands.sync.configRequired'));
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
			new Notice(i18n.t('commands.sync.authExpired'), 8000);
			return;
		}

		// 授权有效，开始同步流程
		plugin.setSyncStatus(i18n.t('commands.sync.syncing'));
		const controller = new AbortController();
		const progressNotice = new Notice(i18n.t('commands.sync.syncingFeishu'), 0);
		const stopBtn = progressNotice.messageEl.createEl('button', { text: i18n.t('commands.sync.stopSync') });
		stopBtn.style.cssText = 'margin-left:12px;padding:2px 10px;cursor:pointer;';
		stopBtn.onclick = () => {
			controller.abort();
			stopBtn.disabled = true;
			stopBtn.textContent = i18n.t('commands.sync.stopped');
		};

		const stateManager = new SyncStateManager(plugin.app);
		const syncEngine = new FeishuTaskSync(plugin.app, provider, stateManager, {
			conflictStrategy: syncConfig.conflictResolution as 'newest-win' | 'local-win' | 'remote-win' || 'newest-win',
			targetFile: syncConfig.feishuSyncTargetFile || 'gantt-calendar-feishu-sync.md',
			enabledFormats: (plugin.settings.enabledTaskFormats as ('tasks' | 'dataview')[]) || ['tasks', 'dataview'],
			globalFilter: plugin.settings.globalTaskFilter,
			pushFilter: syncConfig.pushFilter,
			tasklistGuid: apiConfig.tasklistGuid,
			creatorOpenId: apiConfig.userOpenId,
			creatorUserId: apiConfig.userId,
			abortSignal: controller.signal,
			onProgress: (msg: string) => {
				const container = progressNotice.messageEl;
				container.empty();
				container.createEl('span', { text: msg });
				if (!stopBtn.disabled && !controller.signal.aborted) {
					const btn = container.createEl('button', { text: i18n.t('commands.sync.stopSync') });
					btn.setCssStyles({ marginLeft: '12px', padding: '2px 10px', cursor: 'pointer' });
					btn.onclick = () => {
						controller.abort();
						btn.remove();
					};
				}
			},
		});

		const result = await syncEngine.sync();

		progressNotice.hide();

		// 状态栏显示同步结果，10 秒后恢复就绪
		if (result.errors.length > 0) {
			plugin.setSyncStatus(i18n.t('commands.sync.syncFailed'));
		} else {
			const parts_status: string[] = [];
			if (result.pushed > 0) parts_status.push(result.pushed + ' ' + i18n.t('commands.sync.pushed'));
			if (result.pulled > 0) parts_status.push(result.pulled + ' ' + i18n.t('commands.sync.pulled'));
			plugin.setSyncStatus(i18n.t('commands.sync.syncSuccess') + (parts_status.length > 0 ? ' ' + parts_status.join(' ') : ''));
		}
		window.setTimeout(() => plugin.clearSyncStatus(), 10000);

		const parts: string[] = [];
		if (result.pushed > 0) parts.push(i18n.t('commands.sync.pushed') + ' ' + result.pushed);
		if (result.pulled > 0) parts.push(i18n.t('commands.sync.pulled') + ' ' + result.pulled);
		if (result.conflicted > 0) parts.push(i18n.t('commands.sync.conflicted') + ' ' + result.conflicted);
		if (result.skipped > 0) parts.push(i18n.t('commands.sync.skipped') + ' ' + result.skipped);
		const summary = parts.length > 0 ? parts.join(', ') : i18n.t('commands.sync.noChange');

		// 有详细变更记录时展示结果
		if (result.details.length > 0) {
			if (isAutoSync) {
				// 自动同步：每个任务一条 Notice
				new Notice(i18n.t('commands.sync.autoSyncComplete', { summary }), 8000);
				for (let idx = 0; idx < result.details.length; idx++) {
					const detail = result.details[idx];
					const icon = detail.success ? '✅' : '❌';
					let msg = `${idx + 1}/${result.details.length} ${icon} ${detail.label} - ${detail.taskDescription}`;
					if (detail.error) msg += ` (${detail.error})`;
					new Notice(msg, 6000);
				}
			} else {
				showSyncResultModal(plugin.app, i18n.t('commands.sync.feishuSyncComplete', { summary }), result);
			}
		} else if (result.errors.length > 0) {
			new Notice(i18n.t('commands.sync.syncComplete', { summary }) + "\n" + result.errors.join("\n"), 10000);
		} else {
			new Notice(i18n.t('commands.sync.syncComplete', { summary }));
		}
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		new Notice(i18n.t('commands.sync.syncError', { error: errorMsg }));
		plugin.setSyncStatus(i18n.t('commands.sync.syncFailed'));
		window.setTimeout(() => plugin.clearSyncStatus(), 10000);
	}
}
