import { setIcon } from 'obsidian';
import { formatDate } from '../utils';
import type { TaskViewRenderer } from '../views/TaskView';

/**
 * 工具栏右侧区域 - 任务视图功能区
 * 负责渲染全局筛选状态、状态筛选、时间筛选和刷新按钮
 */
export class ToolbarRightTask {
	/**
	 * 渲染任务视图功能区
	 * @param container 右侧容器元素
	 * @param globalFilterText 全局筛选文本
	 * @param taskRenderer 任务视图渲染器
	 * @param onFilterChange 筛选变更回调
	 * @param onRefresh 刷新回调
	 */
	render(
		container: HTMLElement,
		globalFilterText: string,
		taskRenderer: TaskViewRenderer,
		onFilterChange: () => void,
		onRefresh: () => Promise<void>
	): void {
		container.empty();
		container.addClass('toolbar-right-task');

		// Global Filter 状态
		const gfText = container.createEl('span', { cls: 'toolbar-right-task-global-filter' });
		gfText.setText(`Global Filter: ${globalFilterText || '（未设置）'}`);

		// 状态筛选 - 由 TaskViewRenderer 创建
		taskRenderer.createStatusFilterGroup(container, onFilterChange);

		// 分割线
		const divider = container.createDiv('toolbar-right-task-divider');

		// 时间筛选组
		const timeFilterGroup = container.createDiv('toolbar-right-task-time-filter-group');
		const timeLabel = timeFilterGroup.createEl('span', { 
			text: '时间筛选', 
			cls: 'toolbar-right-task-time-filter-label' 
		});
		
		// 时间字段选择
		const fieldSelect = timeFilterGroup.createEl('select', { 
			cls: 'toolbar-right-task-time-field-select' 
		});
		fieldSelect.innerHTML = `
			<option value="createdDate">创建时间</option>
			<option value="startDate">开始时间</option>
			<option value="scheduledDate">规划时间</option>
			<option value="dueDate">截止时间</option>
			<option value="completionDate">完成时间</option>
			<option value="cancelledDate">取消时间</option>
		`;
		fieldSelect.value = taskRenderer.getTimeFilterField();
		fieldSelect.addEventListener('change', (e) => {
			const value = (e.target as HTMLSelectElement).value as 
				'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'completionDate' | 'cancelledDate';
			taskRenderer.setTimeFilterField(value);
			onFilterChange();
		});

		// 刷新按钮
		const refreshBtn = container.createEl('button', { 
			cls: 'toolbar-right-task-refresh-btn', 
			attr: { title: '刷新任务' } 
		});
		setIcon(refreshBtn, 'rotate-ccw');
		refreshBtn.addEventListener('click', onRefresh);
	}
}
