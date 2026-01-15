import { formatDate } from '../dateUtils/dateUtilsIndex';
import type { TaskViewRenderer } from '../views/TaskView';
import { renderStatusFilterButton } from './components/status-filter';
import { renderRefreshButton } from './components/refresh-button';
import { renderSortButton } from './components/sort-button';
import { renderTagFilterButton } from './components/tag-filter';
import { renderFieldSelector } from './components/field-selector';
import { renderDateRangeFilter, type DateRangeState } from './components/date-range-filter';
import { renderCreateTaskButton } from './components/create-task-button';
import type { DateFieldType } from './components/field-selector';
import { ToolbarClasses } from '../utils/bem';

/**
 * 工具栏右侧区域 - 任务视图功能区
 *
 * 按钮布局顺序：
 * 左侧（私有）：[状态筛选] | [字段筛选] | [日期范围]
 * 右侧（共有）：[排序] | [标签筛选] | [刷新]
 *
 * 这样设计确保切换视图时共有按钮位置不变，避免跳动
 */
export class ToolbarRightTask {
	// 记录前一个按钮状态，用于清除日期输入后恢复
	private previousMode: 'all' | 'day' | 'week' | 'month' = 'week';
	private dateRangeFilterInstance?: { updateState: (state: DateRangeState) => void; cleanup: () => void };
	private fieldSelectorInstance?: { updateValue: (field: DateFieldType) => void; cleanup: () => void };

	/**
	 * 渲染任务视图功能区
	 * @param container 右侧容器元素
	 * @param globalFilterText 全局筛选文本
	 * @param taskRenderer 任务视图渲染器
	 * @param onFilterChange 筛选变更回调
	 * @param onRefresh 刷新回调
	 * @param plugin 插件实例
	 */
	render(
		container: HTMLElement,
		globalFilterText: string,
		taskRenderer: TaskViewRenderer,
		onFilterChange: () => void,
		onRefresh: () => Promise<void>,
		plugin?: any
	): void {
		container.empty();

		// ===== 左侧：任务视图私有按钮 =====

		// 状态筛选
		renderStatusFilterButton(container, {
			getCurrentState: () => taskRenderer.getStatusFilterState(),
			onStatusFilterChange: (state) => {
				taskRenderer.setStatusFilterState(state);
				onFilterChange();
			},
			getAvailableStatuses: () => {
				return plugin?.settings?.taskStatuses || [];
			}
		});

		// 字段筛选
		this.fieldSelectorInstance = renderFieldSelector(container, {
			currentField: taskRenderer.getTimeFilterField(),
			onFieldChange: (field) => {
				taskRenderer.setTimeFilterField(field);
				onFilterChange();
			},
			label: '字段筛选',
			containerClass: ToolbarClasses.components.fieldFilter.group
		});

		// 日期筛选组
		this.dateRangeFilterInstance = renderDateRangeFilter(container, {
			currentState: {
				type: taskRenderer.getDateRangeMode(),
				specificDate: undefined
			},
			onRangeChange: (state) => {
				taskRenderer.setDateRangeMode(state.type);
				if (state.specificDate) {
					taskRenderer.setSpecificDate(state.specificDate);
				}
				if (state.type !== 'custom') {
					this.previousMode = state.type;
				}
				onFilterChange();
			},
			containerClass: ToolbarClasses.components.dateFilter.group,
			inputClass: ToolbarClasses.components.dateFilter.input,
			buttonClass: ToolbarClasses.components.dateFilter.modeBtn,
			showAllOption: true,
			labelText: '日期'
		});

		// ===== 右侧：共有按钮（统一顺序） =====

		// 排序按钮
		renderSortButton(container, {
			getCurrentState: () => taskRenderer.getSortState(),
			onSortChange: (newState) => {
				taskRenderer.setSortState(newState);
				onFilterChange();
			}
		});

		// 标签筛选按钮
		if (plugin?.taskCache) {
			renderTagFilterButton(container, {
				getCurrentState: () => taskRenderer.getTagFilterState(),
				onTagFilterChange: (newState) => {
					taskRenderer.setTagFilterState(newState);
					onFilterChange();
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
		renderRefreshButton(container, onRefresh, '刷新任务');
	}

	/**
	 * 清理资源
	 */
	cleanup(): void {
		this.dateRangeFilterInstance?.cleanup();
		this.fieldSelectorInstance?.cleanup();
	}
}
