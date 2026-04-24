import { App } from 'obsidian';
import { BaseViewRenderer } from './BaseViewRenderer';
import type { GCTask, SortState, StatusFilterState, TagFilterState } from '../types';
import { sortTasks } from '../tasks/taskSorter';
import { DEFAULT_SORT_STATE } from '../types';
import { TaskCardClasses, DayViewClasses, withModifiers } from '../utils/bem';
import { TaskCardComponent, DayViewConfig, type TaskCardConfig } from '../components/TaskCard';
import { Logger } from '../utils/logger';
import { generateVirtualInstances } from '../tasks/virtualTaskGenerator';
import { EmbeddedNoteEditor } from './EmbeddedNoteEditor';
import { updateTaskDateField } from '../tasks/taskUpdater';
import { Notice } from 'obsidian';

/**
 * 日视图渲染器
 */
export class DayViewRenderer extends BaseViewRenderer {
	// 排序状态
	private sortState: SortState = DEFAULT_SORT_STATE;

	// 当前显示的日期
	private currentDate: Date = new Date();

	// 嵌入式编辑器实例
	private embeddedEditor: EmbeddedNoteEditor | null = null;

	// 笔记区标题元素引用
	private notesTitleEl: HTMLElement | null = null;

	// 设置前缀
	private readonly SETTINGS_PREFIX = 'dayView';

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
			Logger.error('DayView', 'Failed to save sort state', err);
		});
	}

	/**
	 * 重写状态筛选 setter 以支持持久化
	 */
	public setStatusFilterState(state: StatusFilterState): void {
		super.setStatusFilterState(state);
		this.saveStatusFilterState(this.SETTINGS_PREFIX).catch(err => {
			Logger.error('DayView', 'Failed to save status filter', err);
		});
	}

	/**
	 * 重写标签筛选 setter 以支持持久化
	 */
	public setTagFilterState(state: TagFilterState): void {
		super.setTagFilterState(state);
		this.saveTagFilterState(this.SETTINGS_PREFIX).catch(err => {
			Logger.error('DayView', 'Failed to save tag filter', err);
		});
	}

	render(container: HTMLElement, currentDate: Date): void {
		// 保存当前日期用于增量刷新
		this.currentDate = new Date(currentDate);

		const dayContainer = container.createDiv('gc-view gc-view--day');

		// 检查是否显示 Daily Note
		const enableDailyNote = this.plugin.settings.enableDailyNote !== false;

		if (enableDailyNote) {
			const layout = this.plugin.settings.dayViewLayout || 'horizontal';

			if (layout === 'horizontal') {
				this.renderDayViewHorizontal(dayContainer, currentDate);
			} else {
				this.renderDayViewVertical(dayContainer, currentDate);
			}
		} else {
			// 仅显示任务（全宽）
			const tasksSection = dayContainer.createDiv(withModifiers(DayViewClasses.block, DayViewClasses.modifiers.tasksOnly));
			const tasksTitle = tasksSection.createEl('h3', { text: '当日任务' });
			tasksTitle.addClass(DayViewClasses.elements.title);
			const tasksList = tasksSection.createDiv(DayViewClasses.elements.taskList);

			this.loadDayViewTasks(tasksList, new Date(currentDate));
		}
	}

	/**
	 * 增量刷新：只重新加载任务内容，不重建DOM
	 */
	public refreshTasks(): void {
		const container = document.querySelector('.gc-view.gc-view--day') as HTMLElement;
		if (!container) return;

		// 获取任务列表容器
		const tasksList = container.querySelector('.gc-day-view__task-list');
		if (tasksList) {
			this.loadDayViewTasks(tasksList as HTMLElement, this.currentDate);
		}
	}

	/**
	 * 渲染水平分屏布局
	 */
	private renderDayViewHorizontal(dayContainer: HTMLElement, currentDate: Date): void {
		const splitContainer = dayContainer.createDiv(DayViewClasses.modifiers.horizontal);

		// 任务区（左）
		const tasksSection = splitContainer.createDiv(DayViewClasses.elements.sectionTasks);
		const tasksTitle = tasksSection.createEl('h3', { text: '当日任务' });
		tasksTitle.addClass(DayViewClasses.elements.title);
		const tasksList = tasksSection.createDiv(DayViewClasses.elements.taskList);

		// 分割线（中）
		const divider = splitContainer.createDiv(DayViewClasses.elements.divider);

		// 笔记区（右）
		const notesSection = splitContainer.createDiv(DayViewClasses.elements.sectionNotes);
		const notesTitle = notesSection.createEl('h3', { text: 'Daily Note' });
		notesTitle.addClass(DayViewClasses.elements.title);
		this.notesTitleEl = notesTitle;
		const notesContent = notesSection.createDiv(DayViewClasses.elements.notesContent);

		// 设置可调整大小的分割线
		this.setupDayViewDivider(divider, tasksSection, notesSection);

		this.loadDayViewTasks(tasksList, new Date(currentDate));
		this.loadDayViewNotes(notesContent, new Date(currentDate));
	}

	/**
	 * 渲染垂直分屏布局
	 */
	private renderDayViewVertical(dayContainer: HTMLElement, currentDate: Date): void {
		const splitContainer = dayContainer.createDiv(DayViewClasses.modifiers.vertical);

		// 任务区（上）
		const tasksSection = splitContainer.createDiv(DayViewClasses.elements.sectionTasks);
		const tasksTitle = tasksSection.createEl('h3', { text: '当日任务' });
		tasksTitle.addClass(DayViewClasses.elements.title);
		const tasksList = tasksSection.createDiv(DayViewClasses.elements.taskList);

		// 分割线（中）
		const divider = splitContainer.createDiv(DayViewClasses.elements.dividerVertical);

		// 笔记区（下）
		const notesSection = splitContainer.createDiv(DayViewClasses.elements.sectionNotes);
		const notesTitle = notesSection.createEl('h3', { text: 'Daily Note' });
		notesTitle.addClass(DayViewClasses.elements.title);
		this.notesTitleEl = notesTitle;
		const notesContent = notesSection.createDiv(DayViewClasses.elements.notesContent);

		this.setupDayViewDividerVertical(divider, tasksSection, notesSection);

		this.loadDayViewTasks(tasksList, new Date(currentDate));
		this.loadDayViewNotes(notesContent, new Date(currentDate));
	}

	/**
	 * 加载日视图任务（支持时间轴布局）
	 */
	private async loadDayViewTasks(listContainer: HTMLElement, targetDate: Date): Promise<void> {
		listContainer.empty();
		listContainer.createEl('div', { text: '加载中...', cls: 'gantt-task-empty' });

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

			const virtualInstances = generateVirtualInstances(tasks, normalizedTarget, normalizedTarget, dateField, this.plugin.settings.recurringTaskDisplayLimit ?? 5);
			currentDayTasks = [...currentDayTasks, ...virtualInstances];
			currentDayTasks = sortTasks(currentDayTasks, this.sortState);

			listContainer.empty();

			if (currentDayTasks.length === 0) {
				listContainer.createEl('div', { text: '暂无任务', cls: 'gantt-task-empty' });
				return;
			}

			// 分离全天任务和定时任务
			const alldayTasks: GCTask[] = [];
			const timedTasks: GCTask[] = [];
			for (const task of currentDayTasks) {
				const precision = task.datePrecision?.[dateField as keyof NonNullable<typeof task.datePrecision>];
				if (precision === 'time') {
					timedTasks.push(task);
				} else {
					alldayTasks.push(task);
				}
			}

			// 有定时任务时使用时间轴布局，否则保持原有列表
			if (timedTasks.length > 0) {
				this.renderTimelineLayout(listContainer, alldayTasks, timedTasks, normalizedTarget);
			} else {
				currentDayTasks.forEach(task => this.renderTaskItem(task, listContainer, normalizedTarget));
			}
		} catch (error) {
			Logger.error('DayView', 'Error loading day view tasks', error);
			listContainer.empty();
			listContainer.createEl('div', { text: '加载任务时出错', cls: 'gantt-task-empty' });
		}
	}

	/**
	 * 渲染时间轴布局
	 */
	private renderTimelineLayout(
		container: HTMLElement,
		alldayTasks: GCTask[],
		timedTasks: GCTask[],
		targetDate: Date
	): void {
		const D = DayViewClasses.elements;
		const timeline = container.createDiv(D.timeline);
		const timeGrid = timeline.createDiv(D.timeGrid);
		const dateField = this.plugin.settings.dateFilterField || 'dueDate';

		// 将全天任务作为 0 时任务，与定时任务统一分组
		const tasksByHour: Map<number, GCTask[]> = new Map();
		for (const task of alldayTasks) {
			if (!tasksByHour.has(0)) tasksByHour.set(0, []);
			tasksByHour.get(0)!.push(task);
		}
		for (const task of timedTasks) {
			const dateValue = (task as any)[dateField];
			if (dateValue instanceof Date) {
				const hour = dateValue.getHours();
				if (!tasksByHour.has(hour)) tasksByHour.set(hour, []);
				tasksByHour.get(hour)!.push(task);
			}
		}

		// 时间网格 (0:00 - 23:00)
		for (let h = 0; h <= 23; h++) {
			const slot = timeGrid.createDiv(D.timeSlot);
			const label = slot.createDiv(D.timeLabel);
			label.setText(`${String(h).padStart(2, '0')}:00`);
			const tasksContainer = slot.createDiv(D.timeTasks);
			const hourTasks = tasksByHour.get(h) || [];
			hourTasks.forEach(task => this.renderTimelineTaskItem(task, tasksContainer, targetDate));

			// 设置时间格的拖放功能
			this.setupDragDropForTimeSlot(slot, h, targetDate, container);
		}
	}

	
	// 时间轴专用配置（启用拖拽）
	private timelineTaskConfig: TaskCardConfig = {
		...DayViewConfig,
		enableDrag: true,
	};

	/**
	 * 渲染日视图时间轴任务项（启用拖拽）
	 */
	private renderTimelineTaskItem(task: GCTask, listContainer: HTMLElement, targetDate: Date): void {
		new TaskCardComponent({
			task,
			config: this.timelineTaskConfig,
			container: listContainer,
			app: this.app,
			plugin: this.plugin,
			targetDate,
			onClick: (task) => {
				this.loadDayViewTasks(
					listContainer.closest('.gc-day-view__timeline')?.parentElement as HTMLElement
						|| listContainer,
					targetDate
				);
			},
		}).render();
	}

	/**
	 * 设置时间格的拖放功能
	 */
	private setupDragDropForTimeSlot(slot: HTMLElement, hour: number, targetDate: Date, listContainer: HTMLElement): void {
		slot.addEventListener('dragover', (e: DragEvent) => {
			e.preventDefault();
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}
			slot.addClass('gc-day-view__time-slot--drag-over');
		});

		slot.addEventListener('dragleave', (e: DragEvent) => {
			if (e.target === slot) {
				slot.removeClass('gc-day-view__time-slot--drag-over');
			}
		});

		slot.addEventListener('drop', async (e: DragEvent) => {
			e.preventDefault();
			slot.removeClass('gc-day-view__time-slot--drag-over');

			const taskId = e.dataTransfer?.getData('taskId');
			if (!taskId) return;

			const [filePath, lineNum] = taskId.split(':');
			const lineNumber = parseInt(lineNum, 10);

			// 查找源任务
			const allTasks = this.plugin.taskCache.getAllTasks();
			const sourceTask = allTasks.find((t: GCTask) => t.filePath === filePath && t.lineNumber === lineNumber);
			if (!sourceTask) {
				Logger.error('DayView', 'Source task not found:', taskId);
				return;
			}

			const dateFieldName = this.plugin.settings.dateFilterField || 'dueDate';

			try {
				// 构建新的日期时间：保持目标日期 + 新的小时
				const newDate = new Date(targetDate);
				newDate.setHours(hour, 0, 0, 0);

				// 更新 datePrecision 为 time（拖拽到时间格表示设定了时间）
				sourceTask.datePrecision = { ...sourceTask.datePrecision, [dateFieldName]: 'time' };

				// 更新任务的日期字段（带时间）
				await updateTaskDateField(
					this.app,
					sourceTask,
					dateFieldName,
					newDate,
					this.plugin.settings.enabledTaskFormats
				);

				Logger.debug('DayView', 'Task time updated via drag-drop', { taskId, hour });
			} catch (error) {
				Logger.error('DayView', 'Error updating task time:', error);
				new Notice('更新任务时间失败');
			}
		});
	}

		private renderTaskItem(task: GCTask, listContainer: HTMLElement, targetDate: Date): void {
		new TaskCardComponent({
			task,
			config: DayViewConfig,
			container: listContainer,
			app: this.app,
			plugin: this.plugin,
			onClick: (task) => {
				// 刷新任务列表
				this.loadDayViewTasks(listContainer, targetDate);
			},
		}).render();
	}

	/**
	 * 设置水平分割线拖拽
	 */
	private setupDayViewDivider(divider: HTMLElement, tasksSection: HTMLElement, notesSection: HTMLElement): void {
		let isResizing = false;
		const container = divider.parentElement;
		if (!container) return;

		divider.addEventListener('mousedown', (e: MouseEvent) => {
			isResizing = true;
			const startX = e.clientX;
			const startTasksWidth = tasksSection.offsetWidth;
			const startNotesWidth = notesSection.offsetWidth;
			const totalWidth = container.offsetWidth;

			const mouseMoveHandler = (moveEvent: MouseEvent) => {
				if (!isResizing) return;

				const deltaX = moveEvent.clientX - startX;
				const newTasksWidth = Math.max(100, startTasksWidth + deltaX);
				const newNotesWidth = Math.max(100, totalWidth - newTasksWidth - 8);

				tasksSection.style.flex = `0 0 ${newTasksWidth}px`;
				notesSection.style.flex = `0 0 ${newNotesWidth}px`;
			};

			const mouseUpHandler = () => {
				isResizing = false;
				document.removeEventListener('mousemove', mouseMoveHandler);
				document.removeEventListener('mouseup', mouseUpHandler);
			};

			document.addEventListener('mousemove', mouseMoveHandler);
			document.addEventListener('mouseup', mouseUpHandler);
		});
	}

	/**
	 * 设置垂直分割线拖拽
	 */
	private setupDayViewDividerVertical(divider: HTMLElement, tasksSection: HTMLElement, notesSection: HTMLElement): void {
		let isResizing = false;
		const container = divider.parentElement;
		if (!container) return;

		divider.addEventListener('mousedown', (e: MouseEvent) => {
			isResizing = true;
			const startY = e.clientY;
			const startTasksHeight = tasksSection.offsetHeight;
			const startNotesHeight = notesSection.offsetHeight;
			const totalHeight = container.offsetHeight;

			const mouseMoveHandler = (moveEvent: MouseEvent) => {
				if (!isResizing) return;

				const deltaY = moveEvent.clientY - startY;
				const newTasksHeight = Math.max(100, startTasksHeight + deltaY);
				const newNotesHeight = Math.max(100, totalHeight - newTasksHeight - 8);

				tasksSection.style.flex = `0 0 ${newTasksHeight}px`;
				notesSection.style.flex = `0 0 ${newNotesHeight}px`;
			};

			const mouseUpHandler = () => {
				isResizing = false;
				document.removeEventListener('mousemove', mouseMoveHandler);
				document.removeEventListener('mouseup', mouseUpHandler);
			};

			document.addEventListener('mousemove', mouseMoveHandler);
			document.addEventListener('mouseup', mouseUpHandler);
		});
	}

	/**
	 * 加载 Daily Note 内容
	 * 使用嵌入式编辑器实现所见即所得的编辑体验
	 * 支持 Obsidian 核心日记插件、Periodic Notes 插件和手动配置
	 */
	private async loadDayViewNotes(contentContainer: HTMLElement, targetDate: Date): Promise<void> {
		// 懒初始化 EmbeddedNoteEditor
		if (!this.embeddedEditor) {
			this.embeddedEditor = new EmbeddedNoteEditor(this.app, contentContainer);
			// 注册清理回调，视图切换时自动关闭
			this.registerDomCleanup(() => {
				this.embeddedEditor?.close();
				this.embeddedEditor = null;
			});
		}

		await this.embeddedEditor.openDate(
			targetDate,
			this.plugin.dailyNoteIndex,
			this.plugin.settings,
			this.plugin.calendarView
		);

		// 更新笔记区标题为当前打开的文件名
		this.updateNotesTitle();
	}

	/**
	 * 更新笔记区标题为当前打开的文件名
	 */
	private updateNotesTitle(): void {
		if (!this.notesTitleEl || !this.embeddedEditor) return;

		const filePath = this.embeddedEditor.getCurrentFilePath();
		if (filePath) {
			const fileName = filePath.split('/').pop()?.replace(/\.md$/, '') || 'Daily Note';
			this.notesTitleEl.setText(fileName);
		} else {
			this.notesTitleEl.setText('Daily Note');
		}
	}
}
