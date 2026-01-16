import { ItemView, WorkspaceLeaf, setIcon, Notice } from 'obsidian';
import { CalendarViewType } from './types';
import { getWeekOfDate, formatDate, formatMonth, getTodayDate } from './dateUtils/dateUtilsIndex';
import { solarToLunar, getShortLunarText } from './lunar/lunar';
import { YearViewRenderer } from './views/YearView';
import { MonthViewRenderer } from './views/MonthView';
import { WeekViewRenderer } from './views/WeekView';
import { DayViewRenderer } from './views/DayView';
import { TaskViewRenderer } from './views/TaskView';
import { GanttViewRenderer } from './views/GanttView';
import { Toolbar } from './toolbar/toolbar';
import { Logger } from './utils/logger';

export const GC_VIEW_ID = 'gantt-calendar-view';

export class GCMainView extends ItemView {
	private currentDate: Date = new Date();
	private viewType: CalendarViewType = 'year';
	private resizeObserver: ResizeObserver | null = null;
	private plugin: any;
	private cacheUpdateListener: (() => void) | null = null;

	// 子视图渲染器
	private yearRenderer: YearViewRenderer;
	private monthRenderer: MonthViewRenderer;
	private weekRenderer: WeekViewRenderer;
	private dayRenderer: DayViewRenderer;
	private taskRenderer: TaskViewRenderer;
    private ganttRenderer: GanttViewRenderer;

	// 工具栏控制器
	private toolbar: Toolbar;

	constructor(leaf: WorkspaceLeaf, plugin: any) {
		super(leaf);
		this.plugin = plugin;
		// 使用设置中的默认视图
		this.viewType = plugin.settings.defaultView || 'year';
		// 存储 calendarView 引用到 plugin,供子渲染器访问
		this.plugin.calendarView = this;

		// 初始化子视图渲染器
		this.yearRenderer = new YearViewRenderer(this.app, plugin);
		this.monthRenderer = new MonthViewRenderer(this.app, plugin);
		this.weekRenderer = new WeekViewRenderer(this.app, plugin);
		this.dayRenderer = new DayViewRenderer(this.app, plugin);
		this.taskRenderer = new TaskViewRenderer(this.app, plugin);
        this.ganttRenderer = new GanttViewRenderer(this.app, plugin);

		// 初始化工具栏控制器
		this.toolbar = new Toolbar();
	}

	getViewType(): string {
		return GC_VIEW_ID;
	}

	getDisplayText(): string {
		return 'Gantt Calendar';
	}

	getIcon(): string {
		return 'calendar-days';
	}

	async onOpen(): Promise<void> {
		// 等待任务缓存准备完成
		if (this.plugin?.taskCache?.whenReady) {
			await this.plugin.taskCache.whenReady();
		}
		// 设置日历视图渲染器引用（用于排序和筛选功能）
		this.toolbar.setCalendarRenderers(
			this.dayRenderer,
			this.weekRenderer,
			this.monthRenderer,
			this.yearRenderer
		);
		this.render();
		this.setupResizeObserver();

		// 订阅缓存更新事件
		this.cacheUpdateListener = () => {
			if (this.containerEl.isConnected) {
				this.render();
			}
		};
		this.plugin?.taskCache?.onUpdate(this.cacheUpdateListener);
	}

	public refreshSettings(): void {
		// 重新渲染内容
		this.render();
	}

	async onClose(): Promise<void> {
		// Unsubscribe from cache updates
		if (this.cacheUpdateListener) {
			this.plugin?.taskCache?.offUpdate(this.cacheUpdateListener);
			this.cacheUpdateListener = null;
		}

		// Cleanup renderers
		this.yearRenderer.runDomCleanups();
		this.monthRenderer.runDomCleanups();
		this.weekRenderer.runDomCleanups();
		this.dayRenderer.runDomCleanups();
		this.taskRenderer.runDomCleanups();

		// Cleanup resize observer
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
		}
	}

	private setupResizeObserver(): void {
		// 监听容器大小变化，重新计算年视图农历显示
		const content = this.containerEl.children[1];
		if (!content) return;

		try {
			this.resizeObserver = new ResizeObserver(() => {
				if (this.viewType === 'year') {
					this.yearRenderer.updateAllMonthCards();
				}
			});

			this.resizeObserver.observe(content);
		} catch (e) {
			// ResizeObserver not supported, fail silently
		}
	}

	private render(): void {
		const startTime = performance.now();
		Logger.debug('GCMainView', `render() called, viewType: ${this.viewType}`);

		// 清理上一次渲染的资源
		this.yearRenderer.runDomCleanups();
		this.monthRenderer.runDomCleanups();
		this.weekRenderer.runDomCleanups();
		this.dayRenderer.runDomCleanups();
		this.taskRenderer.runDomCleanups();

		const container = this.containerEl.children[1];
		container.empty();
		container.removeClass('gantt-root');

		// Create toolbar
		const toolbarContainer = container.createDiv('calendar-toolbar');
		this.toolbar.render(toolbarContainer, {
			currentViewType: this.viewType,
			currentDate: this.currentDate,
			titleText: this.getViewTitle(),
			showViewNavButtonText: this.plugin?.settings?.showViewNavButtonText ?? true,
			globalFilterText: this.plugin?.settings?.globalTaskFilter,
			taskRenderer: this.taskRenderer,
			ganttRenderer: this.ganttRenderer,
			dayRenderer: this.dayRenderer,
			weekRenderer: this.weekRenderer,
			plugin: this.plugin,
			onViewSwitch: (type) => this.switchView(type),
			onPrevious: () => this.previousPeriod(),
			onToday: () => this.goToToday(),
			onNext: () => this.nextPeriod(),
			onFilterChange: () => {
				// 任务视图：只刷新任务列表，不重新渲染工具栏
				if (this.viewType === 'task') {
					this.taskRenderer.refreshTaskList();
				} else {
					this.render();
				}
			},
			onRender: () => this.render(),  // 仅重新渲染视图，不刷新缓存
			onRefresh: async () => {
				await this.plugin.taskCache.initialize(
					this.plugin.settings.globalTaskFilter,
					this.plugin.settings.enabledTaskFormats
				);
				this.render();
			}
		});

		// Create calendar content
		const content = container.createDiv('calendar-content');
		// 甘特图模式下限定滚动区域在内容容器内，并让根容器禁用外部滚动
		if (this.viewType === 'gantt') {
			content.addClass('gantt-mode');
			container.addClass('gantt-root');
		} else {
			content.removeClass('gantt-mode');
		}
		this.renderCalendarContent(content);

		// 年视图应用农历字号
		if (this.viewType === 'year') {
			this.yearRenderer.applyLunarFontSize(content);
		}

		const elapsed = performance.now() - startTime;
		Logger.stats('GCMainView', `render() completed in ${elapsed.toFixed(2)}ms`);
	}

	private renderCalendarContent(content: HTMLElement): void {
		switch (this.viewType) {
			case 'year':
				this.yearRenderer.render(content, this.currentDate);
				break;
			case 'month':
				this.monthRenderer.render(content, this.currentDate);
				break;
			case 'week':
				this.weekRenderer.render(content, this.currentDate);
				break;
			case 'day':
				this.dayRenderer.render(content, this.currentDate);
				break;
			case 'task':
				this.taskRenderer.render(content, this.currentDate);
				break;
            case 'gantt':
                this.ganttRenderer.render(content, this.currentDate);
                break;
		}
	}

	// ===== 公共方法供子渲染器调用 =====

	public selectDate(date: Date): void {
		this.currentDate = new Date(date);
		if (this.viewType !== 'day') {
			this.viewType = 'day';
		}
		this.render();
	}

	public switchView(type: CalendarViewType): void {
		this.viewType = type;
		this.render();
	}

	// ===== 导航方法 =====

	private previousPeriod(): void {
		const date = new Date(this.currentDate);
		switch (this.viewType) {
			case 'year':
				date.setFullYear(date.getFullYear() - 1);
				break;
			case 'month':
				date.setMonth(date.getMonth() - 1);
				break;
			case 'week':
				date.setDate(date.getDate() - 7);
				break;
			case 'day':
				date.setDate(date.getDate() - 1);
				break;
			case 'task':
				return;
            case 'gantt':
                return;
		}
		this.currentDate = date;
		this.render();
	}

	private nextPeriod(): void {
		const date = new Date(this.currentDate);
		switch (this.viewType) {
			case 'year':
				date.setFullYear(date.getFullYear() + 1);
				break;
			case 'month':
				date.setMonth(date.getMonth() + 1);
				break;
			case 'week':
				date.setDate(date.getDate() + 7);
				break;
			case 'day':
				date.setDate(date.getDate() + 1);
				break;
			case 'task':
				return;
            case 'gantt':
                return;
		}
		this.currentDate = date;
		this.render();
	}

	private goToToday(): void {
		if (this.viewType === 'task' || this.viewType === 'gantt') return;
		this.currentDate = getTodayDate();
		this.render();
	}

	private getViewTitle(): string {
		const monthAbbreviations = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

		switch (this.viewType) {
			case 'year':
				return this.currentDate.getFullYear().toString();
			case 'month':
				return monthAbbreviations[this.currentDate.getMonth()];
			case 'week': {
				const week = getWeekOfDate(this.currentDate, undefined, !!(this.plugin?.settings?.startOnMonday));
				const start = formatDate(week.startDate, 'MM/dd');
				const end = formatDate(week.endDate, 'MM/dd');
				return `W${week.weekNumber}(${start}-${end})`;
			}
			case 'day':
				return formatDate(this.currentDate, 'MM/dd');
			case 'task':
				return '任务视图';
            case 'gantt':
                return '甘特图视图(beta:周月颗粒度有问题)';
		}
	}
}
