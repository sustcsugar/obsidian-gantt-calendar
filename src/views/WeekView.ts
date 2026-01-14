import { Notice, App } from 'obsidian';
import { BaseViewRenderer } from './BaseViewRenderer';
import { getWeekOfDate } from '../dateUtils/dateUtilsIndex';
import { updateTaskDateField } from '../tasks/taskUpdater';
import type { GCTask, SortState, StatusFilterState, TagFilterState } from '../types';
import { sortTasks } from '../tasks/taskSorter';
import { TaskCardComponent, WeekViewConfig } from '../components/TaskCard';
import { Logger } from '../utils/logger';
import { TooltipManager } from '../utils/tooltipManager';
import { WeekViewClasses } from '../utils/bem';

/**
 * 周视图渲染器
 */
export class WeekViewRenderer extends BaseViewRenderer {
	// 排序状态 - 默认优先级降序
	private sortState: SortState = { field: 'priority', order: 'desc' };

	// 设置前缀
	private readonly SETTINGS_PREFIX = 'weekView';

	constructor(app: App, plugin: any) {
		super(app, plugin);
		this.initializeFilterStates(this.SETTINGS_PREFIX);
		this.initializeSortState();
	}

	/**
	 * 初始化排序状态
	 */
	private initializeSortState(): void {
		const settings = this.plugin?.settings;
		if (!settings) return;

		const savedField = settings[`${this.SETTINGS_PREFIX}SortField`];
		const savedOrder = settings[`${this.SETTINGS_PREFIX}SortOrder`];
		if (savedField && savedOrder) {
			this.sortState = { field: savedField, order: savedOrder };
		}
	}

	/**
	 * 保存排序状态
	 */
	private async saveSortState(): Promise<void> {
		if (!this.plugin?.settings) return;
		this.plugin.settings[`${this.SETTINGS_PREFIX}SortField`] = this.sortState.field;
		this.plugin.settings[`${this.SETTINGS_PREFIX}SortOrder`] = this.sortState.order;
		await this.plugin.saveSettings();
	}

	public getSortState(): SortState {
		return this.sortState;
	}

	public setSortState(state: SortState): void {
		this.sortState = state;
		this.saveSortState().catch(err => {
			Logger.error('WeekView', 'Failed to save sort state', err);
		});
	}

	/**
	 * 重写状态筛选 setter 以支持持久化
	 */
	public setStatusFilterState(state: StatusFilterState): void {
		super.setStatusFilterState(state);
		this.saveStatusFilterState(this.SETTINGS_PREFIX).catch(err => {
			Logger.error('WeekView', 'Failed to save status filter', err);
		});
	}

	/**
	 * 重写标签筛选 setter 以支持持久化
	 */
	public setTagFilterState(state: TagFilterState): void {
		super.setTagFilterState(state);
		this.saveTagFilterState(this.SETTINGS_PREFIX).catch(err => {
			Logger.error('WeekView', 'Failed to save tag filter', err);
		});
	}

	render(container: HTMLElement, currentDate: Date): void {
		const weekData = getWeekOfDate(currentDate, currentDate.getFullYear(), !!(this.plugin?.settings?.startOnMonday));

		// 清空容器，避免重复渲染时嵌套
		container.empty();

		const weekContainer = container.createDiv('gc-view gc-view--week');
		const weekGrid = weekContainer.createDiv(WeekViewClasses.elements.grid);

		// 标题行
		const headerRow = weekGrid.createDiv(WeekViewClasses.elements.headerRow);
		weekData.days.forEach((day) => {
			const dayHeader = headerRow.createDiv(WeekViewClasses.elements.headerCell);
			const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
			dayHeader.createEl('div', { text: dayNames[day.weekday], cls: WeekViewClasses.elements.dayName });
			dayHeader.createEl('div', { text: day.day.toString(), cls: WeekViewClasses.elements.dayNumber });
			if (day.lunarText) {
				dayHeader.createEl('div', { text: day.lunarText, cls: WeekViewClasses.elements.lunarText });
			}
			if (day.isToday) {
				dayHeader.addClass(WeekViewClasses.modifiers.today);
			}
		});

		// 任务网格 - 七列
		const tasksGrid = weekGrid.createDiv(WeekViewClasses.elements.tasksGrid);
		weekData.days.forEach((day) => {
			const dayTasksColumn = tasksGrid.createDiv(WeekViewClasses.elements.tasksColumn);
			if (day.isToday) {
				dayTasksColumn.addClass(WeekViewClasses.modifiers.tasksColumnToday);
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
			// 应用状态筛选
			tasks = this.applyStatusFilter(tasks);
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
				columnContainer.createEl('div', { text: '暂无任务', cls: WeekViewClasses.elements.empty });
				return;
			}

			currentDayTasks.forEach(task => this.renderTaskItem(task, columnContainer, targetDate));
		} catch (error) {
			Logger.error('WeekView', 'Error loading week view tasks', error);
			columnContainer.createEl('div', { text: '加载出错', cls: WeekViewClasses.elements.empty });
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
				// 隐藏 tooltip
				const tooltipManager = TooltipManager.getInstance(this.plugin);
				tooltipManager.hide();
				// 刷新当前周视图 - 找到父级容器而不是当前的 view 元素
				const viewContainer = container.closest('.calendar-content') as HTMLElement;
				if (viewContainer) {
					this.render(viewContainer, new Date());
				}
			},
		}).render();
	}
}
