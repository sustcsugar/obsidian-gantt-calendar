import type { CalendarViewType, IPluginContext } from '../types';
import type { TaskViewRenderer } from '../views/TaskView';
import type { GanttViewRenderer } from '../views/GanttView';
import type { DayViewRenderer } from '../views/DayView';
import type { WeekViewRenderer } from '../views/WeekView';
import type { MonthViewRenderer } from '../views/MonthView';
import type { YearViewRenderer } from '../views/YearView';
import { ToolbarLeft } from './toolbar-left';
import { ToolbarCenter } from './toolbar-center';
import { ToolbarRightCalendar } from './toolbar-right-calendar';
import { ToolbarRightTask } from './toolbar-right-task';
import { ToolbarRightGantt } from './toolbar-right-gantt';
import { ToolbarResponsiveManager } from './toolbar-responsive';
import { ToolbarClasses } from '../utils/bem';

/**
 * 工具栏主控制器
 * 负责整体布局和协调左中右三个区域
 */
export class Toolbar {
	private leftSection: ToolbarLeft;
	private centerSection: ToolbarCenter;
	private rightCalendarSection: ToolbarRightCalendar;
	private rightTaskSection: ToolbarRightTask;
	private rightGanttSection: ToolbarRightGantt;
	private responsiveManager: ToolbarResponsiveManager;
	private container: HTMLElement | null = null;
	private isExpanded = false;
	private currentViewType: CalendarViewType | null = null;
	private openingTimer: number | null = null;
	private activeDocument: Document | null = null;
	private readonly handleDocumentPointerDown = (event: PointerEvent): void => {
		if (!this.isExpanded || !this.container) return;
		if (!this.container.contains(event.target as Node)) {
			this.setExpanded(false);
		}
	};

	constructor() {
		this.leftSection = new ToolbarLeft();
		this.centerSection = new ToolbarCenter();
		this.rightCalendarSection = new ToolbarRightCalendar();
		this.rightTaskSection = new ToolbarRightTask();
		this.rightGanttSection = new ToolbarRightGantt();
		this.responsiveManager = new ToolbarResponsiveManager();
	}

	private setExpanded(expanded: boolean, animate = false): void {
		this.isExpanded = expanded;
		if (!this.container) return;

		this.container.toggleClass(ToolbarClasses.modifiers.expanded, expanded);
		this.container.removeClass(ToolbarClasses.modifiers.opening);
		if (this.openingTimer !== null) {
			window.clearTimeout(this.openingTimer);
			this.openingTimer = null;
		}

		if (expanded && animate) {
			this.container.addClass(ToolbarClasses.modifiers.opening);
			this.openingTimer = window.setTimeout(() => {
				this.container?.removeClass(ToolbarClasses.modifiers.opening);
				this.openingTimer = null;
			}, 180);
		}
	}

	/**
	 * 设置日历视图渲染器引用（用于排序和筛选功能）
	 */
	setCalendarRenderers(
		dayRenderer: DayViewRenderer,
		weekRenderer: WeekViewRenderer,
		monthRenderer: MonthViewRenderer,
		yearRenderer: YearViewRenderer
	): void {
		this.rightCalendarSection.setRenderers(dayRenderer, weekRenderer, monthRenderer, yearRenderer);
	}

	/**
	 * 渲染整个工具栏
	 * @param container 工具栏容器元素
	 * @param config 工具栏配置
	 */
	render(container: HTMLElement, config: ToolbarConfig): void {
		const nextDocument = container.ownerDocument;
		if (this.activeDocument !== nextDocument) {
			this.activeDocument?.removeEventListener('pointerdown', this.handleDocumentPointerDown, true);
			nextDocument.addEventListener('pointerdown', this.handleDocumentPointerDown, true);
			this.activeDocument = nextDocument;
		}
		this.container = container;
		if (this.currentViewType !== null && this.currentViewType !== config.currentViewType) {
			this.isExpanded = false;
		}
		this.currentViewType = config.currentViewType;
		if (!config.autoCollapse) {
			this.isExpanded = false;
		}

		container.empty();
		container.addClass(ToolbarClasses.block);
		container.toggleClass(
			ToolbarClasses.modifiers.autoCollapse,
			config.autoCollapse ?? false
		);
		container.toggleClass(ToolbarClasses.modifiers.expanded, this.isExpanded);
		container.removeClass(ToolbarClasses.modifiers.opening);

		// 创建三个区域容器
		const leftContainer = container.createDiv(ToolbarClasses.elements.left);
		const centerContainer = container.createDiv(ToolbarClasses.elements.center);
		const rightContainer = container.createDiv(ToolbarClasses.elements.right);

		// 渲染左侧6视图选择器
		const handleViewSwitch = (type: CalendarViewType): void => {
			if (config.autoCollapse) {
				if (type === config.currentViewType) {
					this.setExpanded(!this.isExpanded, !this.isExpanded);
					return;
				}
				this.setExpanded(false);
			}
			config.onViewSwitch(type);
		};

		this.leftSection.render(
			leftContainer,
			config.currentViewType,
			handleViewSwitch,
			config.showViewNavButtonText ?? true
		);

		// 渲染中间信息展示区
		this.centerSection.render(
			centerContainer,
			config.titleText
		);

		// 渲染右侧功能区（根据视图类型选择）
		if (config.currentViewType === 'task') {
			this.rightTaskSection.render(
				rightContainer,
				config.globalFilterText || '',
				config.taskRenderer,
				config.onFilterChange,
				config.onRefresh,
				config.plugin
			);
		} else if (config.currentViewType === 'gantt') {
			this.rightGanttSection.render(
				rightContainer,
				config.ganttRenderer,
				config.onRefresh,
				config.onRender,
				config.plugin
			);
		} else {
			this.rightCalendarSection.render(
				rightContainer,
				config.currentViewType,
				config.onPrevious,
				config.onToday,
				config.onNext,
				config.onRefresh,
				config.onRender,
				config.plugin
			);
		}

		// 启动响应式监听
		this.responsiveManager.observe(container, centerContainer, rightContainer);
	}

	/**
	 * 清理资源
	 */
	destroy(): void {
		this.responsiveManager.disconnect();
		this.activeDocument?.removeEventListener('pointerdown', this.handleDocumentPointerDown, true);
		this.activeDocument = null;
		if (this.openingTimer !== null) {
			window.clearTimeout(this.openingTimer);
			this.openingTimer = null;
		}
		this.container = null;
	}
}

/**
 * 工具栏配置接口
 */
export interface ToolbarConfig {
	// 基础信息
	currentViewType: CalendarViewType;
	currentDate: Date;
	titleText: string;
	showViewNavButtonText?: boolean; // 是否显示视图导航按钮文本
	autoCollapse?: boolean; // 是否自动收起工具栏

	// 任务视图相关
	globalFilterText?: string;
	taskRenderer: TaskViewRenderer;
	ganttRenderer: GanttViewRenderer;
	dayRenderer?: DayViewRenderer;
	weekRenderer?: WeekViewRenderer;

	// 插件实例
	plugin?: IPluginContext;

	// 回调函数
	onViewSwitch: (type: CalendarViewType) => void;
	onPrevious: () => void;
	onToday: () => void;
	onNext: () => void;
	onFilterChange: () => void;
	onRender: () => void;  // 仅重新渲染视图
	onRefresh: () => Promise<void>;  // 重新扫描文件并渲染
}
