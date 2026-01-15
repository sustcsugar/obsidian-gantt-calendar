import type { GanttViewRenderer } from '../views/GanttView';
import { renderStatusFilterButton } from './components/status-filter';
import { renderRefreshButton } from './components/refresh-button';
import { renderTimeGranularity } from './components/time-granularity';
import { renderSortButton } from './components/sort-button';
import { renderTagFilterButton } from './components/tag-filter';
import { renderDualFieldSelector, type DateFieldType } from './components/field-selector';
import { renderCreateTaskButton } from './components/create-task-button';
import { ToolbarClasses } from '../utils/bem';

/**
 * 工具栏右侧区域 - 甘特视图功能区
 *
 * 按钮布局顺序：
 * 左侧（私有）：[时间颗粒度] | [开始时间字段] | [结束时间字段] | [状态筛选]
 * 右侧（共有）：[排序] | [标签筛选] | [刷新]
 *
 * 这样设计确保切换视图时共有按钮位置不变，避免跳动
 */
export class ToolbarRightGantt {
	private dualFieldSelectorInstance?: {
		updateStart: (field: DateFieldType) => void;
		updateEnd: (field: DateFieldType) => void;
		cleanup: () => void;
	};

	render(
		container: HTMLElement,
		ganttRenderer: GanttViewRenderer,
		onRefresh: () => Promise<void>,
		onRender: () => void = () => {},
		plugin?: any
	): void {
		container.empty();

		// ===== 左侧：甘特图视图私有按钮 =====

		// 时间颗粒度选择按钮
		renderTimeGranularity(
			container,
			{
				current: ganttRenderer.getTimeGranularity(),
				onChange: (granularity) => {
					ganttRenderer.setTimeGranularity(granularity);
					onRefresh();
				},
			},
			() => {
				ganttRenderer.jumpToToday();
			}
		);

		// 时间字段选择（开始/结束）
		this.dualFieldSelectorInstance = renderDualFieldSelector(container, {
			startField: ganttRenderer.getStartField() as DateFieldType,
			endField: ganttRenderer.getEndField() as DateFieldType,
			onStartFieldChange: (field) => {
				ganttRenderer.setStartField(field);
			},
			onEndFieldChange: (field) => {
				ganttRenderer.setEndField(field);
			}
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

	/**
	 * 清理资源
	 */
	cleanup(): void {
		this.dualFieldSelectorInstance?.cleanup();
	}
}
