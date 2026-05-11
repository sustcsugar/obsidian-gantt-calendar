import { App, Plugin, Notice, setIcon } from 'obsidian';
import { GCMainView, GC_VIEW_ID } from './src/GCMainView';
import { GCSidebarView, GC_SIDEBAR_VIEW_ID } from './src/GCSidebarView';
import { GanttCalendarSettingTab } from './src/settings';
import type { GanttCalendarSettings } from './src/settings/types';
import { TaskStore } from './src/TaskStore';
import { registerAllCommands } from './src/commands/commandsIndex';
import { TooltipManager } from './src/utils/tooltipManager';
import { Logger } from './src/utils/logger';
import { setTimezoneOffset } from './src/dateUtils/timezone';

import { SettingsManager } from './src/managers/SettingsManager';
import { ThemeManager } from './src/managers/ThemeManager';
import { ViewManager, activateSidebarView } from './src/managers/ViewManager';
import { SyncManagerBridge } from './src/managers/SyncManagerBridge';
import { DailyNoteIndex } from './src/utils/dailyNoteSettingsBridge';

export default class GanttCalendarPlugin extends Plugin {
	settings: GanttCalendarSettings;
	taskCache: TaskStore;
	dailyNoteIndex: DailyNoteIndex;

	private settingsManager: SettingsManager;
	private themeManager: ThemeManager;
	private viewManager: ViewManager;
	private syncManagerBridge: SyncManagerBridge;

	// 状态栏：独立的图标和文字元素，互不覆盖
	private statusBarItemEl: HTMLElement;
	private statusBarIcon: HTMLElement;
	private statusBarText: HTMLElement;
	private syncStatusText = '';
	private lastSyncTime = '';

	async onload() {
		this.settingsManager = new SettingsManager(this);
		this.settings = await this.settingsManager.loadSettings();

		Logger.init(this);
		setTimezoneOffset(this.settings.timezoneOffset);

		this.taskCache = new TaskStore(this.app);
		this.scheduleTaskCacheInit();

		this.dailyNoteIndex = new DailyNoteIndex(this.app);
		this.dailyNoteIndex.initialize();

		this.viewManager = new ViewManager(this.app);

		this.themeManager = new ThemeManager();
		this.themeManager.initialize(() => this.viewManager?.refreshAllViews());

		this.registerView(GC_VIEW_ID, (leaf) => new GCMainView(leaf, this));
		this.registerView(GC_SIDEBAR_VIEW_ID, (leaf) => new GCSidebarView(leaf, this));

		this.registerUIElements();

		registerAllCommands(this);

		this.addSettingTab(new GanttCalendarSettingTab(this.app, this));

		this.syncManagerBridge = new SyncManagerBridge(this);
		this.syncManagerBridge.initialize(this.settings.syncConfiguration);

		// 启动时自动打开侧边栏
		this.app.workspace.onLayoutReady(() => {
			activateSidebarView(this.app);
		});
	}

	onunload() {
		this.syncManagerBridge?.destroy();
		this.dailyNoteIndex?.destroy();
		this.themeManager?.destroy();
		this.taskCache?.clear();
		TooltipManager.reset();
		this.app.workspace.getLeavesOfType(GC_VIEW_ID).forEach(leaf => leaf.detach());
		this.app.workspace.getLeavesOfType(GC_SIDEBAR_VIEW_ID).forEach(leaf => leaf.detach());
	}

	// ===== 公共方法 =====

	async saveSettings(): Promise<void> {
		await this.settingsManager.saveSettings(this.settings);
		if (this.taskCache) {
			await this.taskCache.updateSettings(
				this.settings.globalTaskFilter,
				this.settings.enabledTaskFormats
			);
		}
		if (this.syncManagerBridge) {
			await this.syncManagerBridge.updateConfiguration(this.settings.syncConfiguration);
		}
	}

	async activateView(): Promise<void> {
		return this.viewManager.activateView();
	}

	refreshCalendarViews(): void {
		this.viewManager.refreshAllViews();
	}

	// ===== 状态栏 =====

	setSyncStatus(text: string): void {
		this.syncStatusText = text;
		if (text.includes('\u2705') || text.includes('\u274C')) {
			this.lastSyncTime = new Date().toISOString();
		}
		Logger.info('StatusBar', 'setSyncStatus: ' + text);
		this.renderStatusBar();
	}

	clearSyncStatus(): void {
		this.syncStatusText = '';
		this.renderStatusBar();
	}

	// ===== 私有方法 =====

	private async loadLastSyncTime(): Promise<void> {
		try {
			const path = '.feishu-sync-state.json';
			if (await this.app.vault.adapter.exists(path)) {
				const raw = await this.app.vault.adapter.read(path);
				const data = JSON.parse(raw);
				const times = Object.values(data) as Array<{ lastSyncAt?: string }>;
				const latest = times
					.map(r => r.lastSyncAt || '')
					.filter(t => t)
					.sort()
					.pop();
				if (latest) {
					this.lastSyncTime = latest;
				}
			}
		} catch {
			// ignore
		}
		this.renderStatusBar();
	}

	private formatLastSync(): string {
		if (!this.lastSyncTime) return '\u2014 \u672A\u540C\u6B65';
		const d = new Date(this.lastSyncTime);
		const now = new Date();
		const pad = (n: number) => String(n).padStart(2, '0');
		const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

		if (d.toDateString() === now.toDateString()) return `\u540C\u6B65 ${hhmm}`;

		const yesterday = new Date(now);
		yesterday.setDate(yesterday.getDate() - 1);
		if (d.toDateString() === yesterday.toDateString()) return `\u6628\u65E5 ${hhmm}`;

		return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hhmm}`;
	}

	private scheduleTaskCacheInit(): void {
		this.app.workspace.onLayoutReady(() => {
			setTimeout(() => {
				this.taskCache.initialize(
					this.settings.globalTaskFilter,
					this.settings.enabledTaskFormats
				).then(async () => {
					Logger.stats('Main', 'Task cache initialized');
					this.refreshCalendarViews();
					await this.loadLastSyncTime();
				}).catch(error => {
					Logger.error('Main', 'Failed to initialize task cache:', error);
					new Notice('\u4EFB\u52A1\u7F13\u5B58\u521D\u59CB\u5316\u5931\u8D25');
				});
			}, 800);
		});
	}

	private registerUIElements(): void {
		const ribbonIconEl = this.addRibbonIcon('goal', '\u7518\u7279\u65E5\u5386', () => {
			this.activateView();
		});
		ribbonIconEl.addClass('gantt-calendar-ribbon');

		// 状态栏：图标和文字用独立子元素，更新时互不干扰
		this.statusBarItemEl = this.addStatusBarItem();
		this.statusBarIcon = this.statusBarItemEl.createSpan({ cls: 'gc-status-bar-icon' });
		setIcon(this.statusBarIcon, 'goal');
		this.statusBarText = this.statusBarItemEl.createSpan();
		this.statusBarText.setText('...');

		if (this.taskCache) {
			this.taskCache.onUpdate(() => this.renderStatusBar());
		}
	}

	private renderStatusBar(): void {
		if (!this.statusBarText || !this.taskCache) return;

		const tasks = this.taskCache.getAllTasks();
		const total = tasks.length;
		const incomplete = tasks.filter(t => !t.completed).length;
		const lastSync = this.formatLastSync();
		const syncStatus = this.syncStatusText || '就绪';

		// 始终并列显示：任务统计 | 同步时间 | 同步状态
		this.statusBarText.setText(` ${incomplete}/${total} | ${lastSync} | ${syncStatus}`);
	}
}
