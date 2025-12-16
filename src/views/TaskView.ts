import { BaseCalendarRenderer } from './BaseCalendarRenderer';
import { isToday, isThisWeek, isThisMonth } from '../utils';
import type { GanttTask } from '../types';

/**
 * 任务视图渲染器
 */
export class TaskViewRenderer extends BaseCalendarRenderer {
	// 任务筛选状态
	private taskFilter: 'all' | 'completed' | 'uncompleted' = 'all';
	
	// 时间字段筛选
	private timeFieldFilter: 'all' | 'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'completionDate' | 'cancelledDate' = 'all';
	
	// 时间值筛选
	private timeValueFilter: Date | null = null;

	// ===== Getter/Setter 方法 =====

	public getTaskFilter(): 'all' | 'completed' | 'uncompleted' {
		return this.taskFilter;
	}

	public setTaskFilter(value: 'all' | 'completed' | 'uncompleted'): void {
		this.taskFilter = value;
	}

	public getTimeFilterField(): 'all' | 'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'completionDate' | 'cancelledDate' {
		return this.timeFieldFilter;
	}

	public setTimeFilterField(value: any): void {
		this.timeFieldFilter = value;
	}

	public getSpecificDate(): Date | null {
		return this.timeValueFilter;
	}

	public setSpecificDate(date: Date): void {
		this.timeValueFilter = date;
	}

	render(container: HTMLElement, currentDate: Date): void {
		container.addClass('gantt-task-view');

		const statsContainer = container.createDiv('gantt-task-stats');
		const listContainer = container.createDiv('gantt-task-list');

		this.loadTaskList(statsContainer, listContainer);
	}

	/**
	 * 加载任务列表
	 */
	private async loadTaskList(statsContainer: HTMLElement, listContainer: HTMLElement): Promise<void> {
		statsContainer.empty();
		listContainer.empty();
		listContainer.createEl('div', { text: '加载中...', cls: 'gantt-task-empty' });

		try {
			let tasks: GanttTask[] = this.plugin.taskCache.getAllTasks();

			// 应用完成状态筛选
			if (this.taskFilter === 'completed') {
				tasks = tasks.filter(t => t.completed);
			} else if (this.taskFilter === 'uncompleted') {
				tasks = tasks.filter(t => !t.completed);
			}

			// 应用时间字段筛选（如果选择了特定字段和日期）
			if (this.timeFieldFilter !== 'all' && this.timeValueFilter) {
				tasks = tasks.filter(task => {
					const dateValue = (task as any)[this.timeFieldFilter];
					if (!dateValue) return false;

					const taskDate = new Date(dateValue);
					if (isNaN(taskDate.getTime())) return false;

					// 按天比较（忽略时间部分）
					const filterDate = new Date(this.timeValueFilter!);
					taskDate.setHours(0, 0, 0, 0);
					filterDate.setHours(0, 0, 0, 0);

					return taskDate.getTime() === filterDate.getTime();
				});
			}

			listContainer.empty();

			const completedCount = tasks.filter(t => t.completed).length;
			statsContainer.empty();
			statsContainer.createEl('span', { text: `✓ 已完成: ${completedCount}` });
			statsContainer.createEl('span', { text: `○ 待完成: ${tasks.length - completedCount}` });

			if (tasks.length === 0) {
				listContainer.createEl('div', { text: '未找到符合条件的任务', cls: 'gantt-task-empty' });
				return;
			}

			tasks.forEach(task => this.renderTaskItem(task, listContainer));
		} catch (error) {
			console.error('Error rendering task view', error);
			listContainer.empty();
			listContainer.createEl('div', { text: '加载任务时出错', cls: 'gantt-task-empty' });
		}
	}

	/**
	 * 渲染任务项
	 */
	private renderTaskItem(task: GanttTask, listContainer: HTMLElement): void {
		const taskItem = listContainer.createDiv('calendar-day-task-item');
		taskItem.addClass(task.completed ? 'completed' : 'pending');

		// 复选框
		this.createTaskCheckbox(task, taskItem);

		// 任务内容
		const cleaned = this.cleanTaskDescription(task.content);
		const gf = (this.plugin?.settings?.globalTaskFilter || '').trim();
		const displayText = this.plugin?.settings?.showGlobalFilterInTaskText && gf ? `${gf} ${cleaned}` : cleaned;
		taskItem.createEl('span', { text: displayText, cls: 'gantt-task-text' });

		// 优先级标记
		if (task.priority) {
			const priorityIcon = this.getPriorityIcon(task.priority);
			const priorityEl = taskItem.createDiv('gantt-task-priority-inline');
			priorityEl.createEl('span', { text: priorityIcon, cls: `gantt-priority-badge priority-${task.priority}` });
		}

		// 时间属性
		const timePropertiesEl = taskItem.createDiv('gantt-task-time-properties-inline');

		if (task.createdDate) {
			timePropertiesEl.createEl('span', { text: `创建:${this.formatDateForDisplay(task.createdDate)}`, cls: 'gantt-time-badge gantt-time-created' });
		}

		if (task.startDate) {
			timePropertiesEl.createEl('span', { text: `开始:${this.formatDateForDisplay(task.startDate)}`, cls: 'gantt-time-badge gantt-time-start' });
		}

		if (task.scheduledDate) {
			timePropertiesEl.createEl('span', { text: `计划:${this.formatDateForDisplay(task.scheduledDate)}`, cls: 'gantt-time-badge gantt-time-scheduled' });
		}

		if (task.dueDate) {
			const dueEl = taskItem.createEl('span', { text: `截止:${this.formatDateForDisplay(task.dueDate)}`, cls: 'gantt-time-badge gantt-time-due' });
			if (task.dueDate < new Date() && !task.completed) {
				dueEl.addClass('gantt-overdue');
			}
			timePropertiesEl.appendChild(dueEl);
		}

		if (task.cancelledDate) {
			timePropertiesEl.createEl('span', { text: `取消:${this.formatDateForDisplay(task.cancelledDate)}`, cls: 'gantt-time-badge gantt-time-cancelled' });
		}

		if (task.completionDate) {
			timePropertiesEl.createEl('span', { text: `完成:${this.formatDateForDisplay(task.completionDate)}`, cls: 'gantt-time-badge gantt-time-completion' });
		}

		// 文件位置
		taskItem.createEl('span', { text: `${task.fileName}:${task.lineNumber}`, cls: 'gantt-task-file' });

		// 警告图标
		if (task.warning) {
			taskItem.createEl('span', {
				text: '⚠️',
				cls: 'gantt-task-warning-icon',
				attr: { title: task.warning }
			});
		}

		// 点击打开文件
		taskItem.addEventListener('click', async () => {
			await this.openTaskFile(task);
		});
	}
}
