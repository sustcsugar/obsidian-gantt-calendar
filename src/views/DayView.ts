import { TFile, MarkdownRenderer } from 'obsidian';
import { BaseCalendarRenderer } from './BaseCalendarRenderer';
import { formatDate } from '../dateUtils/dateUtilsIndex';
import type { GanttTask, SortState } from '../types';
import { sortTasks } from '../tasks/taskSorter';
import { DEFAULT_SORT_STATE } from '../types';

/**
 * 日视图渲染器
 */
export class DayViewRenderer extends BaseCalendarRenderer {
	// 排序状态
	private sortState: SortState = DEFAULT_SORT_STATE;

	public getSortState(): SortState {
		return this.sortState;
	}

	public setSortState(state: SortState): void {
		this.sortState = state;
	}

	render(container: HTMLElement, currentDate: Date): void {
		const dayContainer = container.createDiv('calendar-day-view');

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
			const tasksSection = dayContainer.createDiv('calendar-day-tasks-section-full');
			const tasksTitle = tasksSection.createEl('h3', { text: '当日任务' });
			tasksTitle.addClass('calendar-day-tasks-title');
			const tasksList = tasksSection.createDiv('calendar-day-tasks-list');

			this.loadDayViewTasks(tasksList, new Date(currentDate));
		}
	}

	/**
	 * 渲染水平分屏布局
	 */
	private renderDayViewHorizontal(dayContainer: HTMLElement, currentDate: Date): void {
		const splitContainer = dayContainer.createDiv('calendar-day-split-container');

		// 任务区（左）
		const tasksSection = splitContainer.createDiv('calendar-day-tasks-section');
		const tasksTitle = tasksSection.createEl('h3', { text: '当日任务' });
		tasksTitle.addClass('calendar-day-tasks-title');
		const tasksList = tasksSection.createDiv('calendar-day-tasks-list');

		// 分割线（中）
		const divider = splitContainer.createDiv('calendar-day-divider');

		// 笔记区（右）
		const notesSection = splitContainer.createDiv('calendar-day-notes-section');
		const notesTitle = notesSection.createEl('h3', { text: 'Daily Note' });
		notesTitle.addClass('calendar-day-notes-title');
		const notesContent = notesSection.createDiv('calendar-day-notes-content');

		// 设置可调整大小的分割线
		this.setupDayViewDivider(divider, tasksSection, notesSection);

		this.loadDayViewTasks(tasksList, new Date(currentDate));
		this.loadDayViewNotes(notesContent, new Date(currentDate));
	}

	/**
	 * 渲染垂直分屏布局
	 */
	private renderDayViewVertical(dayContainer: HTMLElement, currentDate: Date): void {
		const splitContainer = dayContainer.createDiv('calendar-day-split-container-vertical');

		// 任务区（上）
		const tasksSection = splitContainer.createDiv('calendar-day-tasks-section-vertical');
		const tasksTitle = tasksSection.createEl('h3', { text: '当日任务' });
		tasksTitle.addClass('calendar-day-tasks-title');
		const tasksList = tasksSection.createDiv('calendar-day-tasks-list');

		// 分割线（中）
		const divider = splitContainer.createDiv('calendar-day-divider-vertical');

		// 笔记区（下）
		const notesSection = splitContainer.createDiv('calendar-day-notes-section-vertical');
		const notesTitle = notesSection.createEl('h3', { text: 'Daily Note' });
		notesTitle.addClass('calendar-day-notes-title');
		const notesContent = notesSection.createDiv('calendar-day-notes-content');

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
			let tasks: GanttTask[] = this.plugin.taskCache.getAllTasks();
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

			currentDayTasks.forEach(task => this.renderDayTaskItem(task, listContainer, normalizedTarget));
		} catch (error) {
			console.error('Error loading day view tasks', error);
			listContainer.empty();
			listContainer.createEl('div', { text: '加载任务时出错', cls: 'gantt-task-empty' });
		}
	}

	/**
	 * 渲染日视图任务项
	 */
	private renderDayTaskItem(task: GanttTask, listContainer: HTMLElement, targetDate: Date): void {
		const taskItem = listContainer.createDiv('calendar-task-card');
		taskItem.addClass('calendar-task-card--day');
		taskItem.addClass(task.completed ? 'completed' : 'pending');

		// 应用状态颜色
		this.applyStatusColors(task, taskItem);

		// 复选框
		this.createTaskCheckbox(task, taskItem);

		// 任务内容
		const cleaned = task.description;
		const gf = (this.plugin?.settings?.globalTaskFilter || '').trim();
		const displayText = this.plugin?.settings?.showGlobalFilterInTaskText && gf ? `${gf} ${cleaned}` : cleaned;
		
		// 使用富文本渲染支持链接
		const taskTextEl = taskItem.createDiv('gantt-task-text');
		if (this.plugin?.settings?.showGlobalFilterInTaskText && gf) {
			taskTextEl.appendText(gf + ' ');
		}
		this.renderTaskDescriptionWithLinks(taskTextEl, cleaned);

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

		// 注册右键菜单
		const enabledFormats = this.plugin.settings.enabledTaskFormats || ['tasks'];
		const taskNotePath = this.plugin.settings.taskNotePath || 'Tasks';
		const { registerTaskContextMenu } = require('../contextMenu/contextMenuIndex');
		registerTaskContextMenu(
			taskItem,
			task,
			this.app,
			enabledFormats,
			taskNotePath,
			() => {
				// 刷新任务列表
				this.loadDayViewTasks(listContainer, targetDate);
			},
			this.plugin?.settings?.globalTaskFilter || ''
		);
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
			const noteContent = contentContainer.createDiv('calendar-day-notes-markdown');
			await MarkdownRenderer.render(this.app, content, noteContent, file.path, this.plugin.calendarView);
		} catch (error) {
			console.error('Error loading daily note', error);
			contentContainer.empty();
			contentContainer.createEl('div', { text: '加载 Daily Note 时出错', cls: 'gantt-task-empty' });
		}
	}
}
