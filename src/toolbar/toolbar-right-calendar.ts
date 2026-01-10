import { renderNavButtons } from './components/nav-buttons';
import { renderCalendarViewSwitcher } from './components/calendar-view-switcher';
import { renderRefreshButton } from './components/refresh-button';
import { renderSortButton } from './components/sort-button';
import { renderTagFilterButton } from './components/tag-filter';
import { renderCreateTaskButton } from './components/create-task-button';
import { renderStatusFilter } from './components/status-filter';
import type { CalendarViewType } from '../types';
import type { DayViewRenderer } from '../views/DayView';
import type { WeekViewRenderer } from '../views/WeekView';
import type { MonthViewRenderer } from '../views/MonthView';
import type { YearViewRenderer } from '../views/YearView';

/**
 * 工具栏右侧区域 - 日历视图功能区
 *
 * 按钮布局顺序：
 * 日视图/周视图：[排序] | [标签筛选] | [◀ 上一期] [今天] [下一期▶] | [日/周/月/年] | [刷新]
 * 年视图/月视图：[标签筛选] | [◀ 上一期] [今天] [下一期▶] | [日/周/月/年] | [刷新]
 */
export class ToolbarRightCalendar {
	private dayRenderer?: DayViewRenderer;
	private weekRenderer?: WeekViewRenderer;
	private monthRenderer?: MonthViewRenderer;
	private yearRenderer?: YearViewRenderer;
	private viewSwitcherInstance?: { updateActive: (view: string) => void; cleanup: () => void };

	/**
	 * 设置渲染器引用
	 */
	setRenderers(
		dayRenderer: DayViewRenderer,
		weekRenderer: WeekViewRenderer,
		monthRenderer: MonthViewRenderer,
		yearRenderer: YearViewRenderer
	): void {
		this.dayRenderer = dayRenderer;
		this.weekRenderer = weekRenderer;
		this.monthRenderer = monthRenderer;
		this.yearRenderer = yearRenderer;
	}

	/**
	 * 渲染日历视图功能区
	 * @param container 右侧容器元素
	 * @param currentViewType 当前视图类型
	 * @param onPrevious 上一期回调
	 * @param onToday 今天回调
	 * @param onNext 下一期回调
	 * @param onViewSwitch 视图切换回调
	 * @param onRefresh 刷新回调（重新扫描文件）
	 * @param onRender 渲染回调（仅重新渲染视图）
	 * @param plugin 插件实例
	 */
	render(
		container: HTMLElement,
		currentViewType: CalendarViewType,
		onPrevious: () => void,
		onToday: () => void,
		onNext: () => void,
		onViewSwitch: (type: CalendarViewType) => void,
		onRefresh: () => Promise<void>,
		onRender: () => void = () => {},
		plugin?: any
	): void {
		container.empty();
		container.addClass('calendar-toolbar-right');

		// ===== 左侧：筛选和排序按钮 =====

		// 状态筛选按钮（周视图和月视图）
		if (currentViewType === 'week' || currentViewType === 'month') {
			const renderer = currentViewType === 'week' ? this.weekRenderer : this.monthRenderer;
			if (renderer) {
				renderStatusFilter(container, renderer.getTaskFilter() || 'all', (value) => {
					renderer.setTaskFilter(value);
					onRender();
				});
			}
		}

		// 排序按钮（仅在日视图和周视图显示）
		if (currentViewType === 'day' || currentViewType === 'week') {
			const getRenderer = () => currentViewType === 'day' ? this.dayRenderer : this.weekRenderer;
			if (getRenderer()) {
				renderSortButton(container, {
					getCurrentState: () => getRenderer()?.getSortState() || { field: 'dueDate', order: 'asc' },
					onSortChange: (newState) => {
						getRenderer()?.setSortState(newState);
						onRender();  // 排序只触发视图渲染，不刷新缓存
					}
				});
			}
		}

		// 标签筛选按钮（所有视图共有）
		if (plugin?.taskCache) {
			const getRenderer = () => {
				if (currentViewType === 'day') return this.dayRenderer;
				if (currentViewType === 'week') return this.weekRenderer;
				if (currentViewType === 'month') return this.monthRenderer;
				if (currentViewType === 'year') return this.yearRenderer;
				return undefined;
			};

			renderTagFilterButton(container, {
				getCurrentState: () => getRenderer()?.getTagFilterState() || { selectedTags: [], operator: 'OR' },
				onTagFilterChange: (newState) => {
					getRenderer()?.setTagFilterState(newState);
					onRender();  // 标签筛选只触发视图渲染，不刷新缓存
				},
				getAllTasks: () => plugin.taskCache.getAllTasks()
			});
		}

		// ===== 中间：导航和视图切换 =====

		// 导航按钮组（日历视图）
		renderNavButtons(container, {
			onPrevious,
			onToday,
			onNext,
			containerClass: 'calendar-nav-buttons',
			buttonClass: 'calendar-nav-compact-btn'
		});

		// 视图选择器（日/周/月/年）
		this.viewSwitcherInstance = renderCalendarViewSwitcher(container, {
			currentView: currentViewType as 'year' | 'month' | 'week' | 'day',
			onViewChange: (view) => onViewSwitch(view as CalendarViewType),
			containerClass: 'calendar-view-selector',
			buttonClass: 'calendar-view-compact-btn'
		});

		// ===== 右侧：功能按钮 =====

		// 创建任务按钮（所有视图共有）
		if (plugin) {
			renderCreateTaskButton(container, {
				plugin: plugin,
				buttonClass: 'calendar-nav-compact-btn'
			});
		}

		// 刷新按钮（所有视图共有，始终在最右边）
		renderRefreshButton(container, onRefresh, '刷新任务');
	}

	/**
	 * 更新当前视图的激活状态
	 */
	updateActiveView(viewType: CalendarViewType): void {
		this.viewSwitcherInstance?.updateActive(viewType);
	}

	/**
	 * 清理资源
	 */
	cleanup(): void {
		this.viewSwitcherInstance?.cleanup();
	}
}
