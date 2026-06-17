import { App } from 'obsidian';
import { BaseViewRenderer } from './BaseViewRenderer';
import { isToday, isThisWeek, isThisMonth } from '../dateUtils/dateUtilsIndex';
import type { IPluginContext,  GCTask, TagFilterState } from '../types';
import { getTaskDateField } from '../types';
import type { DateFieldType } from '../settings/types';
import { registerTaskContextMenu } from '../contextMenu/contextMenuIndex';
import { sortTasks } from '../tasks/taskSorter';
import { ViewClasses, withModifiers } from '../utils/bem';
import { TaskCardComponent, TaskViewConfig } from '../components/TaskCard';
import { Logger } from '../utils/logger';
import { i18n } from '../i18n/i18n';

/**
 * 任务视图渲染器
 */
export class TaskViewRenderer extends BaseViewRenderer {
	// 时间字段筛选
	private timeFieldFilter: 'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'completionDate' | 'cancelledDate' = 'dueDate';

	// 时间值筛选
	private timeValueFilter: Date | null = null;

	// 日期范围模式：全部/当天/当周/当月/自定义日期
	private dateRangeMode: 'all' | 'day' | 'week' | 'month' | 'custom' = 'week';

	// 任务列表容器缓存
	private taskListContainer: HTMLElement | null = null;

	constructor(app: App, plugin: IPluginContext) {
		super(app, plugin);
		// 从设置加载初始状态
		this.settingsPrefix = 'taskView';
		this.initializeFilterStates(this.settingsPrefix);
		this.initializeSortState({ field: 'dueDate', order: 'asc' });
		this.initializeTaskViewSpecificStates();
	}

	/**
	 * 初始化 TaskView 特有状态
	 */
	private initializeTaskViewSpecificStates(): void {
		const settings = this.plugin?.settings;
		if (!settings) return;

		if (settings.taskViewTimeFieldFilter) {
			this.timeFieldFilter = settings.taskViewTimeFieldFilter;
		}
		if (settings.taskViewDateRangeMode) {
			this.dateRangeMode = settings.taskViewDateRangeMode;
		}
	}

	/**
	 * 保存时间字段筛选
	 */
	private async saveTimeFieldFilter(): Promise<void> {
		if (!this.plugin?.settings) return;
		this.plugin.settings.taskViewTimeFieldFilter = this.timeFieldFilter;
		await this.plugin.saveSettings();
	}

	/**
	 * 保存日期范围模式
	 */
	private async saveDateRangeMode(): Promise<void> {
		if (!this.plugin?.settings) return;
		this.plugin.settings.taskViewDateRangeMode = this.dateRangeMode;
		await this.plugin.saveSettings();
	}

	// ===== Getter/Setter 方法 =====

	public getTimeFilterField(): 'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'completionDate' | 'cancelledDate' {
		return this.timeFieldFilter;
	}

	public setTimeFilterField(value: any): void {
		this.timeFieldFilter = value;
		this.saveTimeFieldFilter().catch(err => {
			Logger.error('TaskView', 'Failed to save time field filter', err);
		});
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
		this.saveDateRangeMode().catch(err => {
			Logger.error('TaskView', 'Failed to save date range mode', err);
		});
	}

	render(container: HTMLElement, currentDate: Date): void {
		// 创建任务视图容器
		const taskRoot = container.createDiv(withModifiers(ViewClasses.block, ViewClasses.modifiers.task));

		this.taskListContainer = taskRoot;
		this.loadTaskList(taskRoot);
	}

	/**
	 * 增量刷新：只重新加载任务内容，不重建DOM
	 */
	public refreshTasks(): void {
		this.refreshTaskList();
	}

	/**
	 * 只刷新任务列表，不重新创建整个视图
	 * 用于筛选条件变化时更新显示
	 */
	public refreshTaskList(): void {
		if (this.taskListContainer) {
			this.loadTaskList(this.taskListContainer);
		}
	}

	/**
	 * 加载任务列表
	 */
	private async loadTaskList(listContainer: HTMLElement): Promise<void> {
		listContainer.empty();
		listContainer.createEl('div', { text: i18n.t('common.loading'), cls: 'gantt-task-empty' });

		try {
			let tasks: GCTask[] = this.plugin.taskCache.getAllTasks();

			// 应用状态筛选（使用基类方法）
			tasks = this.applyStatusFilter(tasks);

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
					const dateValue = getTaskDateField(task, this.timeFieldFilter);
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
				listContainer.createEl('div', { text: i18n.t('views.taskView.noTasks'), cls: 'gantt-task-empty' });
				return;
			}

			tasks.forEach(task => this.renderTaskItem(task, listContainer));
		} catch (error) {
			Logger.error('TaskView', 'Error rendering task view', error);
			listContainer.empty();
			listContainer.createEl('div', { text: i18n.t('views.taskView.loadError'), cls: 'gantt-task-empty' });
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
