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

		// 日期筛选组（标签+输入+模式按钮：全/日/周/月）
		const dateFilterGroup = container.createDiv('toolbar-right-task-date-filter-group');
		const dateLabel = dateFilterGroup.createEl('span', {
			text: '日期',
			cls: 'toolbar-right-task-date-filter-label'
		});
		const dateInput = dateFilterGroup.createEl('input', {
			cls: 'toolbar-right-task-date-input',
			attr: { type: 'date' }
		}) as HTMLInputElement;
		// 默认当天
		try {
			dateInput.value = formatDate(new Date(), 'YYYY-MM-DD');
		} catch {
			dateInput.value = new Date().toISOString().slice(0, 10);
		}
		// 输入变化：设置特定日期，清除按钮选中状态
		dateInput.addEventListener('change', () => {
			const val = dateInput.value;
			if (val) {
				const d = new Date(val);
				taskRenderer.setSpecificDate(d);
				taskRenderer.setDateRangeMode('custom');
				// 清除按钮选中态
				Array.from(dateFilterGroup.getElementsByClassName('toolbar-right-task-date-mode-btn')).forEach(el => el.classList.remove('active'));
			} else {
				// 无输入时，恢复为全部并清空特定日期
				taskRenderer.setSpecificDate(null);
				taskRenderer.setDateRangeMode('all');
			}
			onFilterChange();
		});

		const modes: Array<{ key: 'all' | 'day' | 'week' | 'month'; label: string }> = [
			{ key: 'all', label: '全' },
			{ key: 'day', label: '日' },
			{ key: 'week', label: '周' },
			{ key: 'month', label: '月' },
		];
		for (const m of modes) {
			const btn = dateFilterGroup.createEl('button', {
				cls: 'toolbar-right-task-date-mode-btn',
				text: m.label,
				attr: { 'data-mode': m.key }
			});
			btn.addEventListener('click', () => {
				// 清空输入框
				dateInput.value = '';
				// 更新模式
				taskRenderer.setDateRangeMode(m.key);
				if (m.key !== 'all') {
					// 以当天为参考
					taskRenderer.setSpecificDate(new Date());
				} else {
					taskRenderer.setSpecificDate(null);
				}
				// active 切换
				Array.from(dateFilterGroup.getElementsByClassName('toolbar-right-task-date-mode-btn')).forEach(el => el.classList.remove('active'));
				btn.classList.add('active');
				onFilterChange();
			});
		}

		// 刷新按钮
		const refreshBtn = container.createEl('button', { 
			cls: 'toolbar-right-task-refresh-btn', 
			attr: { title: '刷新任务' } 
		});
		setIcon(refreshBtn, 'rotate-ccw');
		refreshBtn.addEventListener('click', onRefresh);
	}
}
