import { setIcon } from 'obsidian';
import { renderRefreshButton } from './refresh-button';
import { renderSortButton } from './sort-button';
import type { CalendarViewType } from '../types';
import type { DayViewRenderer } from '../views/DayView';
import type { WeekViewRenderer } from '../views/WeekView';

/**
 * 工具栏右侧区域 - 日历视图功能区
 * 负责渲染导航按钮（上一期/今天/下一期）、视图切换（日/周/月/年）和刷新按钮
 * 日视图和周视图额外显示排序按钮
 */
export class ToolbarRightCalendar {
	private dayRenderer?: DayViewRenderer;
	private weekRenderer?: WeekViewRenderer;

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
	 */
	render(
		container: HTMLElement,
		currentViewType: CalendarViewType,
		onPrevious: () => void,
		onToday: () => void,
		onNext: () => void,
		onViewSwitch: (type: CalendarViewType) => void,
		onRefresh: () => Promise<void>
	): void {
		container.empty();
		container.addClass('calendar-toolbar-right');

		// 导航按钮组
		const navButtons = container.createDiv('calendar-nav-buttons');

		const prevBtn = navButtons.createEl('button', { text: '◀', attr: { title: '上一个' } });
		prevBtn.addClass('calendar-nav-compact-btn');
		prevBtn.onclick = onPrevious;

		const nextBtn = navButtons.createEl('button', { text: '▶', attr: { title: '下一个' } });
		nextBtn.addClass('calendar-nav-compact-btn');
		nextBtn.onclick = onNext;

		const todayBtn = navButtons.createEl('button', { text: '今天', attr: { title: '回到今天' } });
		todayBtn.addClass('calendar-nav-compact-btn');
		todayBtn.onclick = onToday;

		// 视图选择器（日/周/月/年）
		const viewContainer = container.createDiv('calendar-view-selector');
		const viewTypes: { [key: string]: string } = {
			'day': '日',
			'week': '周',
			'month': '月',
			'year': '年',
		};

		['day', 'week', 'month', 'year'].forEach((type) => {
			const btn = viewContainer.createEl('button', { text: viewTypes[type] });
			btn.addClass('calendar-view-compact-btn');
			if (type === currentViewType) btn.addClass('active');
			btn.onclick = () => onViewSwitch(type as CalendarViewType);
		});

		// 日视图和周视图显示排序按钮
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

		// 刷新按钮（共享）
		renderRefreshButton(container, onRefresh, '刷新任务');
	}
}
