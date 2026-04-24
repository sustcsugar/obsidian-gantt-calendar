import { Notice, App } from 'obsidian';
import { BaseViewRenderer } from './BaseViewRenderer';
import { getWeekOfDate } from '../dateUtils/dateUtilsIndex';
import { updateTaskDateField } from '../tasks/taskUpdater';
import type { GCTask, SortState, StatusFilterState, TagFilterState, CalendarDay } from '../types';
import { sortTasks } from '../tasks/taskSorter';
import { TaskCardComponent, WeekViewConfig, type TaskCardConfig } from '../components/TaskCard';
import { Logger } from '../utils/logger';
import { TooltipManager } from '../utils/tooltipManager';
import { WeekViewClasses } from '../utils/bem';
import { toISOStringLocal, createDate } from '../dateUtils/timezone';
import { generateVirtualInstances } from '../tasks/virtualTaskGenerator';

/**
 * 周视图渲染器
 */
export class WeekViewRenderer extends BaseViewRenderer {
	// 排序状态 - 默认优先级降序
	private sortState: SortState = { field: 'priority', order: 'desc' };

	// 设置前缀
	private readonly SETTINGS_PREFIX = 'weekView';

	// 时间轴专用配置（启用拖拽）
	private timelineTaskConfig: TaskCardConfig = {
		...WeekViewConfig,
		enableDrag: true,
	};

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

	/**
	 * 检测周内是否有带时间精度的任务
	 */
	private hasTimedTasks(tasks: GCTask[], weekStart: Date, weekEnd: Date): boolean {
		const dateField = this.plugin.settings.dateFilterField || 'dueDate';
		for (const task of tasks) {
			const precision = task.datePrecision?.[dateField as keyof NonNullable<typeof task.datePrecision>];
			if (precision === 'time') {
				const dateValue = (task as any)[dateField];
				if (dateValue) {
					const taskDate = new Date(dateValue);
					if (!isNaN(taskDate.getTime())) {
						taskDate.setHours(0, 0, 0, 0);
						if (taskDate.getTime() >= weekStart.getTime() && taskDate.getTime() <= weekEnd.getTime()) {
							return true;
						}
					}
				}
			}
		}
		return false;
	}

	render(container: HTMLElement, currentDate: Date): void {
		const weekData = getWeekOfDate(currentDate, currentDate.getFullYear(), !!(this.plugin?.settings?.startOnMonday));

		// 清空容器，避免重复渲染时嵌套
		container.empty();

		const weekContainer = container.createDiv('gc-view gc-view--week');
		const weekGrid = weekContainer.createDiv(WeekViewClasses.elements.grid);

		const dateField = this.plugin.settings.dateFilterField || 'dueDate';
		const weekStart = new Date(weekData.days[0].date);
		weekStart.setHours(0, 0, 0, 0);
		const weekEnd = new Date(weekData.days[6].date);
		weekEnd.setHours(0, 0, 0, 0);

		// 预先检测是否需要时间轴模式
		const allRealTasks = this.applyTagFilter(
			this.applyStatusFilter(this.plugin.taskCache.getAllTasks())
		);
		const useTimeline = this.hasTimedTasks(allRealTasks, weekStart, weekEnd);

		if (useTimeline) {
			weekContainer.addClass(WeekViewClasses.modifiers.timeline);
		}

		// 标题行
		const headerRow = weekGrid.createDiv(WeekViewClasses.elements.headerRow);
		if (useTimeline) {
			// 时间轴模式下添加左侧占位单元格
			headerRow.createDiv(WeekViewClasses.elements.headerSpacer);
		}
		const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
		weekData.days.forEach((day) => {
			const dayHeader = headerRow.createDiv(WeekViewClasses.elements.headerCell);
			dayHeader.createEl('div', { text: dayNames[day.weekday], cls: WeekViewClasses.elements.dayName });
			dayHeader.createEl('div', { text: day.day.toString(), cls: WeekViewClasses.elements.dayNumber });
			if (day.lunarText) {
				dayHeader.createEl('div', { text: day.lunarText, cls: WeekViewClasses.elements.lunarText });
			}
			if (day.isToday) {
				dayHeader.addClass(WeekViewClasses.modifiers.today);
			}
		});

		// 任务网格
		const tasksGrid = weekGrid.createDiv(WeekViewClasses.elements.tasksGrid);

		// 预生成整周的虚拟周期实例
		const allVirtualInstances = generateVirtualInstances(
			allRealTasks, weekStart, weekEnd, dateField, this.plugin.settings.recurringTaskDisplayLimit ?? 5
		);

		if (useTimeline) {
			this.renderTimelineLayout(tasksGrid, weekData, allRealTasks, allVirtualInstances, dateField);
		} else {
			this.renderFlatLayout(tasksGrid, weekData, allVirtualInstances);
		}
	}

	/**
	 * 渲染扁平列表布局（无定时任务时使用）
	 */
	private renderFlatLayout(
		tasksGrid: HTMLElement,
		weekData: { days: CalendarDay[] },
		allVirtualInstances: GCTask[]
	): void {
		weekData.days.forEach((day) => {
			const dayTasksColumn = tasksGrid.createDiv(WeekViewClasses.elements.tasksColumn);
			dayTasksColumn.dataset.date = toISOStringLocal(day.date);
			if (day.isToday) {
				dayTasksColumn.addClass(WeekViewClasses.modifiers.tasksColumnToday);
			}

			this.loadWeekViewTasks(dayTasksColumn, day.date, allVirtualInstances);
			this.setupDragDropForColumn(dayTasksColumn, day.date);
		});
	}

	/**
	 * 渲染时间轴布局（有定时任务时使用）
	 */
	private renderTimelineLayout(
		tasksGrid: HTMLElement,
		weekData: { days: CalendarDay[] },
		allRealTasks: GCTask[],
		allVirtualInstances: GCTask[],
		dateField: string
	): void {
		const W = WeekViewClasses;

		// 左侧时间标尺
		const timeGutter = tasksGrid.createDiv(W.elements.timeGutter);
		for (let h = 0; h <= 23; h++) {
			const gutterSlot = timeGutter.createDiv(W.elements.timeGutterSlot);
			gutterSlot.createDiv(W.elements.timeGutterLabel)
				.setText(`${String(h).padStart(2, '0')}:00`);
		}

		// 七列日期列
		weekData.days.forEach((day) => {
			const dayColumn = tasksGrid.createDiv(W.elements.tasksColumn);
			dayColumn.dataset.date = toISOStringLocal(day.date);
			if (day.isToday) {
				dayColumn.addClass(W.modifiers.tasksColumnToday);
			}

			// 为每列创建 24 个时间格
			for (let h = 0; h <= 23; h++) {
				const slot = dayColumn.createDiv(W.elements.timeSlot);
				slot.createDiv(W.elements.timeTasks);

				// 设置时间格的拖放功能
				this.setupDragDropForTimeSlot(slot, h, day.date, tasksGrid);
			}

			// 填充任务到对应时间格
			this.loadWeekViewTimelineTasks(dayColumn, day.date, allRealTasks, allVirtualInstances, dateField);
		});
	}

	/**
	 * 加载周视图时间轴任务（将任务分配到对应时间格）
	 */
	private loadWeekViewTimelineTasks(
		dayColumn: HTMLElement,
		targetDate: Date,
		allRealTasks: GCTask[],
		allVirtualInstances: GCTask[],
		dateField: string
	): void {
		const normalizedTarget = new Date(targetDate);
		normalizedTarget.setHours(0, 0, 0, 0);

		// 筛选当天任务
		let currentDayTasks = allRealTasks.filter(task => {
			const dateValue = (task as any)[dateField];
			if (!dateValue) return false;
			const taskDate = new Date(dateValue);
			if (isNaN(taskDate.getTime())) return false;
			taskDate.setHours(0, 0, 0, 0);
			return taskDate.getTime() === normalizedTarget.getTime();
		});

		// 添加虚拟周期实例
		const virtualForDay = allVirtualInstances.filter(task => {
			const dateValue = (task as any)[dateField];
			if (!dateValue) return false;
			const taskDate = new Date(dateValue);
			if (isNaN(taskDate.getTime())) return false;
			taskDate.setHours(0, 0, 0, 0);
			return taskDate.getTime() === normalizedTarget.getTime();
		});

		currentDayTasks = [...currentDayTasks, ...virtualForDay];
		currentDayTasks = sortTasks(currentDayTasks, this.sortState);

		// 构建 hour -> tasks 映射
		const tasksByHour: Map<number, GCTask[]> = new Map();
		for (const task of currentDayTasks) {
			const precision = task.datePrecision?.[dateField as keyof NonNullable<typeof task.datePrecision>];
			let hour = 0;
			if (precision === 'time') {
				const dateValue = (task as any)[dateField];
				if (dateValue instanceof Date) {
					hour = dateValue.getHours();
				} else if (dateValue) {
					hour = new Date(dateValue).getHours();
				}
			}
			if (!tasksByHour.has(hour)) tasksByHour.set(hour, []);
			tasksByHour.get(hour)!.push(task);
		}

		// 填充时间格
		const W = WeekViewClasses;
		const slotClassName = W.elements.timeSlot.split(' ').pop()!;
		const timeTasksClassName = W.elements.timeTasks.split(' ').pop()!;
		const slots = dayColumn.querySelectorAll(`.${slotClassName}`);

		for (let h = 0; h <= 23; h++) {
			const slot = slots[h] as HTMLElement;
			if (!slot) continue;
			const tasksContainer = slot.querySelector(`.${timeTasksClassName}`) as HTMLElement;
			if (!tasksContainer) continue;

			const hourTasks = tasksByHour.get(h) || [];
			hourTasks.forEach(task => {
				this.renderTimelineTaskItem(task, tasksContainer, targetDate);
			});
		}
	}

	/**
	 * 渲染时间轴任务项（启用拖拽）
	 */
	private renderTimelineTaskItem(task: GCTask, container: HTMLElement, targetDate: Date): void {
		new TaskCardComponent({
			task,
			config: this.timelineTaskConfig,
			container,
			app: this.app,
			plugin: this.plugin,
			targetDate,
			onClick: (task) => {
				const tooltipManager = TooltipManager.getInstance(this.plugin);
				tooltipManager.hide();
				this.refreshTasks();
			},
		}).render();
	}

	/**
	 * 设置时间格的拖放功能
	 */
	private setupDragDropForTimeSlot(slot: HTMLElement, hour: number, targetDate: Date, tasksGrid: HTMLElement): void {
		slot.addEventListener('dragover', (e: DragEvent) => {
			e.preventDefault();
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}
			slot.addClass(WeekViewClasses.modifiers.dragOver);
		});

		slot.addEventListener('dragleave', (e: DragEvent) => {
			if (e.target === slot) {
				slot.removeClass(WeekViewClasses.modifiers.dragOver);
			}
		});

		slot.addEventListener('drop', async (e: DragEvent) => {
			e.preventDefault();
			slot.removeClass(WeekViewClasses.modifiers.dragOver);

			const taskId = e.dataTransfer?.getData('taskId');
			if (!taskId) return;

			const [filePath, lineNum] = taskId.split(':');
			const lineNumber = parseInt(lineNum, 10);

			const allTasks = this.plugin.taskCache.getAllTasks();
			const sourceTask = allTasks.find((t: GCTask) => t.filePath === filePath && t.lineNumber === lineNumber);
			if (!sourceTask) {
				Logger.error('WeekView', 'Source task not found:', taskId);
				return;
			}

			const dateFieldName = this.plugin.settings.dateFilterField || 'dueDate';

			try {
				this.clearTaskTooltips();

				// 构建新的日期时间：目标日期 + 新的小时
				const newDate = new Date(targetDate);
				newDate.setHours(hour, 0, 0, 0);

				// 更新 datePrecision 为 time（拖拽到时间格表示设定了时间）
				sourceTask.datePrecision = { ...sourceTask.datePrecision, [dateFieldName]: 'time' };

				await updateTaskDateField(
					this.app,
					sourceTask,
					dateFieldName,
					newDate,
					this.plugin.settings.enabledTaskFormats
				);

				Logger.debug('WeekView', 'Task time updated via drag-drop', { taskId, hour, targetDate });
			} catch (error) {
				Logger.error('WeekView', 'Error updating task time:', error);
				new Notice('更新任务时间失败');
			}
		});
	}

	/**
	 * 增量刷新：只重新加载任务内容，不重建DOM
	 */
	public refreshTasks(): void {
		const container = document.querySelector('.gc-view.gc-view--week') as HTMLElement;
		if (!container) return;

		const isTimeline = container.classList.contains(WeekViewClasses.modifiers.timeline);

		if (isTimeline) {
			// 时间轴模式需要完全重新渲染
			const viewContainer = container.parentElement;
			if (viewContainer) {
				this.render(viewContainer, this.plugin.calendarView?.getCurrentDate?.() || new Date());
			}
		} else {
			// 扁平列表模式增量刷新
			const taskColumns = container.querySelectorAll('.gc-week-view__tasks-column');
			taskColumns.forEach((column) => {
				const dateStr = (column as HTMLElement).dataset.date;
				if (dateStr) {
					const date = createDate(dateStr);
					this.loadWeekViewTasks(column as HTMLElement, date);
				}
			});
		}
	}

	/**
	 * 设置列的拖放功能（扁平列表模式）
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
	 * 加载周视图任务（扁平列表模式）
	 */
	private async loadWeekViewTasks(
		columnContainer: HTMLElement,
		targetDate: Date,
		precomputedVirtualInstances?: GCTask[]
	): Promise<void> {
		columnContainer.empty();

		try {
			let tasks: GCTask[] = this.plugin.taskCache.getAllTasks();
			tasks = this.applyStatusFilter(tasks);
			tasks = this.applyTagFilter(tasks);
			const dateField = this.plugin.settings.dateFilterField || 'dueDate';

			const normalizedTarget = new Date(targetDate);
			normalizedTarget.setHours(0, 0, 0, 0);

			let currentDayTasks = tasks.filter(task => {
				const dateValue = (task as any)[dateField];
				if (!dateValue) return false;
				const taskDate = new Date(dateValue);
				if (isNaN(taskDate.getTime())) return false;
				taskDate.setHours(0, 0, 0, 0);
				return taskDate.getTime() === normalizedTarget.getTime();
			});

			let virtualForDay: GCTask[] = [];
			if (precomputedVirtualInstances) {
				virtualForDay = precomputedVirtualInstances.filter(task => {
					const dateValue = (task as any)[dateField];
					if (!dateValue) return false;
					const taskDate = new Date(dateValue);
					if (isNaN(taskDate.getTime())) return false;
					taskDate.setHours(0, 0, 0, 0);
					return taskDate.getTime() === normalizedTarget.getTime();
				});
			} else {
				const dayStart = new Date(normalizedTarget);
				const dayEnd = new Date(normalizedTarget);
				virtualForDay = generateVirtualInstances(tasks, dayStart, dayEnd, dateField, this.plugin.settings.recurringTaskDisplayLimit ?? 5);
			}

			currentDayTasks = [...currentDayTasks, ...virtualForDay];
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
	 * 渲染周视图任务项（扁平列表模式，使用统一组件）
	 */
	private renderTaskItem(task: GCTask, container: HTMLElement, targetDate: Date): void {
		const config = {
			...WeekViewConfig,
			showCheckbox: this.plugin.settings.weekViewShowCheckbox,
			showTags: this.plugin.settings.weekViewShowTags,
			showPriority: this.plugin.settings.weekViewShowPriority,
			showTicktick: this.plugin.settings.weekViewShowTicktick,
		};

		new TaskCardComponent({
			task,
			config,
			container,
			app: this.app,
			plugin: this.plugin,
			targetDate,
			onClick: (task) => {
				const tooltipManager = TooltipManager.getInstance(this.plugin);
				tooltipManager.hide();
				this.refreshTasks();
			},
		}).render();
	}
}
