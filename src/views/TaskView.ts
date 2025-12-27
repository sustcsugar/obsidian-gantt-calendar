import { BaseCalendarRenderer } from './BaseCalendarRenderer';
import { isToday, isThisWeek, isThisMonth } from '../dateUtils/dateUtilsIndex';
import type { GanttTask, SortState } from '../types';
import { registerTaskContextMenu } from '../contextMenu/contextMenuIndex';
import { sortTasks } from '../tasks/taskSorter';
import { DEFAULT_SORT_STATE } from '../types';

/**
 * 任务视图渲染器
 */
export class TaskViewRenderer extends BaseCalendarRenderer {
	// 任务筛选状态
	private taskFilter: 'all' | 'completed' | 'uncompleted' = 'all';
	
	// 时间字段筛选
	private timeFieldFilter: 'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'completionDate' | 'cancelledDate' = 'dueDate';
	
	// 时间值筛选
	private timeValueFilter: Date | null = null;
    
	// 日期范围模式：全部/当天/当周/当月/自定义日期
	private dateRangeMode: 'all' | 'day' | 'week' | 'month' | 'custom' = 'week';

	// 排序状态
	private sortState: SortState = DEFAULT_SORT_STATE;

	// ===== Getter/Setter 方法 =====

	public getTaskFilter(): 'all' | 'completed' | 'uncompleted' {
		return this.taskFilter;
	}

	public setTaskFilter(value: 'all' | 'completed' | 'uncompleted'): void {
		this.taskFilter = value;
	}

	public getTimeFilterField(): 'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'completionDate' | 'cancelledDate' {
		return this.timeFieldFilter;
	}

	public setTimeFilterField(value: any): void {
		this.timeFieldFilter = value;
	}

	public getSpecificDate(): Date | null {
		return this.timeValueFilter;
	}

	public setSpecificDate(date: Date | null): void {
		this.timeValueFilter = date;
	}
    
	public getDateRangeMode(): 'all' | 'day' | 'week' | 'month' | 'custom' {
		return this.dateRangeMode;
	}
    
	public setDateRangeMode(mode: 'all' | 'day' | 'week' | 'month' | 'custom'): void {
		this.dateRangeMode = mode;
	}

	public getSortState(): SortState {
		return this.sortState;
	}

	public setSortState(state: SortState): void {
		this.sortState = state;
	}

	/**
	 * 创建状态筛选组（在工具栏右侧功能区调用）
	 */
	public createStatusFilterGroup(container: HTMLElement, onFilterChange: () => void): void {
		const statusFilterGroup = container.createDiv('toolbar-right-task-status-group');
		const statusLabel = statusFilterGroup.createEl('span', { text: '状态', cls: 'toolbar-right-task-status-label' });
		
		const statusSelect = statusFilterGroup.createEl('select', { cls: 'toolbar-right-task-status-select' });
		statusSelect.innerHTML = `
			<option value="all">全部</option>
			<option value="uncompleted">未完成</option>
			<option value="completed">已完成</option>
		`;
		statusSelect.value = this.taskFilter;
		statusSelect.addEventListener('change', (e) => {
			const value = (e.target as HTMLSelectElement).value as 'all' | 'completed' | 'uncompleted';
			this.setTaskFilter(value);
			onFilterChange();
		});
	}

	render(container: HTMLElement, currentDate: Date): void {
		// 在 calendar-content 内创建子容器作为任务视图根节点
		const taskRoot = container.createDiv('gc-view gc-view--list');

		const listContainer = taskRoot.createDiv('gc-view--list .gc-list-view__list');

		this.loadTaskList(listContainer);
	}

	/**
	 * 加载任务列表
	 */
	private async loadTaskList(listContainer: HTMLElement): Promise<void> {
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

		// 旧的单日精确筛选已被统一的日期范围模式取代
        
		// 日期范围筛选
		const mode = this.getDateRangeMode();
		if (mode !== 'all') {
			const ref = this.timeValueFilter ?? new Date();
			const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
			const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
			const startOfWeek = (d: Date) => { const x = startOfDay(d); const day = x.getDay(); const diff = (day + 6) % 7; x.setDate(x.getDate() - diff); return x; };
			const endOfWeek = (d: Date) => { const s = startOfWeek(d); const e = new Date(s); e.setDate(s.getDate() + 6); e.setHours(23,59,59,999); return e; };
			const startOfMonth = (d: Date) => { const x = startOfDay(d); x.setDate(1); return x; };
			const endOfMonth = (d: Date) => { const x = startOfDay(d); x.setMonth(x.getMonth()+1, 0); x.setHours(23,59,59,999); return x; };

			let rangeStart: Date;
			let rangeEnd: Date;
			if (mode === 'day' || mode === 'custom') {
				rangeStart = startOfDay(ref);
				rangeEnd = endOfDay(ref);
			} else if (mode === 'week') {
				rangeStart = startOfWeek(ref);
				rangeEnd = endOfWeek(ref);
			} else { // month
				rangeStart = startOfMonth(ref);
				rangeEnd = endOfMonth(ref);
			}

			tasks = tasks.filter(task => {
				const dateValue = (task as any)[this.timeFieldFilter];
				if (!dateValue) return false;
				const taskDate = new Date(dateValue);
				if (isNaN(taskDate.getTime())) return false;
				return taskDate >= rangeStart && taskDate <= rangeEnd;
			});
		}

		// 应用标签筛选
		tasks = this.applyTagFilter(tasks);

		// 应用排序
		tasks = sortTasks(tasks, this.sortState);

		listContainer.empty();

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
		const taskItem = listContainer.createDiv('calendar-task-card');
		taskItem.addClass('calendar-task-card--task');
		taskItem.addClass(task.completed ? 'completed' : 'pending');

		// 应用状态颜色
		this.applyStatusColors(task, taskItem);

		// 复选框
		this.createTaskCheckbox(task, taskItem);

		// 任务内容
		const cleaned = task.description;
		const gf = (this.plugin?.settings?.globalTaskFilter || '').trim();
		const displayText = this.plugin?.settings?.showGlobalFilterInTaskText && gf ? `${gf} ${cleaned}` : cleaned;
		
		// 使用富文本渲染支持链接（统一文本类名）
		const taskTextEl = taskItem.createDiv('gc-task-card__text');
		if (this.plugin?.settings?.showGlobalFilterInTaskText && gf) {
			taskTextEl.appendText(gf + ' ');
		}
		this.renderTaskDescriptionWithLinks(taskTextEl, cleaned);

		// 渲染标签（在描述之后、优先级之前）
		this.renderTaskTags(task, taskItem);

		// 优先级标记（统一优先级类名）
		if (task.priority) {
			const priorityIcon = this.getPriorityIcon(task.priority);
			const priorityEl = taskItem.createDiv('gc-task-card__priority');
			priorityEl.createEl('span', { text: priorityIcon, cls: `gc-task-card__priority-badge priority-${task.priority}` });
		}

		// 时间属性（统一类名）
		const timePropertiesEl = taskItem.createDiv('gc-task-card__times');

		if (task.createdDate) {
			timePropertiesEl.createEl('span', { text: `创建:${this.formatDateForDisplay(task.createdDate)}`, cls: 'gc-task-card__time-badge gc-task-card__time-badge--created' });
		}

		if (task.startDate) {
			timePropertiesEl.createEl('span', { text: `开始:${this.formatDateForDisplay(task.startDate)}`, cls: 'gc-task-card__time-badge gc-task-card__time-badge--start' });
		}

		if (task.scheduledDate) {
			timePropertiesEl.createEl('span', { text: `计划:${this.formatDateForDisplay(task.scheduledDate)}`, cls: 'gc-task-card__time-badge gc-task-card__time-badge--scheduled' });
		}

		if (task.dueDate) {
			const dueEl = taskItem.createEl('span', { text: `截止:${this.formatDateForDisplay(task.dueDate)}`, cls: 'gc-task-card__time-badge gc-task-card__time-badge--due' });
			if (task.dueDate < new Date() && !task.completed) {
				dueEl.addClass('gc-task-card__time-badge--overdue');
			}
			timePropertiesEl.appendChild(dueEl);
		}

		if (task.cancelledDate) {
			timePropertiesEl.createEl('span', { text: `取消:${this.formatDateForDisplay(task.cancelledDate)}`, cls: 'gc-task-card__time-badge gc-task-card__time-badge--cancelled' });
		}

		if (task.completionDate) {
			timePropertiesEl.createEl('span', { text: `完成:${this.formatDateForDisplay(task.completionDate)}`, cls: 'gc-task-card__time-badge gc-task-card__time-badge--completion' });
		}

		// 文件位置（统一类名）
		taskItem.createEl('span', { text: `${task.fileName}:${task.lineNumber}`, cls: 'gc-task-card__file' });

		// 警告图标（统一类名）
		if (task.warning) {
			taskItem.createEl('span', {
				text: '⚠️',
				cls: 'gc-task-card__warning',
				attr: { title: task.warning }
			});
		}

		// 点击打开文件
		taskItem.addEventListener('click', async () => {
			await this.openTaskFile(task);
		});

		// 注册右键菜单
		const enabledFormats = this.plugin.settings.enabledTaskFormats || ['tasks'];
		const taskNotePath = this.plugin.settings.taskNotePath || 'Tasks';
		registerTaskContextMenu(
			taskItem,
			task,
			this.app,
			enabledFormats,
			taskNotePath,
			() => {
				// 刷新任务列表
				this.loadTaskList(listContainer);
			}
		);
	}
}
