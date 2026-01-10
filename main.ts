import { App, Plugin, TFile, Notice } from 'obsidian';
import { GCMainView, GC_VIEW_ID } from './src/GCMainView';
import { GanttCalendarSettings, DEFAULT_SETTINGS, GanttCalendarSettingTab } from './src/settings';
import { TaskStore } from './src/TaskStore';
import { registerAllCommands } from './src/commands/commandsIndex';
import { TooltipManager } from './src/utils/tooltipManager';
import { Logger } from './src/utils/logger';

export default class GanttCalendarPlugin extends Plugin {
    settings: GanttCalendarSettings;
    taskCache: TaskStore;

    async onload() {
        await this.loadSettings();

        // Initialize logger
        Logger.init(this);

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

        // 文件变化监听器已迁移到 MarkdownDataSource 内部处理
        // 不再需要在这里手动注册监听器

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
    }

    onunload() {
        // Clear tooltip manager
        TooltipManager.reset();

        // Clear task cache
        if (this.taskCache) {
            this.taskCache.clear();
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

    // 仅保留日历视图刷新（任务子模式包含在 CalendarView 内）
}
