import { TFile, MarkdownRenderer, App } from 'obsidian';
import { BaseViewRenderer } from './BaseViewRenderer';
import { formatDate } from '../dateUtils/dateUtilsIndex';
import type { GCTask, SortState, StatusFilterState, TagFilterState } from '../types';
import { sortTasks } from '../tasks/taskSorter';
import { DEFAULT_SORT_STATE } from '../types';
import { TaskCardClasses, DayViewClasses, withModifiers } from '../utils/bem';
import { TaskCardComponent, DayViewConfig } from '../components/TaskCard';
import { Logger } from '../utils/logger';

/**
 * 日视图渲染器
 */
export class DayViewRenderer extends BaseViewRenderer {
	// 排序状态
	private sortState: SortState = DEFAULT_SORT_STATE;

	// 当前显示的日期
	private currentDate: Date = new Date();

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
		const notesContent = notesSection.createDiv(DayViewClasses.elements.notesContent);

		this.setupDayViewDividerVertical(divider, tasksSection, notesSection);

		this.loadDayViewTasks(tasksList, new Date(currentDate));
		this.loadDayViewNotes(notesContent, new Date(currentDate));
	}

	/**
	 * 加载日视图任务
	 */
	private async loadDayViewTasks(listContainer: HTMLElement, targetDate: Date): Promise<void> {
		listContainer.empty();
		listContainer.createEl('div', { text: '加载中...', cls: 'gantt-task-empty' });

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

			listContainer.empty();

			if (currentDayTasks.length === 0) {
				listContainer.createEl('div', { text: '暂无任务', cls: 'gantt-task-empty' });
				return;
			}

			currentDayTasks.forEach(task => this.renderTaskItem(task, listContainer, normalizedTarget));
		} catch (error) {
			Logger.error('DayView', 'Error loading day view tasks', error);
			listContainer.empty();
			listContainer.createEl('div', { text: '加载任务时出错', cls: 'gantt-task-empty' });
		}
	}

	/**
	 * 渲染日视图任务项（使用统一组件）
	 */
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
	 */
	private async loadDayViewNotes(contentContainer: HTMLElement, targetDate: Date): Promise<void> {
		contentContainer.empty();
		contentContainer.createEl('div', { text: '加载中...', cls: 'gantt-task-empty' });

		try {
			const folderPath = this.plugin.settings.dailyNotePath || 'DailyNotes';
			const nameFormat = this.plugin.settings.dailyNoteNameFormat || 'yyyy-MM-dd';
			const fileName = formatDate(targetDate, nameFormat) + '.md';
			const filePath = `${folderPath}/${fileName}`;

			const file = this.app.vault.getAbstractFileByPath(filePath);

			if (!file || !(file instanceof TFile)) {
				contentContainer.empty();
				contentContainer.createEl('div', { text: '未找到 Daily Note', cls: 'gantt-task-empty' });
				return;
			}

			const content = await this.app.vault.read(file);
			contentContainer.empty();

			if (!content.trim()) {
				contentContainer.createEl('div', { text: '无内容', cls: 'gantt-task-empty' });
				return;
			}

			// 渲染 Markdown 内容
			const noteContent = contentContainer.createDiv(DayViewClasses.elements.notesBody);
			await MarkdownRenderer.render(this.app, content, noteContent, file.path, this.plugin.calendarView);
		} catch (error) {
			Logger.error('DayView', 'Error loading daily note', error);
			contentContainer.empty();
			contentContainer.createEl('div', { text: '加载 Daily Note 时出错', cls: 'gantt-task-empty' });
		}
	}
}
