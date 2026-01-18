import { App, Plugin, TFile, Notice } from 'obsidian';
import { GCMainView, GC_VIEW_ID } from './src/GCMainView';
import { GanttCalendarSettings, DEFAULT_SETTINGS, GanttCalendarSettingTab } from './src/settings';
import { TaskStore } from './src/TaskStore';
import { registerAllCommands } from './src/commands/commandsIndex';
import { TooltipManager } from './src/utils/tooltipManager';
import { Logger } from './src/utils/logger';
import { TaskStatus, ThemeColors } from './src/tasks/taskStatus';

export default class GanttCalendarPlugin extends Plugin {
    settings: GanttCalendarSettings;
    taskCache: TaskStore;
    private themeChangeUnregister?: () => void;

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
     */
    private async migrateTaskStatusColors(): Promise<void> {
        let needsSave = false;

        for (const status of this.settings.taskStatuses) {
            // 如果有旧格式但没有新格式，进行迁移
            if ((status.backgroundColor || status.textColor) &&
                (!status.lightColors || !status.darkColors)) {

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

    // 仅保留日历视图刷新（任务子模式包含在 CalendarView 内）
}
