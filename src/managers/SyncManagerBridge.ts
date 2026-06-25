/**
 * 同步管理器桥接层
 *
 * 负责桥接 SyncManager 和插件，处理命令注册和自动同步
 */

import type GanttCalendarPlugin from '../../main';
import type { SyncConfiguration } from '../data-layer/sync/syncTypes';
import { SyncManager } from '../data-layer/sync/syncManager';
import { createSyncManager } from '../data-layer/sync/syncFactory';
import { syncFeishuTasks } from '../commands/feishuCommands';
import { Logger } from '../utils/logger';

/**
 * 同步管理器桥接层
 */
export class SyncManagerBridge {
	private plugin: GanttCalendarPlugin;
	private syncManager?: SyncManager | null;
	private autoSyncTimer?: number;

	constructor(plugin: GanttCalendarPlugin) {
		this.plugin = plugin;
	}

	/**
	 * 初始化同步管理器
	 */
	initialize(config?: SyncConfiguration): void {
		if (!config) {
			return;
		}

		// 同步源可用性判断：基于实际认证配置而非 enabledSources 开关
		// （enabledSources 开关在 380bf8c 重构中被移除，但检查逻辑未同步更新）
		const hasSyncCapability = this.hasSyncCapability(config);
		if (!hasSyncCapability) {
			return;
		}

		try {
			this.syncManager = createSyncManager(config);

			if (this.syncManager) {
				Logger.info('SyncManagerBridge', 'Sync manager initialized');
			}
		} catch (error) {
			Logger.error('SyncManagerBridge', 'Failed to initialize sync manager', error);
		}

		if (config.syncInterval > 0) {
			this.startAutoSync(config.syncInterval);
		}
	}

	/**
	 * 更新配置（当设置变化时调用）
	 */
	async updateConfiguration(config?: SyncConfiguration): Promise<void> {
		this.stopAutoSync();

		if (!config) {
			this.destroySyncManager();
			return;
		}

		const hasSyncCapability = this.hasSyncCapability(config);

		if (!hasSyncCapability) {
			this.destroySyncManager();
		} else if (!this.syncManager) {
			try {
				this.syncManager = createSyncManager(config);
				if (this.syncManager) {
					Logger.info('SyncManagerBridge', 'Sync manager re-initialized');
				}
			} catch (error) {
				Logger.error('SyncManagerBridge', 'Failed to re-initialize sync manager', error);
			}
		} else {
			this.syncManager.updateConfiguration(config);
		}

		if (config.syncInterval > 0 && hasSyncCapability) {
			this.startAutoSync(config.syncInterval);
		}
	}

	/**
	 * 启动自动同步
	 */
	private startAutoSync(intervalMinutes: number): void {
		this.stopAutoSync();

		const intervalMs = intervalMinutes * 60 * 1000;

		this.autoSyncTimer = window.setInterval(() => {
			Logger.info('SyncManagerBridge', 'Running auto sync...');
			void (async () => {
				try {
					await syncFeishuTasks(this.plugin, { isAutoSync: true });
				} catch (error) {
					Logger.error('SyncManagerBridge', 'Auto sync failed', error);
				}
			})();
		}, intervalMs);

		Logger.info('SyncManagerBridge', `Auto sync started (interval: ${intervalMinutes} minutes)`);
	}

	/**
	 * 停止自动同步
	 */
	private stopAutoSync(): void {
		if (this.autoSyncTimer) {
			window.clearInterval(this.autoSyncTimer);
			this.autoSyncTimer = undefined;
			Logger.info('SyncManagerBridge', 'Auto sync stopped');
		}
	}

	/**
	 * 判断是否具备同步能力
	 *
	 * 兼容旧版 enabledSources 开关（data.json 中可能仍保存了 { api: true }），
	 * 同时支持新版无开关模式：只要配置了 API 认证信息即视为可同步。
	 */
	private hasSyncCapability(config: SyncConfiguration): boolean {
		// 旧版兼容：用户曾通过开关启用过
		if (config.enabledSources?.api || config.enabledSources?.caldav) {
			return true;
		}
		// 新版：有飞书认证配置即视为可同步
		if (config.api?.accessToken && (config.api.clientId || config.api.appId)) {
			return true;
		}
		return false;
	}

	/**
	 * 销毁同步管理器（不含定时器）
	 */
	private destroySyncManager(): void {
		if (this.syncManager) {
			this.syncManager.destroy();
			this.syncManager = null;
		}
	}

	/**
	 * 销毁同步管理器
	 */
	destroy(): void {
		this.stopAutoSync();
		this.destroySyncManager();
	}
}
