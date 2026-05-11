import { Notice, App, setIcon } from 'obsidian';
import { BaseViewRenderer } from './BaseViewRenderer';
import { getWeekOfDate } from '../dateUtils/dateUtilsIndex';
import { updateTaskDateField } from '../tasks/taskUpdater';
import { CreateTaskModal } from '../modals/CreateTaskModal';
import type { IPluginContext,  GCTask, TagFilterState, CalendarDay } from '../types';
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
	// 时间轴模式持久化标志（一旦激活，会话内保持）
	private timelineActive: boolean = false;

	// 当前渲染日期（供 refreshTasks 使用）
	private currentDate: Date = new Date();

	// 当前拖拽悬停行的行元素数组（用于清除上一行的高亮）
	private dragOverRowEls: HTMLElement[] | null = null;

	// 时间轴专用配置（启用拖拽）
	private timelineTaskConfig: TaskCardConfig = {
		...WeekViewConfig,
		enableDrag: true,
	};

	constructor(app: App, plugin: IPluginContext) {
		super(app, plugin);
		this.settingsPrefix = 'weekView';
		this.initializeFilterStates(this.settingsPrefix);
		this.initializeSortState({ field: 'priority', order: 'desc' });
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
		const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

		// 清空容器
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
		const hasTimed = this.hasTimedTasks(allRealTasks, weekStart, weekEnd);
		if (hasTimed) this.timelineActive = true;
		const useTimeline = this.timelineActive;

		// 保存当前渲染日期
		this.currentDate = new Date(currentDate);

		// 预生成整周的虚拟周期实例
		const allVirtualInstances = generateVirtualInstances(
			allRealTasks, weekStart, weekEnd, dateField, this.plugin.settings.recurringTaskDisplayLimit ?? 5
		);

		if (useTimeline) {
			weekContainer.addClass(WeekViewClasses.modifiers.timeline);
			this.renderTimelineMode(weekGrid, weekData, dayNames, allRealTasks, allVirtualInstances, dateField);
		} else {
			this.renderFlatMode(weekGrid, weekData, dayNames, allVirtualInstances);
		}
	}

	/**
	 * 渲染时间轴模式：header、时间标尺、任务格全部放在同一个 grid 中
	 */
	private renderTimelineMode(
		weekGrid: HTMLElement,
		weekData: { days: CalendarDay[] },
		dayNames: string[],
		allRealTasks: GCTask[],
		allVirtualInstances: GCTask[],
		dateField: string
	): void {
		const W = WeekViewClasses;

		// 所有内容放在同一个 tasksGrid 中（单一 grid 保证对齐）
		const tasksGrid = weekGrid.createDiv(W.elements.tasksGrid);

		// === 第一行：header（sticky） ===
		const spacer = tasksGrid.createDiv(W.elements.headerSpacer);
			spacer.style.gridColumn = '1';
			spacer.style.gridRow = '1';

		weekData.days.forEach((day, dayIdx) => {
			const dayHeader = tasksGrid.createDiv(W.elements.headerCell);
			dayHeader.style.gridColumn = `${dayIdx + 2}`;
			dayHeader.style.gridRow = '1';
			dayHeader.createEl('div', { text: dayNames[day.weekday], cls: W.elements.dayName });
			dayHeader.createEl('div', { text: day.day.toString(), cls: W.elements.dayNumber });
			if (day.lunarText && this.plugin.settings.showLunar) {
				dayHeader.createEl('div', { text: day.lunarText, cls: W.elements.lunarText });
			}
			if (day.isToday) {
				dayHeader.addClass(W.modifiers.today);
			}
		});

		// === 第 2-25 行：时间标尺 + 七列时间格 ===
		// 保存每列每小时的任务容器引用
		const slotContainers: HTMLElement[][] = [];
		// 保存每行所有元素的引用（用于整行高亮）
		const rowElements: HTMLElement[][] = [];

		// === 第 2 行：全天任务行 ===
		const alldayGutter = tasksGrid.createDiv(W.elements.alldayGutter);
		alldayGutter.style.gridColumn = '1';
		alldayGutter.style.gridRow = '2';
		alldayGutter.setText('全天');

		const alldaySlotContainers: HTMLElement[] = [];
		const alldayRowElements: HTMLElement[] = [alldayGutter];

		weekData.days.forEach((day, dayIdx) => {
			const alldaySlot = tasksGrid.createDiv(W.elements.alldaySlot);
			alldaySlot.style.gridColumn = `${dayIdx + 2}`;
			alldaySlot.style.gridRow = '2';
			const alldayTasksEl = alldaySlot.createDiv(W.elements.alldayTasks);
			alldaySlotContainers[dayIdx] = alldayTasksEl;
			alldayRowElements.push(alldaySlot);
			this.setupDragDropForAlldaySlot(alldaySlot, day.date, alldayRowElements);
		});

		// 时间标尺（第 1 列，第 3-26 行）
		for (let h = 0; h <= 23; h++) {
			const gutterSlot = tasksGrid.createDiv(W.elements.timeGutterSlot);
			gutterSlot.style.gridColumn = '1';
			gutterSlot.style.gridRow = `${h + 3}`;
			gutterSlot.createDiv(W.elements.timeGutterLabel)
				.setText(`${String(h).padStart(2, '0')}:00`);
			rowElements[h] = [gutterSlot];
		}

		// 七列时间格（第 2-8 列）
		weekData.days.forEach((day, dayIdx) => {
			slotContainers[dayIdx] = [];
			for (let h = 0; h <= 23; h++) {
				const slot = tasksGrid.createDiv(W.elements.timeSlot);
				slot.style.gridColumn = `${dayIdx + 2}`;
				slot.style.gridRow = `${h + 3}`;
				const tasksEl = slot.createDiv(W.elements.timeTasks);
				slotContainers[dayIdx][h] = tasksEl;
				rowElements[h].push(slot);

				this.setupDragDropForTimeSlot(slot, h, day.date, rowElements[h]);
			}
		});

		// 填充任务到对应时间格
		weekData.days.forEach((day, dayIdx) => {
			this.populateTimelineSlots(
				slotContainers[dayIdx], alldaySlotContainers[dayIdx], day.date, allRealTasks, allVirtualInstances, dateField
			);
		});

		// 空时间格添加 "+" 快速创建
		weekData.days.forEach((day, dayIdx) => {
			for (let h = 0; h <= 23; h++) {
				const tasksEl = slotContainers[dayIdx][h];
				if (tasksEl.children.length === 0) {
					const slot = tasksEl.parentElement as HTMLElement;
					this.setupQuickCreateForSlot(slot, h, day.date);
				}
			}
		});
	}

	/**
	 * 渲染扁平列表模式（无定时任务时使用）
	 */
	private renderFlatMode(
		weekGrid: HTMLElement,
		weekData: { days: CalendarDay[] },
		dayNames: string[],
		allVirtualInstances: GCTask[]
	): void {
		const W = WeekViewClasses;

		// 标题行
		const headerRow = weekGrid.createDiv(W.elements.headerRow);
		weekData.days.forEach((day) => {
			const dayHeader = headerRow.createDiv(W.elements.headerCell);
			dayHeader.createEl('div', { text: dayNames[day.weekday], cls: W.elements.dayName });
			dayHeader.createEl('div', { text: day.day.toString(), cls: W.elements.dayNumber });
			if (day.lunarText && this.plugin.settings.showLunar) {
				dayHeader.createEl('div', { text: day.lunarText, cls: W.elements.lunarText });
			}
			if (day.isToday) {
				dayHeader.addClass(W.modifiers.today);
			}
		});

		// 任务网格
		const tasksGrid = weekGrid.createDiv(W.elements.tasksGrid);
		weekData.days.forEach((day) => {
			const dayTasksColumn = tasksGrid.createDiv(W.elements.tasksColumn);
			dayTasksColumn.dataset.date = toISOStringLocal(day.date);
			if (day.isToday) {
				dayTasksColumn.addClass(W.modifiers.tasksColumnToday);
			}

			this.loadWeekViewTasks(dayTasksColumn, day.date, allVirtualInstances);
			this.setupDragDropForColumn(dayTasksColumn, day.date);
		});
	}

	/**
	 * 填充时间轴任务到指定列的时间格
	 */
	private populateTimelineSlots(
		slotContainers: HTMLElement[],
		alldayContainer: HTMLElement,
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

		// 分离全天任务和有时段任务
		const allDayTasks: GCTask[] = [];
		const tasksByHour: Map<number, GCTask[]> = new Map();
		for (const task of currentDayTasks) {
			const precision = task.datePrecision?.[dateField as keyof NonNullable<typeof task.datePrecision>];
			if (precision === 'time') {
				const dateValue = (task as any)[dateField];
				let hour = 0;
				if (dateValue instanceof Date) {
					hour = dateValue.getHours();
				} else if (dateValue) {
					hour = new Date(dateValue).getHours();
				}
				if (!tasksByHour.has(hour)) tasksByHour.set(hour, []);
				tasksByHour.get(hour)!.push(task);
			} else {
				allDayTasks.push(task);
			}
		}

		// 渲染全天任务
		for (const task of allDayTasks) {
			this.renderTimelineTaskItem(task, alldayContainer, targetDate);
		}

		// 填充到对应容器
		for (let h = 0; h <= 23; h++) {
			const container = slotContainers[h];
			if (!container) continue;
			const hourTasks = tasksByHour.get(h) || [];
			hourTasks.forEach(task => {
				this.renderTimelineTaskItem(task, container, targetDate);
			});
		}
	}

	/**
	 * 空时间格：hover 显示 "+"，点击创建任务
	 */
	private setupQuickCreateForSlot(slot: HTMLElement, hour: number, targetDate: Date): void {
		const createEl = slot.createDiv("gc-week-view__slot-create");
		createEl.addEventListener("mouseenter", () => {
			createEl.empty();
			setIcon(createEl, "plus");
		});
		createEl.addEventListener("mouseleave", () => {
			createEl.empty();
		});
		createEl.addEventListener("click", (e) => {
			e.stopPropagation();
			const modal = new CreateTaskModal({
				app: this.app,
				plugin: this.plugin as any,
				targetDate,
				targetHour: hour,
				onSuccess: () => {
					this.plugin.taskCache.initialize(
						this.plugin.settings.globalTaskFilter,
						this.plugin.settings.enabledTaskFormats
					);
				},
			});
			modal.open();
		});
	}

	/**
	 * 渲染时间轴任务项（启用拖拽）
	 */
	private renderTimelineTaskItem(task: GCTask, container: HTMLElement, targetDate: Date): void {
		const config = {
			...WeekViewConfig,
			enableDrag: true,
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

	/**
	 * 设置全天任务行的拖放功能
	 */
	private setupDragDropForAlldaySlot(slot: HTMLElement, targetDate: Date, alldayRowEls: HTMLElement[]): void {
		slot.addEventListener('dragover', (e: DragEvent) => {
			e.preventDefault();
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}
			alldayRowEls.forEach(el => el.addClass(WeekViewClasses.modifiers.alldayDragOver));
		});

		slot.addEventListener('dragleave', (e: DragEvent) => {
			const related = e.relatedTarget as HTMLElement | null;
			if (related && !slot.contains(related)) {
				alldayRowEls.forEach(el => el.removeClass(WeekViewClasses.modifiers.alldayDragOver));
			}
		});

		slot.addEventListener('drop', async (e: DragEvent) => {
			e.preventDefault();
			alldayRowEls.forEach(el => el.removeClass(WeekViewClasses.modifiers.alldayDragOver));

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

				const newDate = new Date(targetDate);
				newDate.setHours(0, 0, 0, 0);

				// 设置为全天任务
				sourceTask.datePrecision = { ...sourceTask.datePrecision, [dateFieldName]: 'day' };

				await updateTaskDateField(
					this.app,
					sourceTask,
					dateFieldName,
					newDate,
					this.plugin.settings.enabledTaskFormats
				);

				Logger.debug('WeekView', 'Task set to all-day via drag-drop', { taskId, targetDate });
			} catch (error) {
				Logger.error('WeekView', 'Error updating task to all-day:', error);
				new Notice('更新任务失败');
			}
		});
	}

	/**
	 * 设置时间格的拖放功能
	 */
	private setupDragDropForTimeSlot(slot: HTMLElement, hour: number, targetDate: Date, rowEls: HTMLElement[]): void {
		slot.addEventListener('dragover', (e: DragEvent) => {
			e.preventDefault();
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}
			// 切换高亮：先清除旧的，再设置新的
			if (this.dragOverRowEls !== rowEls) {
				if (this.dragOverRowEls) {
					this.dragOverRowEls.forEach(el => el.removeClass(WeekViewClasses.modifiers.dragOver));
				}
				rowEls.forEach(el => el.addClass(WeekViewClasses.modifiers.dragOver));
				this.dragOverRowEls = rowEls;
			}
		});

		slot.addEventListener('dragleave', (e: DragEvent) => {
			const related = e.relatedTarget as HTMLElement | null;
			if (related && !slot.contains(related)) {
				rowEls.forEach(el => el.removeClass(WeekViewClasses.modifiers.dragOver));
				if (this.dragOverRowEls === rowEls) {
					this.dragOverRowEls = null;
				}
			}
		});

		slot.addEventListener('drop', async (e: DragEvent) => {
			e.preventDefault();
			rowEls.forEach(el => el.removeClass(WeekViewClasses.modifiers.dragOver));
			this.dragOverRowEls = null;

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

				// 更新 datePrecision 为 time
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
	 * 增量刷新
	 */
	public refreshTasks(): void {
		const container = document.querySelector('.gc-view.gc-view--week') as HTMLElement;
		if (!container) return;

		const isTimeline = container.classList.contains(WeekViewClasses.modifiers.timeline);

		if (isTimeline) {
			// 时间轴模式需要完全重新渲染
			const viewContainer = container.parentElement;
			if (viewContainer) {
				this.render(viewContainer, this.currentDate);
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
