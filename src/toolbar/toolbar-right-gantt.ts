import type { GanttViewRenderer } from '../views/GanttView';
import { renderStatusFilterButton } from './components/status-filter';
import { renderRefreshButton } from './components/refresh-button';
import { renderGanttScrollButtons } from './components/gantt-scroll-buttons';
import { renderSortButton } from './components/sort-button';
import { renderTagFilterButton } from './components/tag-filter';
import { renderCreateTaskButton } from './components/create-task-button';
import { ToolbarClasses } from '../utils/bem';

/**
 * 工具栏右侧区域 - 甘特视图功能区
 *
 * 按钮布局顺序：
 * 左侧（私有）：[滚动按钮] | [状态筛选]
 * 右侧（共有）：[排序] | [标签筛选] | [刷新]
 *
 * 这样设计确保切换视图时共有按钮位置不变，避免跳动
 */
export class ToolbarRightGantt {

	render(
		container: HTMLElement,
		ganttRenderer: GanttViewRenderer,
		onRefresh: () => Promise<void>,
		onRender: () => void = () => {},
		plugin?: any
	): void {
		container.empty();

		// ===== 左侧：甘特图视图私有按钮 =====

		// 滚动按钮（左置顶/今天/右置顶）
		renderGanttScrollButtons(container, {
			onScrollToLeft: () => ganttRenderer.jumpToLeft(),
			onScrollToToday: () => ganttRenderer.jumpToToday(),
			onScrollToRight: () => ganttRenderer.jumpToRight(),
		});

		// 状态筛选
		renderStatusFilterButton(container, {
			getCurrentState: () => ganttRenderer.getStatusFilterState(),
			onStatusFilterChange: (state) => {
				ganttRenderer.setStatusFilterState(state);
				onRender();
			},
			getAvailableStatuses: () => {
				return plugin?.settings?.taskStatuses || [];
			}
		});

		// ===== 右侧：共有按钮（统一顺序） =====

		// 排序按钮
		renderSortButton(container, {
			getCurrentState: () => ganttRenderer.getSortState(),
			onSortChange: (newState) => {
				ganttRenderer.setSortState(newState);
				onRender();  // 排序只触发视图渲染
			}
		});

		// 标签筛选按钮
		if (plugin?.taskCache) {
			renderTagFilterButton(container, {
				getCurrentState: () => ganttRenderer.getTagFilterState(),
				onTagFilterChange: (newState) => {
					ganttRenderer.setTagFilterState(newState);
					onRender();  // 标签筛选只触发视图渲染
				},
				getAllTasks: () => plugin.taskCache.getAllTasks()
			});
		}

		// 创建任务按钮
		if (plugin) {
			// 创建包装容器以便添加响应式优先级类
			const createTaskWrapper = container.createDiv();
			createTaskWrapper.addClass(ToolbarClasses.priority.priority3);
			renderCreateTaskButton(createTaskWrapper, {
				plugin: plugin,
				buttonClass: ToolbarClasses.components.navButtons.btn
			});
		}

		// 刷新按钮（所有视图共有，始终在最右边）
		renderRefreshButton(container, onRefresh, '刷新甘特图');
	}
}
