import type { CalendarViewType } from '../types';
import type { TaskViewRenderer } from '../views/TaskView';
import type { GanttViewRenderer } from '../views/GanttView';
import type { DayViewRenderer } from '../views/DayView';
import type { WeekViewRenderer } from '../views/WeekView';
import { ToolbarLeft } from './toolbar-left';
import { ToolbarCenter } from './toolbar-center';
import { ToolbarRightCalendar } from './toolbar-right-calendar';
import { ToolbarRightTask } from './toolbar-right-task';
import { ToolbarRightGantt } from './toolbar-right-gantt';

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

	constructor() {
		this.leftSection = new ToolbarLeft();
		this.centerSection = new ToolbarCenter();
		this.rightCalendarSection = new ToolbarRightCalendar();
		this.rightTaskSection = new ToolbarRightTask();
        this.rightGanttSection = new ToolbarRightGantt();
	}

	/**
	 * 设置日历视图渲染器引用（用于排序功能）
	 */
	setCalendarRenderers(dayRenderer: DayViewRenderer, weekRenderer: WeekViewRenderer): void {
		this.rightCalendarSection.setRenderers(dayRenderer, weekRenderer);
	}

	/**
	 * 渲染整个工具栏
	 * @param container 工具栏容器元素
	 * @param config 工具栏配置
	 */
	render(container: HTMLElement, config: ToolbarConfig): void {
		container.empty();
		container.addClass('calendar-toolbar');

		// 创建三个区域容器
		const leftContainer = container.createDiv('calendar-toolbar-left');
		const centerContainer = container.createDiv('calendar-toolbar-center');
		const rightContainer = container.createDiv('calendar-toolbar-right');

		// 渲染左侧视图选择器
		this.leftSection.render(
			leftContainer,
			config.currentViewType,
			config.lastCalendarViewType,
			config.onViewSwitch
		);

		// 渲染中间信息展示区
		this.centerSection.render(
			centerContainer,
			config.currentViewType,
			config.currentDate,
			config.dateRangeText
		);

		// 渲染右侧功能区（根据视图类型选择）
		if (config.currentViewType === 'task') {
			this.rightTaskSection.render(
				rightContainer,
				config.globalFilterText || '',
				config.taskRenderer,
				config.onFilterChange,
				config.onRefresh
			);
		} else if (config.currentViewType === 'gantt') {
            this.rightGanttSection.render(
                rightContainer,
                config.ganttRenderer,
                config.onRefresh
            );
		} else {
			this.rightCalendarSection.render(
				rightContainer,
				config.currentViewType,
				config.onPrevious,
				config.onToday,
				config.onNext,
				config.onViewSwitch,
				config.onRefresh
			);
		}
	}
}

/**
 * 工具栏配置接口
 */
export interface ToolbarConfig {
	// 基础信息
	currentViewType: CalendarViewType;
	lastCalendarViewType: CalendarViewType;
	currentDate: Date;
	dateRangeText: string;

	// 任务视图相关
	globalFilterText?: string;
	taskRenderer: TaskViewRenderer;
    ganttRenderer: GanttViewRenderer;
	dayRenderer?: DayViewRenderer;
	weekRenderer?: WeekViewRenderer;

	// 回调函数
	onViewSwitch: (type: CalendarViewType) => void;
	onPrevious: () => void;
	onToday: () => void;
	onNext: () => void;
	onFilterChange: () => void;
	onRefresh: () => Promise<void>;
}
