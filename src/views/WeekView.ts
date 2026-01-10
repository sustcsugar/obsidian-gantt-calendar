import { Notice } from 'obsidian';
import { BaseViewRenderer } from './BaseViewRenderer';
import { getWeekOfDate } from '../dateUtils/dateUtilsIndex';
import { updateTaskDateField } from '../tasks/taskUpdater';
import type { GCTask, SortState } from '../types';
import { sortTasks } from '../tasks/taskSorter';
import { DEFAULT_SORT_STATE } from '../types';
import { TaskCardComponent, WeekViewConfig } from '../components/TaskCard';
import { Logger } from '../utils/logger';

/**
 * 周视图渲染器
 */
export class WeekViewRenderer extends BaseViewRenderer {
	// 排序状态 - 默认优先级降序
	private sortState: SortState = { field: 'priority', order: 'desc' };

	public getSortState(): SortState {
		return this.sortState;
	}

	public setSortState(state: SortState): void {
		this.sortState = state;
	}

	render(container: HTMLElement, currentDate: Date): void {
		const weekData = getWeekOfDate(currentDate, currentDate.getFullYear(), !!(this.plugin?.settings?.startOnMonday));

		const weekContainer = container.createDiv('gc-view gc-view--week');
		const weekGrid = weekContainer.createDiv('calendar-week-grid');

		// 标题行
		const headerRow = weekGrid.createDiv('calendar-week-header-row');
		weekData.days.forEach((day) => {
			const dayHeader = headerRow.createDiv('calendar-day-header-cell');
			const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
			dayHeader.createEl('div', { text: dayNames[day.weekday], cls: 'day-name' });
			dayHeader.createEl('div', { text: day.day.toString(), cls: 'day-number' });
			if (day.lunarText) {
				dayHeader.createEl('div', { text: day.lunarText, cls: 'day-lunar' });
			}
			if (day.isToday) {
				dayHeader.addClass('today');
			}
		});

		// 任务网格 - 七列
		const tasksGrid = weekGrid.createDiv('calendar-week-tasks-grid');
		weekData.days.forEach((day) => {
			const dayTasksColumn = tasksGrid.createDiv('calendar-week-tasks-column');
			if (day.isToday) {
				dayTasksColumn.addClass('today');
			}

			// 加载任务
			this.loadWeekViewTasks(dayTasksColumn, day.date);

			// 设置拖拽目标
			this.setupDragDropForColumn(dayTasksColumn, day.date);
		});
	}

	/**
	 * 设置列的拖放功能
	 */
	private setupDragDropForColumn(column: HTMLElement, targetDate: Date): void {
		column.addEventListener('dragover', (e: DragEvent) => {
			e.preventDefault();
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}
			column.style.backgroundColor = 'var(--background-modifier-hover)';
		});

		column.addEventListener('dragleave', (e: DragEvent) => {
			if (e.target === column) {
				column.style.backgroundColor = '';
			}
		});

		column.addEventListener('drop', async (e: DragEvent) => {
			e.preventDefault();
			column.style.backgroundColor = '';

			const taskId = e.dataTransfer?.getData('taskId');
			if (!taskId) return;

			const [filePath, lineNum] = taskId.split(':');
			const lineNumber = parseInt(lineNum, 10);

			// 查找源任务
			const allTasks = this.plugin.taskCache.getAllTasks();
			const sourceTask = allTasks.find((t: GCTask) => t.filePath === filePath && t.lineNumber === lineNumber);
			if (!sourceTask) {
				Logger.error('WeekView', 'Source task not found:', taskId);
				return;
			}

			const dateFieldName = this.plugin.settings.dateFilterField || 'dueDate';

			try {
				this.clearTaskTooltips();
				await updateTaskDateField(
					this.app,
					sourceTask,
					dateFieldName,
					targetDate,
					this.plugin.settings.enabledTaskFormats
				);
				Logger.debug('WeekView', 'Task drag-drop update successful', { taskId, dateField: dateFieldName, targetDate });
			} catch (error) {
				Logger.error('WeekView', 'Error updating task date:', error);
				new Notice('更新任务日期失败');
			}
		});
	}

	/**
	 * 加载周视图任务
	 */
	private async loadWeekViewTasks(columnContainer: HTMLElement, targetDate: Date): Promise<void> {
		columnContainer.empty();

		try {
			let tasks: GCTask[] = this.plugin.taskCache.getAllTasks();
			// 应用标签筛选
			tasks = this.applyTagFilter(tasks);
			const dateField = this.plugin.settings.dateFilterField || 'dueDate';

			const normalizedTarget = new Date(targetDate);
			normalizedTarget.setHours(0, 0, 0, 0);

			// 筛选当天任务
			let currentDayTasks = tasks.filter(task => {
				const dateValue = (task as any)[dateField];
				if (!dateValue) return false;

				const taskDate = new Date(dateValue);
				if (isNaN(taskDate.getTime())) return false;
				taskDate.setHours(0, 0, 0, 0);

				return taskDate.getTime() === normalizedTarget.getTime();
			});

			// 应用排序
			currentDayTasks = sortTasks(currentDayTasks, this.sortState);

			if (currentDayTasks.length === 0) {
				columnContainer.createEl('div', { text: '暂无任务', cls: 'calendar-week-task-empty' });
				return;
			}

			currentDayTasks.forEach(task => this.renderTaskItem(task, columnContainer, targetDate));
		} catch (error) {
			Logger.error('WeekView', 'Error loading week view tasks', error);
			columnContainer.createEl('div', { text: '加载出错', cls: 'calendar-week-task-empty' });
		}
	}

	/**
	 * 渲染周视图任务项（使用统一组件）
	 */
	private renderTaskItem(task: GCTask, container: HTMLElement, targetDate: Date): void {
		new TaskCardComponent({
			task,
			config: WeekViewConfig,
			container,
			app: this.app,
			plugin: this.plugin,
			targetDate,
			onClick: (task) => {
				// 刷新当前周视图
				const viewContainer = document.querySelector('.calendar-week-view-container');
				if (viewContainer) {
					this.render(viewContainer as HTMLElement, new Date());
				}
			},
		}).render();
	}
}
