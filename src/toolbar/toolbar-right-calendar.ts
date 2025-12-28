import { renderNavButtons } from './components/nav-buttons';
import { renderCalendarViewSwitcher } from './components/calendar-view-switcher';
import { renderRefreshButton } from './components/refresh-button';
import { renderSortButton } from './components/sort-button';
import { renderTagFilterButton } from './components/tag-filter';
import type { CalendarViewType } from '../types';
import type { DayViewRenderer } from '../views/DayView';
import type { WeekViewRenderer } from '../views/WeekView';

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
	private viewSwitcherInstance?: { updateActive: (view: string) => void; cleanup: () => void };

	/**
	 * 设置渲染器引用
	 */
	setRenderers(dayRenderer: DayViewRenderer, weekRenderer: WeekViewRenderer): void {
		this.dayRenderer = dayRenderer;
		this.weekRenderer = weekRenderer;
	}

	/**
	 * 渲染日历视图功能区
	 * @param container 右侧容器元素
	 * @param currentViewType 当前视图类型
	 * @param onPrevious 上一期回调
	 * @param onToday 今天回调
	 * @param onNext 下一期回调
	 * @param onViewSwitch 视图切换回调
	 * @param onRefresh 刷新回调
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
		plugin?: any
	): void {
		container.empty();
		container.addClass('calendar-toolbar-right');

		// ===== 左侧：筛选和排序按钮 =====

		// 排序按钮（仅在日视图和周视图显示）
		if ((currentViewType === 'day' || currentViewType === 'week') && onRefresh) {
			const getRenderer = () => currentViewType === 'day' ? this.dayRenderer : this.weekRenderer;
			if (getRenderer()) {
				renderSortButton(container, {
					getCurrentState: () => getRenderer()?.getSortState() || { field: 'dueDate', order: 'asc' },
					onSortChange: async (newState) => {
						getRenderer()?.setSortState(newState);
						await onRefresh();
					}
				});
			}
		}

		// 标签筛选按钮（所有视图共有）
		if (plugin?.taskCache) {
			const getRenderer = () => {
				if (currentViewType === 'day') return this.dayRenderer;
				if (currentViewType === 'week') return this.weekRenderer;
				// 对于 month 和 year 视图，使用 dayRenderer 作为默认
				return this.dayRenderer;
			};

			renderTagFilterButton(container, {
				getCurrentState: () => getRenderer()?.getTagFilterState() || { selectedTags: [], operator: 'OR' },
				onTagFilterChange: (newState) => {
					getRenderer()?.setTagFilterState(newState);
					onRefresh();
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

		// ===== 右侧：刷新按钮 =====

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
