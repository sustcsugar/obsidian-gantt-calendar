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

		// 检查是否启用了任何同步源
		if (!config.enabledSources?.api && !config.enabledSources?.caldav) {
			Logger.info('SyncManagerBridge', 'No sync sources enabled');
			return;
		}

		try {
			this.syncManager = createSyncManager(config);

			if (this.syncManager) {
				Logger.info('SyncManagerBridge', 'Sync manager initialized');

				// 如果启用了自动同步，启动定时同步
				if (config.syncInterval > 0) {
					this.startAutoSync(config.syncInterval);
				}
			}
		} catch (error) {
			Logger.error('SyncManagerBridge', 'Failed to initialize sync manager', error);
		}
	}

	/**
	 * 更新配置（当设置变化时调用）
	 */
	async updateConfiguration(config?: SyncConfiguration): Promise<void> {
		if (!config) {
			this.destroy();
			return;
		}

		// 检查是否需要重新初始化
		const hasEnabledSources = config.enabledSources?.api || config.enabledSources?.caldav;

		if (!hasEnabledSources && this.syncManager) {
			this.destroy();
			Logger.info('SyncManagerBridge', 'Sync manager destroyed (no enabled sources)');
		} else if (!this.syncManager && hasEnabledSources) {
			this.initialize(config);
		} else if (this.syncManager) {
			// 更新现有配置
			this.syncManager.updateConfiguration(config);
			this.stopAutoSync();
			if (config.syncInterval > 0) {
				this.startAutoSync(config.syncInterval);
			}
		}
	}

	/**
	 * 启动自动同步
	 */
	private startAutoSync(intervalMinutes: number): void {
		// 清除现有定时器
		this.stopAutoSync();

		const intervalMs = intervalMinutes * 60 * 1000;

		this.autoSyncTimer = window.setInterval(async () => {
			Logger.info('SyncManagerBridge', 'Running auto sync...');
			await syncFeishuTasks(this.plugin, { isAutoSync: true });
		}, intervalMs);

		Logger.info('SyncManagerBridge', `Auto sync started (interval: ${intervalMinutes} minutes)`);
	}

	/**
	 * 停止自动同步
	 */
	private stopAutoSync(): void {
		if (this.autoSyncTimer) {
			clearInterval(this.autoSyncTimer);
			this.autoSyncTimer = undefined;
			Logger.info('SyncManagerBridge', 'Auto sync stopped');
		}
	}

	/**
	 * 销毁同步管理器
	 */
	destroy(): void {
		this.stopAutoSync();
		if (this.syncManager) {
			this.syncManager.destroy();
			this.syncManager = null;
		}
	}
}
