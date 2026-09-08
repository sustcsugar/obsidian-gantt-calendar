import { Plugin, Notice, Platform, setIcon } from 'obsidian';
import { GCMainView, GC_VIEW_ID } from './src/GCMainView';
import { GCSidebarView, GC_SIDEBAR_VIEW_ID } from './src/GCSidebarView';
import { GanttCalendarSettingTab } from './src/settings';
import type { GanttCalendarSettings } from './src/settings/types';
import { TaskStore } from './src/TaskStore';
import { registerAllCommands } from './src/commands/commandsIndex';
import { TooltipManager } from './src/utils/tooltipManager';
import { Logger } from './src/utils/logger';
import { setTimezoneOffset } from './src/dateUtils/timezone';
import { i18n, initializeI18n, setLanguage, isChineseLanguage } from './src/i18n/i18n';
import { refreshPresetStatusNames } from './src/tasks/taskStatus';

import { SettingsManager } from './src/managers/SettingsManager';
import { ThemeManager } from './src/managers/ThemeManager';
import { ViewManager, activateSidebarView } from './src/managers/ViewManager';
import { SyncManagerBridge } from './src/managers/SyncManagerBridge';
import { DailyNoteIndex } from './src/utils/dailyNoteSettingsBridge';
import { initModalHost, destroyModalHost } from './src/ui/modals/modalHost';
import { useCalendarStore } from './src/ui/store/calendarStore';

/** 视图筛选变更写回 data.json 的防抖间隔（点击级频率，无需即时时效） */
const VIEW_FILTERS_SAVE_DEBOUNCE_MS = 800;

export default class GanttCalendarPlugin extends Plugin {
	settings: GanttCalendarSettings;
	taskCache: TaskStore;
	/** taskCache 初始化延迟句柄，onunload 时取消 */
	private initTimeout: number | null = null;
	/** store 订阅退订句柄，onunload 时取消 */
	private viewFiltersUnsubscribe: (() => void) | null = null;
	/** 视图筛选写回防抖句柄，onunload 时冲刷 */
	private viewFiltersSaveTimer: number | null = null;
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
		await initializeI18n();

		this.settingsManager = new SettingsManager(this);
		this.settings = await this.settingsManager.loadSettings();

		// 视图筛选偏好：从 data.json 水合进 store（先水合后订阅，
		// 避免水合触发的首次 set 被当成变更写回）；
		// 后续筛选变更经订阅防抖写回 data.json
		useCalendarStore.getState().hydrateViewFilters(this.settings.viewFilters);
		this.viewFiltersUnsubscribe = useCalendarStore.subscribe((state, prev) => {
			if (state.viewFilters === prev.viewFilters) return;
			this.settings.viewFilters = state.viewFilters;
			this.scheduleViewFiltersSave();
		});

		// 应用用户设置的语言（覆盖系统检测）
		if (this.settings.language && this.settings.language !== 'system') {
			setLanguage(this.settings.language);
		}
		// 刷新预设状态名称以匹配当前语言
		refreshPresetStatusNames(this.settings.taskStatuses);
		// 英文模式下自动关闭农历显示
		this.settings.showLunar = isChineseLanguage();

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

		// 全局 React Modal 宿主（设置面板等非 React 环境也需打开 React 模态框）
		initModalHost();

		// 启动时自动打开侧边栏
		this.app.workspace.onLayoutReady(() => {
			void activateSidebarView(this.app);
		});
	}

	onunload() {
		// 取消尚未触发的初始化，防止卸载后对已销毁对象调用 initialize
		if (this.initTimeout !== null) {
			window.clearTimeout(this.initTimeout);
			this.initTimeout = null;
		}
		// 退订筛选 store，冲刷未落盘的筛选变更
		if (this.viewFiltersUnsubscribe) {
			this.viewFiltersUnsubscribe();
			this.viewFiltersUnsubscribe = null;
		}
		if (this.viewFiltersSaveTimer !== null) {
			window.clearTimeout(this.viewFiltersSaveTimer);
			this.viewFiltersSaveTimer = null;
			void this.settingsManager.saveSettings(this.settings);
		}
		this.syncManagerBridge?.destroy();
		this.dailyNoteIndex?.destroy();
		this.themeManager?.destroy();
		this.taskCache?.clear();
		TooltipManager.reset();
		destroyModalHost();
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

	/**
	 * 视图筛选变更防抖写回 data.json（只走 SettingsManager.saveData 落盘，
	 * 不经 saveSettings 的 taskCache/syncManager 重配置副作用）
	 */
	private scheduleViewFiltersSave(): void {
		if (this.viewFiltersSaveTimer !== null) {
			window.clearTimeout(this.viewFiltersSaveTimer);
		}
		this.viewFiltersSaveTimer = window.setTimeout(() => {
			this.viewFiltersSaveTimer = null;
			void this.settingsManager.saveSettings(this.settings);
		}, VIEW_FILTERS_SAVE_DEBOUNCE_MS);
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
				const data = JSON.parse(raw) as Record<string, { lastSyncAt?: string }>;
				const times = Object.values(data);
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
		const pad = (n: number) => String(n).padStart(2, '0');
		if (!this.lastSyncTime) return `— ${i18n.t('common.notSynced')}`;
		const d = new Date(this.lastSyncTime);
		const now = new Date();
		const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

		if (d.toDateString() === now.toDateString()) return i18n.t('common.syncedAt', { time: hhmm });

		const yesterday = new Date(now);
		yesterday.setDate(yesterday.getDate() - 1);
		if (d.toDateString() === yesterday.toDateString()) return i18n.t('common.syncedYesterdayAt', { time: hhmm });

		return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hhmm}`;
	}

	private scheduleTaskCacheInit(): void {
		// onLayoutReady 即 vault/metadataCache 就绪信号，无需额外固定延迟。
		// 视图通过 taskCache.whenReady() 等待扫描完成（取代此前的 800ms
		// 魔法延迟 + 空首屏等待事件回流的做法）。
		// initTimeout 保存句柄：插件卸载时取消，防止对已销毁对象调用 initialize
		this.app.workspace.onLayoutReady(() => {
			this.initTimeout = window.setTimeout(() => {
				this.initTimeout = null;
				this.taskCache.initialize(
					this.settings.globalTaskFilter,
					this.settings.enabledTaskFormats
				).then(async () => {
					Logger.stats('Main', 'Task cache initialized');
					this.refreshCalendarViews();
					await this.loadLastSyncTime();
				}).catch(error => {
					Logger.error('Main', 'Failed to initialize task cache:', error);
					new Notice('任务缓存初始化失败');
				});
			}, 0);
		});
	}

	private registerUIElements(): void {
		const ribbonIconEl = this.addRibbonIcon('goal', '\u7518\u7279\u65E5\u5386', () => {
			void this.activateView();
		});
		ribbonIconEl.addClass('gantt-calendar-ribbon');

		// 状态栏：图标和文字用独立子元素，更新时互不干扰。
		// 移动端无可见状态栏，不注册（同步状态经 Notice 与视图内呈现）
		if (Platform.isMobile) return;

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
		const syncStatus = this.syncStatusText || i18n.t('common.ready');

		// 始终并列显示：任务统计 | 同步时间 | 同步状态
		this.statusBarText.setText(` ${incomplete}/${total} | ${lastSync} | ${syncStatus}`);
	}
}
