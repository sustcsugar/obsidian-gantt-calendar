import { App, setIcon, Notice } from 'obsidian';
import { BaseViewRenderer } from './BaseViewRenderer';
import type { IPluginContext,  GCTask, TagFilterState } from '../types';
import { getTaskDateField } from '../types';
import type { DateFieldType } from '../settings/types';
import { sortTasks } from '../tasks/taskSorter';
import { TaskCardClasses, DayViewClasses, EmbeddedEditorClasses, withModifiers } from '../utils/bem';
import { TaskCardComponent, DayViewConfig, type TaskCardConfig } from '../components/TaskCard';
import { Logger } from '../utils/logger';
import { generateVirtualInstances } from '../tasks/virtualTaskGenerator';
import { EmbeddedNoteEditor } from './EmbeddedNoteEditor';
import { updateTaskDateField } from '../tasks/taskUpdater';
import { CreateTaskModal } from '../modals/CreateTaskModal';
import { TooltipManager } from '../utils/tooltipManager';
import { i18n } from '../i18n/i18n';
import { renderCurrentTimeLine } from '../utils/currentTimeLine';
import { isTodayInTimezone } from '../dateUtils/timezone';
import { DragDropManager, setupQuickCreateForSlot, type QuickCreateConfig } from '../utils/timelineInteractions';

/**
 * 日视图渲染器
 */
export class DayViewRenderer extends BaseViewRenderer {
	// 当前显示的日期
	private currentDate: Date = new Date();

	// 嵌入式编辑器实例
	private embeddedEditor: EmbeddedNoteEditor | null = null;

	// 笔记区标题元素引用
	private notesTitleEl: HTMLElement | null = null;

	// 模式切换按钮引用
	private modeToggleEl: HTMLElement | null = null;
	private modeToggleIconEl: HTMLElement | null = null;

	// 当前拖拽高亮的时间格
	private dragOverSlot: HTMLElement | null = null;

	constructor(app: App, plugin: IPluginContext) {
		super(app, plugin);
		this.settingsPrefix = 'dayView';
		this.initializeFilterStates(this.settingsPrefix);
		this.initializeSortState({ field: 'dueDate', order: 'asc' });
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
			const tasksTitle = tasksSection.createEl('h3', { text: i18n.t('views.dayView.todayTasks') });
			tasksTitle.addClass(DayViewClasses.elements.title);
			const tasksList = tasksSection.createDiv(DayViewClasses.elements.taskList);

			void this.loadDayViewTasks(tasksList, new Date(currentDate));
		}
	}

	/**
	 * 增量刷新：只重新加载任务内容，不重建DOM
	 */
	public refreshTasks(): void {
		const container = activeDocument.querySelector('.gc-view.gc-view--day') as HTMLElement;
		if (!container) return;

		// 获取任务列表容器
		const tasksList = container.querySelector('.gc-day-view__task-list');
		if (tasksList) {
			void this.loadDayViewTasks(tasksList as HTMLElement, this.currentDate);
		}
	}

	/**
	 * 渲染水平分屏布局
	 */
	private renderDayViewHorizontal(dayContainer: HTMLElement, currentDate: Date): void {
		const splitContainer = dayContainer.createDiv(DayViewClasses.modifiers.horizontal);

		// 任务区（左）
		const tasksSection = splitContainer.createDiv(DayViewClasses.elements.sectionTasks);
		const tasksTitle = tasksSection.createEl('h3', { text: i18n.t('views.dayView.todayTasks') });
		tasksTitle.addClass(DayViewClasses.elements.title);
		const tasksList = tasksSection.createDiv(DayViewClasses.elements.taskList);

		// 分割线（中）
		const divider = splitContainer.createDiv(DayViewClasses.elements.divider);

		// 笔记区（右）
		const notesSection = splitContainer.createDiv(DayViewClasses.elements.sectionNotes);
		this.createNotesHeader(notesSection);
		const notesContent = notesSection.createDiv(DayViewClasses.elements.notesContent);

		// 设置可调整大小的分割线
		this.setupDayViewDivider(divider, tasksSection, notesSection);

		void this.loadDayViewTasks(tasksList, new Date(currentDate));
		void this.loadDayViewNotes(notesContent, new Date(currentDate));
	}

	/**
	 * 渲染垂直分屏布局
	 */
	private renderDayViewVertical(dayContainer: HTMLElement, currentDate: Date): void {
		const splitContainer = dayContainer.createDiv(DayViewClasses.modifiers.vertical);

		// 任务区（上）
		const tasksSection = splitContainer.createDiv(DayViewClasses.elements.sectionTasks);
		const tasksTitle = tasksSection.createEl('h3', { text: i18n.t('views.dayView.todayTasks') });
		tasksTitle.addClass(DayViewClasses.elements.title);
		const tasksList = tasksSection.createDiv(DayViewClasses.elements.taskList);

		// 分割线（中）
		const divider = splitContainer.createDiv(DayViewClasses.elements.dividerVertical);

		// 笔记区（下）
		const notesSection = splitContainer.createDiv(DayViewClasses.elements.sectionNotes);
		this.createNotesHeader(notesSection);
		const notesContent = notesSection.createDiv(DayViewClasses.elements.notesContent);

		this.setupDayViewDividerVertical(divider, tasksSection, notesSection);

		void this.loadDayViewTasks(tasksList, new Date(currentDate));
		void this.loadDayViewNotes(notesContent, new Date(currentDate));
	}

	/**
	 * 加载日视图任务（支持时间轴布局）
	 */
	private async loadDayViewTasks(listContainer: HTMLElement, targetDate: Date): Promise<void> {
		listContainer.empty();
		listContainer.createEl('div', { text: i18n.t('common.loading'), cls: 'gantt-task-empty' });

		try {
			let tasks: GCTask[] = this.plugin.taskCache.getAllTasks();
			tasks = this.applyStatusFilter(tasks);
			tasks = this.applyTagFilter(tasks);
			const dateField = this.plugin.settings.dateFilterField || 'dueDate';

			const normalizedTarget = new Date(targetDate);
			normalizedTarget.setHours(0, 0, 0, 0);

			let currentDayTasks = tasks.filter(task => {
				const dateValue = getTaskDateField(task, dateField);
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
				listContainer.createEl('div', { text: i18n.t('common.noTasks'), cls: 'gantt-task-empty' });
				return;
			}

			// 分离全天任务和定时任务
			const alldayTasks: GCTask[] = [];
			const timedTasks: GCTask[] = [];
			for (const task of currentDayTasks) {
				const precision = task.datePrecision?.[dateField];
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
			listContainer.createEl('div', { text: i18n.t('views.dayView.loadError'), cls: 'gantt-task-empty' });
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
			const dateValue = getTaskDateField(task, dateField);
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
			// 空时间格：hover 显示 "+"，点击创建任务
			if (hourTasks.length === 0) {
				this.setupQuickCreateForSlot(slot, h, targetDate);
			}
		}

		// 当前时间指示线
		if (isTodayInTimezone(targetDate)) {
			renderCurrentTimeLine(timeGrid, `.${D.timeSlot}`, D.currentTimeLine);
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
				void this.loadDayViewTasks(
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
		const dragDropManager = new DragDropManager({
			targets: [slot],
			highlightClass: DayViewClasses.modifiers.timeSlotDragOver,
			logTag: 'DayView',
		});
		dragDropManager.setupForSlot(slot, hour, targetDate, this.app, this.plugin);
	}

	/**
	 * 空时间格：hover 显示 "+"，点击创建任务
	 */
	private setupQuickCreateForSlot(slot: HTMLElement, hour: number, targetDate: Date): void {
		const config: QuickCreateConfig = {
			createElClass: DayViewClasses.elements.slotCreate,
		};
		setupQuickCreateForSlot(slot, hour, targetDate, this.app, this.plugin, config);
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
				void this.loadDayViewTasks(listContainer, targetDate);
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
				activeDocument.removeEventListener('mousemove', mouseMoveHandler);
				activeDocument.removeEventListener('mouseup', mouseUpHandler);
			};

			activeDocument.addEventListener('mousemove', mouseMoveHandler);
			activeDocument.addEventListener('mouseup', mouseUpHandler);
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
				activeDocument.removeEventListener('mousemove', mouseMoveHandler);
				activeDocument.removeEventListener('mouseup', mouseUpHandler);
			};

			activeDocument.addEventListener('mousemove', mouseMoveHandler);
			activeDocument.addEventListener('mouseup', mouseUpHandler);
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
				void this.embeddedEditor?.close();
				this.embeddedEditor = null;
			});
		}

		await this.embeddedEditor.openDate(
			targetDate,
			this.plugin.dailyNoteIndex,
			this.plugin.settings,
			this.plugin.calendarView as any
		);

		// 更新笔记区标题为当前打开的文件名
		this.updateNotesTitle();
		// 同步模式切换按钮图标
		this.updateModeToggleIcon();
	}

	/**
	 * 更新笔记区标题为当前打开的文件名
	 */
	private updateNotesTitle(): void {
		if (!this.notesTitleEl || !this.embeddedEditor) return;

		const filePath = this.embeddedEditor.getCurrentFilePath();
		if (filePath) {
			const fileName = filePath.split('/').pop()?.replace(/\.md$/, '') || 'Daily note';
			this.notesTitleEl.setText(fileName);
		} else {
			this.notesTitleEl.setText('Daily note');
		}
	}

	/**
	 * 创建笔记区标题栏（含模式切换按钮）
	 */
	private createNotesHeader(notesSection: HTMLElement): void {
		const header = notesSection.createDiv(DayViewClasses.elements.notesHeader);

		// 标题文本
		const title = header.createEl('h3', { text: 'Daily note' });
		title.addClass(DayViewClasses.elements.title);
		this.notesTitleEl = title;

		// 模式切换按钮
		const toggleBtn = header.createEl('button', {
			cls: EmbeddedEditorClasses.elements.modeToggle,
			attr: { 'aria-label': i18n.t('views.dayView.switchToPreview') }
		});
		this.modeToggleEl = toggleBtn;

		// 使用 span 作为图标容器，与工具栏模式一致
		const iconSpan = toggleBtn.createSpan();
		this.modeToggleIconEl = iconSpan;
		setIcon(iconSpan, 'pencil');

		toggleBtn.addEventListener('click', () => {
			if (!this.embeddedEditor) return;
			const currentMode = this.embeddedEditor.getMode();
			if (currentMode === 'source') {
				this.embeddedEditor.switchToPreview();
				// setViewState 是异步的，直接基于目标模式更新 UI
				this.applyModeToggleState('preview');
			} else {
				this.embeddedEditor.switchToSource();
				this.applyModeToggleState('source');
			}
		});
	}

	/**
	 * 更新模式切换按钮图标和提示文本
	 */
	private updateModeToggleIcon(): void {
		if (!this.modeToggleEl || !this.embeddedEditor) return;
		const mode = this.embeddedEditor.getMode();
		this.applyModeToggleState(mode);
	}

	/**
	 * 根据模式设置按钮图标和 tooltip
	 */
	private applyModeToggleState(mode: string | null): void {
		if (!this.modeToggleEl || !this.modeToggleIconEl) return;
		if (mode === 'source') {
			setIcon(this.modeToggleIconEl, 'pencil');
			this.modeToggleEl.setAttribute('aria-label', i18n.t('views.dayView.switchToPreview'));
		} else {
			setIcon(this.modeToggleIconEl, 'book-open');
			this.modeToggleEl.setAttribute('aria-label', i18n.t('views.dayView.switchToEdit'));
		}
	}
}
