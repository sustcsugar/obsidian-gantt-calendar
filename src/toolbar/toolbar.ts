import type { CalendarViewType } from '../types';
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

	constructor() {
		this.leftSection = new ToolbarLeft();
		this.centerSection = new ToolbarCenter();
		this.rightCalendarSection = new ToolbarRightCalendar();
		this.rightTaskSection = new ToolbarRightTask();
		this.rightGanttSection = new ToolbarRightGantt();
		this.responsiveManager = new ToolbarResponsiveManager();
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
		container.empty();
		container.addClass(ToolbarClasses.block);

		// 创建三个区域容器
		const leftContainer = container.createDiv(ToolbarClasses.elements.left);
		const centerContainer = container.createDiv(ToolbarClasses.elements.center);
		const rightContainer = container.createDiv(ToolbarClasses.elements.right);

		// 渲染左侧6视图选择器
		this.leftSection.render(
			leftContainer,
			config.currentViewType,
			config.onViewSwitch,
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

	// 任务视图相关
	globalFilterText?: string;
	taskRenderer: TaskViewRenderer;
	ganttRenderer: GanttViewRenderer;
	dayRenderer?: DayViewRenderer;
	weekRenderer?: WeekViewRenderer;

	// 插件实例
	plugin?: any;

	// 回调函数
	onViewSwitch: (type: CalendarViewType) => void;
	onPrevious: () => void;
	onToday: () => void;
	onNext: () => void;
	onFilterChange: () => void;
	onRender: () => void;  // 仅重新渲染视图
	onRefresh: () => Promise<void>;  // 重新扫描文件并渲染
}
