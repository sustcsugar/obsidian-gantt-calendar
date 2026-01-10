import { BaseViewRenderer } from './BaseViewRenderer';
import { isToday, isThisWeek, isThisMonth } from '../dateUtils/dateUtilsIndex';
import type { GCTask, SortState } from '../types';
import { registerTaskContextMenu } from '../contextMenu/contextMenuIndex';
import { sortTasks } from '../tasks/taskSorter';
import { DEFAULT_SORT_STATE } from '../types';
import { ViewClasses, withModifiers } from '../utils/bem';
import { TaskCardComponent, TaskViewConfig } from '../components/TaskCard';

/**
 * 任务视图渲染器
 */
export class TaskViewRenderer extends BaseViewRenderer {
	// 性能优化：当前渲染周期的任务缓存
	private currentRenderTasks: GCTask[] | null = null;

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
		// 性能优化：在渲染开始时获取所有任务并缓存
		this.currentRenderTasks = this.plugin.taskCache.getAllTasks();

		// 创建任务视图容器
		const taskRoot = container.createDiv(withModifiers(ViewClasses.block, ViewClasses.modifiers.task));

		this.loadTaskList(taskRoot);

		// 渲染完成后清空缓存
		this.currentRenderTasks = null;
	}

	/**
	 * 加载任务列表
	 */
	private async loadTaskList(listContainer: HTMLElement): Promise<void> {
		listContainer.empty();
		listContainer.createEl('div', { text: '加载中...', cls: 'gantt-task-empty' });

		try {
			// 性能优化：使用缓存的任务列表，避免重复调用 getAllTasks()
			let tasks: GCTask[] = this.currentRenderTasks || this.plugin.taskCache.getAllTasks();

			// 应用完成状态筛选
			if (this.taskFilter === 'completed') {
				tasks = tasks.filter(t => t.completed);
			} else if (this.taskFilter === 'uncompleted') {
				tasks = tasks.filter(t => !t.completed);
			}

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
	 * 渲染任务项（使用统一组件）
	 */
	private renderTaskItem(task: GCTask, listContainer: HTMLElement): void {
		new TaskCardComponent({
			task,
			config: TaskViewConfig,
			container: listContainer,
			app: this.app,
			plugin: this.plugin,
			onClick: (task) => {
				// 刷新任务列表
				this.loadTaskList(listContainer);
			},
		}).render();
	}
}
