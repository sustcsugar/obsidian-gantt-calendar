import { App, Plugin, TFile, Notice } from 'obsidian';
import { CalendarView, CALENDAR_VIEW_ID } from './src/CalendarView';
import { GanttCalendarSettings, DEFAULT_SETTINGS, GanttCalendarSettingTab } from './src/settings';
import { TaskCacheManager } from './src/taskManager';
import { registerAllCommands } from './src/commands';

export default class GanttCalendarPlugin extends Plugin {
    settings: GanttCalendarSettings;
    taskCache: TaskCacheManager;

    async onload() {
        await this.loadSettings();

        // Initialize task cache manager
        this.taskCache = new TaskCacheManager(this.app);

        // 不阻塞 onload：布局就绪后再延迟触发首次扫描
        this.app.workspace.onLayoutReady(() => {
            setTimeout(() => {
                        this.taskCache.initialize(this.settings.globalTaskFilter, this.settings.enabledTaskFormats)
                    .then(() => {
                        console.log('[GanttCalendar] Task cache initialized');
                        // Refresh all views after cache is ready
                        this.refreshCalendarViews();
                    })
                    .catch(error => {
                        console.error('[GanttCalendar] Failed to initialize task cache:', error);
                        new Notice('任务缓存初始化失败');
                    });
            }, 800);  // 布局就绪后再延迟 800ms，避免 vault 未就绪
        });

        // Register file change listeners for cache updates
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file instanceof TFile && file.extension === 'md') {
                    this.taskCache.updateFileCache(file);
                }
            })
        );
        
        this.registerEvent(
            this.app.vault.on('delete', (file) => {
                if (file instanceof TFile && file.extension === 'md') {
                    this.taskCache.removeFileCache(file.path);
                }
            })
        );
        
        this.registerEvent(
            this.app.vault.on('rename', (file, oldPath) => {
                if (file instanceof TFile && file.extension === 'md') {
                    this.taskCache.removeFileCache(oldPath);
                    this.taskCache.updateFileCache(file);
                }
            })
        );

        // Listen to metadata changes (faster signal than full file reads)
        this.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                if (file instanceof TFile && file.extension === 'md') {
                    this.taskCache.updateFileCache(file);
                }
            })
        );

        // Register the calendar view
        this.registerView(CALENDAR_VIEW_ID, (leaf) => new CalendarView(leaf, this));

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

        // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
        // Using this function will automatically remove the event listener when this plugin is disabled.
        this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
            console.log('click', evt);
        });

        // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
        this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
    }

    onunload() {
        // Clear task cache
        if (this.taskCache) {
            this.taskCache.clear();
        }
        
        this.app.workspace.getLeavesOfType(CALENDAR_VIEW_ID).forEach(leaf => leaf.detach());
    }

    async activateView() {
        const { workspace } = this.app;

        let leaf = workspace.getLeavesOfType(CALENDAR_VIEW_ID)[0];
        if (!leaf) {
            // Create new leaf in main area
            leaf = workspace.getLeaf('tab');
            await leaf.setViewState({
                type: CALENDAR_VIEW_ID,
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
        const leaves = this.app.workspace.getLeavesOfType(CALENDAR_VIEW_ID);
        leaves.forEach(leaf => {
            const view = leaf.view as unknown as CalendarView;
            if (view && view.refreshSettings) {
                view.refreshSettings();
            }
        });
    }

    // 仅保留日历视图刷新（任务子模式包含在 CalendarView 内）
}
