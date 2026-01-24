import { App, Plugin, TFile, Notice } from 'obsidian';
import { GCMainView, GC_VIEW_ID } from './src/GCMainView';
import { GanttCalendarSettings, DEFAULT_SETTINGS, GanttCalendarSettingTab } from './src/settings';
import { TaskStore } from './src/TaskStore';
import { registerAllCommands } from './src/commands/commandsIndex';
import { TooltipManager } from './src/utils/tooltipManager';
import { Logger } from './src/utils/logger';
import { TaskStatus, ThemeColors } from './src/tasks/taskStatus';
import { SyncManager } from './src/data-layer/sync/syncManager';
import { createSyncManager } from './src/data-layer/sync/syncFactory';

export default class GanttCalendarPlugin extends Plugin {
    settings: GanttCalendarSettings;
    taskCache: TaskStore;
    private themeChangeUnregister?: () => void;
    syncManager?: SyncManager | null;

    async onload() {
        await this.loadSettings();

        // Initialize logger
        Logger.init(this);

        // 监听主题变化，刷新视图以应用正确的颜色
        this.registerThemeObserver();

        // Initialize task store
        this.taskCache = new TaskStore(this.app);

        // 不阻塞 onload：布局就绪后再延迟触发首次扫描
        this.app.workspace.onLayoutReady(() => {
            setTimeout(() => {
                        this.taskCache.initialize(this.settings.globalTaskFilter, this.settings.enabledTaskFormats)
                    .then(() => {
                        Logger.stats('Main', 'Task cache initialized');
                        // Refresh all views after cache is ready
                        this.refreshCalendarViews();
                    })
                    .catch(error => {
                        Logger.error('Main', 'Failed to initialize task cache:', error);
                        new Notice('任务缓存初始化失败');
                    });
            }, 800);  // 布局就绪后再延迟 800ms，避免 vault 未就绪
        });

        // Register the calendar view
        this.registerView(GC_VIEW_ID, (leaf) => new GCMainView(leaf, this));

        // This creates an icon in the left ribbon.
        const ribbonIconEl = this.addRibbonIcon('calendar-days', '甘特日历', (evt: MouseEvent) => {
            // Open calendar view in a new leaf in main editor
            this.activateView();
        });
        ribbonIconEl.addClass('gantt-calendar-ribbon');

        // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
        const statusBarItemEl = this.addStatusBarItem();
        statusBarItemEl.setText(`${this.manifest.name} v${this.manifest.version}`);

        // Register all commands
        registerAllCommands(this);

        // This adds a settings tab so the user can configure various aspects of the plugin
        this.addSettingTab(new GanttCalendarSettingTab(this.app, this));

        // Initialize sync manager if configured
        this.initializeSyncManager();
    }

    onunload() {
        // 取消主题监听器
        if (this.themeChangeUnregister) {
            this.themeChangeUnregister();
        }

        // Clear tooltip manager
        TooltipManager.reset();

        // Clear task cache
        if (this.taskCache) {
            this.taskCache.clear();
        }

        // Destroy sync manager
        if (this.syncManager) {
            this.syncManager.destroy();
            this.syncManager = null;
        }

        this.app.workspace.getLeavesOfType(GC_VIEW_ID).forEach(leaf => leaf.detach());
    }

    async activateView() {
        const { workspace } = this.app;

        let leaf = workspace.getLeavesOfType(GC_VIEW_ID)[0];
        if (!leaf) {
            // Create new leaf in main area
            leaf = workspace.getLeaf('tab');
            await leaf.setViewState({
                type: GC_VIEW_ID,
                active: true,
            });
        }

        workspace.revealLeaf(leaf);
    }


    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

        // 迁移旧的颜色格式到新的主题分离格式
        await this.migrateTaskStatusColors();

        this.updateCSSVariables();
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.updateCSSVariables();

        // Update task cache if settings changed
        if (this.taskCache) {
            await this.taskCache.updateSettings(
                this.settings.globalTaskFilter,
                this.settings.enabledTaskFormats
            );
        }

        // Reinitialize sync manager if sync configuration changed
        await this.reinitializeSyncIfNeeded();
    }

    private updateCSSVariables() {
        document.documentElement.style.setProperty('--festival-solar-color', this.settings.solarFestivalColor);
        document.documentElement.style.setProperty('--festival-lunar-color', this.settings.lunarFestivalColor);
        document.documentElement.style.setProperty('--festival-solar-term-color', this.settings.solarTermColor);
    }

    refreshCalendarViews() {
        const leaves = this.app.workspace.getLeavesOfType(GC_VIEW_ID);
        leaves.forEach(leaf => {
            const view = leaf.view as unknown as GCMainView;
            if (view && view.refreshSettings) {
                view.refreshSettings();
            }
        });
    }

    /**
     * 迁移任务状态颜色格式
     * 将旧的 backgroundColor/textColor 迁移到 lightColors/darkColors
     * 确保所有状态都有完整的主题颜色配置
     */
    private async migrateTaskStatusColors(): Promise<void> {
        let needsSave = false;

        for (const status of this.settings.taskStatuses) {
            // 检查是否需要迁移或初始化
            const needsMigration = (status.backgroundColor || status.textColor) &&
                (!status.lightColors || !status.darkColors);
            const needsInitialization = !status.lightColors || !status.darkColors;

            if (needsMigration) {
                // 将旧颜色作为亮色主题的默认值
                if (!status.lightColors) {
                    status.lightColors = {
                        backgroundColor: status.backgroundColor || '#FFFFFF',
                        textColor: status.textColor || '#333333'
                    };
                }

                // 为暗色主题生成默认值
                if (!status.darkColors) {
                    status.darkColors = this.generateDarkThemeColors(
                        status.lightColors.backgroundColor,
                        status.lightColors.textColor
                    );
                }

                needsSave = true;
            } else if (needsInitialization) {
                // 对于没有颜色配置的状态，初始化为默认值
                // 这确保了即使状态数据不完整，也能有可用的颜色
                if (!status.lightColors) {
                    status.lightColors = {
                        backgroundColor: '#FFFFFF',
                        textColor: '#333333'
                    };
                }

                if (!status.darkColors) {
                    status.darkColors = {
                        backgroundColor: '#2d333b',
                        textColor: '#adbac7'
                    };
                }

                needsSave = true;
            }
        }

        if (needsSave) {
            await this.saveData(this.settings);
        }
    }

    /**
     * 根据亮色主题颜色生成暗色主题颜色
     */
    private generateDarkThemeColors(lightBg: string, lightText: string): ThemeColors {
        // 简单的颜色反转逻辑
        // 对于大多数情况，使用预设的暗色主题默认值
        return {
            backgroundColor: '#2d333b',
            textColor: '#adbac7'
        };
    }

    /**
     * 注册主题变化监听器
     * 当用户切换主题时，刷新所有视图以应用正确的颜色
     */
    private registerThemeObserver(): void {
        // 使用 MutationObserver 监听 body classList 变化
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    // 主题切换时刷新所有视图
                    this.refreshCalendarViews();
                    break;
                }
            }
        });

        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['class']
        });

        // 保存取消监听的函数
        this.themeChangeUnregister = () => observer.disconnect();
    }

    /**
     * 初始化同步管理器
     */
    private initializeSyncManager(): void {
        const syncConfig = this.settings.syncConfiguration;

        if (!syncConfig) {
            return;
        }

        // 检查是否启用了任何同步源
        if (!syncConfig.enabledSources?.api && !syncConfig.enabledSources?.caldav) {
            Logger.info('Main', 'No sync sources enabled');
            return;
        }

        try {
            this.syncManager = createSyncManager(syncConfig);

            if (this.syncManager) {
				Logger.info('Main', 'Sync manager initialized');

				// 注册同步命令
				this.registerSyncCommands();

				// 如果启用了自动同步，启动定时同步
				if (syncConfig.syncInterval > 0) {
					this.startAutoSync();
				}
			}
        } catch (error) {
            Logger.error('Main', 'Failed to initialize sync manager', error);
        }
    }

	/**
	 * 重新初始化同步管理器（当配置变化时）
	 */
	private async reinitializeSyncIfNeeded(): Promise<void> {
		const syncConfig = this.settings.syncConfiguration;

		if (!syncConfig) {
			if (this.syncManager) {
				this.syncManager.destroy();
				this.syncManager = null;
			}
			return;
		}

		// 检查是否需要重新初始化
		const needsReinit = !syncConfig.enabledSources?.api && !syncConfig.enabledSources?.caldav;

		if (needsReinit && this.syncManager) {
			this.syncManager.destroy();
			this.syncManager = null;
			Logger.info('Main', 'Sync manager destroyed (no enabled sources)');
		} else if (!this.syncManager && (syncConfig.enabledSources?.api || syncConfig.enabledSources?.caldav)) {
			this.initializeSyncManager();
		}
	}

	/**
	 * 注册同步相关命令
	 */
	private registerSyncCommands(): void {
		// 手动同步命令
		this.addCommand({
			id: 'sync-now',
			name: '立即同步',
			callback: async () => {
				await this.runManualSync();
			}
		});
	}

	/**
	 * 执行手动同步
	 */
	async runManualSync(): Promise<void> {
		if (!this.syncManager) {
			new Notice('同步功能未启用，请在设置中配置同步源');
			return;
		}

		new Notice('开始同步...');

		try {
			const result = await this.syncManager.sync();

			if (result.success) {
				const stats = result.stats;
				let message = `同步完成！`;

				if (stats.created > 0) message += ` 新建: ${stats.created}`;
				if (stats.updated > 0) message += ` 更新: ${stats.updated}`;
				if (stats.deleted > 0) message += ` 删除: ${stats.deleted}`;
				if (stats.conflicts > 0) message += ` 冲突: ${stats.conflicts}`;

				new Notice(message);

				// 刷新视图
				this.refreshCalendarViews();
			} else {
				new Notice('同步失败，请查看控制台日志');
				if (result.errors && result.errors.length > 0) {
					Logger.error('Main', 'Sync errors:', result.errors);
				}
			}
		} catch (error) {
			Logger.error('Main', 'Sync error:', error);
			new Notice(`同步出错: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * 启动自动同步
	 */
	private startAutoSync(): void {
		const syncInterval = this.settings.syncConfiguration?.syncInterval || 0;

		if (syncInterval <= 0 || !this.syncManager) {
			return;
		}

		// 清除现有定时器
		this.stopAutoSync();

		const intervalMs = syncInterval * 60 * 1000;

		// 使用 Obsidian 的 registerInterval 来管理定时器
		this.syncManager.autoSyncTimer = window.setInterval(async () => {
			Logger.info('Main', 'Running auto sync...');
			await this.runManualSync();
		}, intervalMs);

		Logger.info('Main', `Auto sync started (interval: ${syncInterval} minutes)`);
	}

	/**
	 * 停止自动同步
	 */
	private stopAutoSync(): void {
		if (this.syncManager && this.syncManager.autoSyncTimer) {
			clearInterval(this.syncManager.autoSyncTimer);
			this.syncManager.autoSyncTimer = undefined;
			Logger.info('Main', 'Auto sync stopped');
		}
	}

    // 仅保留日历视图刷新（任务子模式包含在 CalendarView 内）
}
