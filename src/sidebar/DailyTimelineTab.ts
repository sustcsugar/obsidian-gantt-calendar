import type { App } from 'obsidian';
import { Notice, setIcon } from 'obsidian';
import type { GCTask } from '../types';
import { i18n } from '../i18n/i18n';
import { SidebarClasses } from '../utils/bem';
import { TaskCardComponent, buildSidebarConfig } from '../components/TaskCard';
import { getTodayInTimezone, isTodayInTimezone } from '../dateUtils/timezone';
import { formatDate } from '../dateUtils/dateUtilsIndex';
import { sortTasks } from '../tasks/taskSorter';
import { openFileInExistingLeaf } from '../utils/fileOpener';
import { updateTaskDateField } from '../tasks/taskUpdater';
import { CreateTaskModal } from '../modals/CreateTaskModal';
import { Logger } from '../utils/logger';
import { renderCurrentTimeLine } from '../utils/currentTimeLine';

/**
 * 侧边栏 — 今日时间线 Tab
 * 紧凑展示当天任务，按时段排列
 */
export class DailyTimelineTab {
	private app: App;
	private plugin: any;
	private cardResults: Array<{ element: HTMLElement; destroy: () => void }> = [];
	private dragOverSlot: HTMLElement | null = null;

	constructor(app: App, plugin: any) {
		this.app = app;
		this.plugin = plugin;
	}

	render(container: HTMLElement): void {
		this.renderTimeline(container);
	}

	refresh(container: HTMLElement): void {
		const savedScrollTop = container.scrollTop;
		this.destroyCards();
		container.empty();
		this.renderTimeline(container);
		container.scrollTop = savedScrollTop;
	}

	cleanup(): void {
		this.destroyCards();
	}

	private renderTimeline(container: HTMLElement): void {
		const today = getTodayInTimezone();
		const todayStr = formatDate(today, 'yyyy-MM-dd');
		const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

		// 标题
		const header = container.createDiv(SidebarClasses.elements.timelineHeader);
		const dateText = header.createSpan({
			text: `${formatDate(today, 'MM/dd')} ${weekdayNames[today.getDay()]}`
		});
		dateText.style.cssText = 'font-size:14px;font-weight:600;';

		const allTasks = this.plugin?.taskCache?.getAllTasks() as GCTask[] | undefined;
		if (!allTasks) return;

		// 获取今天的任务
		const todayTasks = this.getTodayTasks(allTasks, today);

		if (todayTasks.length === 0) {
			const empty = container.createDiv(SidebarClasses.elements.emptyState);
			empty.textContent = '今天没有任务';
			return;
		}

		// 分离全天任务和有时段任务
		const allDayTasks: GCTask[] = [];
		const timedTasks: GCTask[] = [];

		for (const task of todayTasks) {
			const precision = this.getDatePrecision(task);
			if (precision === 'time') {
				timedTasks.push(task);
			} else {
				allDayTasks.push(task);
			}
		}

		// 按截止时间排序
		timedTasks.sort((a, b) => {
			const timeA = a.dueDate ? a.dueDate.getHours() * 60 + a.dueDate.getMinutes() : null;
			const timeB = b.dueDate ? b.dueDate.getHours() * 60 + b.dueDate.getMinutes() : null;
			if (timeA === null && timeB === null) return 0;
			if (timeA === null) return 1;
			if (timeB === null) return -1;
			return timeA - timeB;
		});

		// 渲染全天区域（始终显示，作为拖放目标）
		const allDaySection = container.createDiv(SidebarClasses.elements.timelineAllDay);
		const allDayLabel = allDaySection.createDiv(SidebarClasses.elements.timelineAllDayLabel);
		allDayLabel.textContent = '全天';
		if (allDayTasks.length > 0) {
			const allDayTasksEl = allDaySection.createDiv(SidebarClasses.elements.timelineAllDayTasks);
			this.renderTaskCards(allDayTasksEl, allDayTasks);
		}
		this.setupDragDropForAllDay(allDaySection);

		// 渲染时段时间线（始终显示，作为拖放目标）
		const timeline = container.createDiv(SidebarClasses.elements.timeline);
		this.renderTimedTimeline(timeline, timedTasks, today);
	}

	private getTodayTasks(tasks: GCTask[], today: Date): GCTask[] {
		return tasks.filter(t => {
			if (t.cancelled) return false;
			return t.dueDate && isTodayInTimezone(t.dueDate);
		});
	}

	private getDatePrecision(task: GCTask): 'day' | 'time' {
		return task.datePrecision?.dueDate === 'time' ? 'time' : 'day';
	}

	private getTaskTime(task: GCTask): number | null {
		if (task.dueDate && task.datePrecision?.dueDate === 'time') {
			return task.dueDate.getHours() * 60 + task.dueDate.getMinutes();
		}
		return null;
	}

	private renderTimedTimeline(container: HTMLElement, tasks: GCTask[], today: Date): void {
		// 按小时分组
		const hourGroups = new Map<number, GCTask[]>();
		for (const task of tasks) {
			const time = this.getTaskTime(task);
			if (time === null) continue;
			const hour = Math.floor(time / 60);
			if (!hourGroups.has(hour)) hourGroups.set(hour, []);
			hourGroups.get(hour)!.push(task);
		}

		// 渲染全天时间格 (0:00 - 23:00)
		for (let hour = 0; hour <= 23; hour++) {
			const slot = container.createDiv(SidebarClasses.elements.timelineTimeSlot);
			const label = slot.createDiv(SidebarClasses.elements.timelineTimeLabel);
			label.textContent = `${String(hour).padStart(2, '0')}:00`;

			// 高亮当前时间
			const now = new Date();
			if (now.getHours() === hour && isTodayInTimezone(today)) {
				slot.addClass('is-current-hour');
			}

			const hourTasks = hourGroups.get(hour);
			if (hourTasks && hourTasks.length > 0) {
				const tasksEl = slot.createDiv(SidebarClasses.elements.timelineTimeTasks);
				this.renderTaskCards(tasksEl, hourTasks);
			} else {
				// 空时间格：hover 显示 "+"，点击创建任务
				const createEl = slot.createDiv(SidebarClasses.elements.timelineSlotCreate);
				createEl.addEventListener('mouseenter', () => {
					createEl.empty();
					setIcon(createEl, 'plus');
				});
				createEl.addEventListener('mouseleave', () => {
					createEl.empty();
				});
				createEl.addEventListener('click', (e) => {
					e.stopPropagation();
					const modal = new CreateTaskModal({
						app: this.app,
						plugin: this.plugin,
						targetDate: today,
						targetHour: hour,
						onSuccess: () => {
						// vault modify event triggers incremental update automatically
						},
					});
					modal.open();
				});
			}

			// 拖放接收
			this.setupDragDropForTimeSlot(slot, hour, today);
		}

		// 标记当前时间线
		if (isTodayInTimezone(today)) {
			renderCurrentTimeLine(container, `.${SidebarClasses.elements.timelineTimeSlot}`, SidebarClasses.elements.timelineCurrentTime, 0, 24);
		}
	}

	private setupDragDropForTimeSlot(slot: HTMLElement, hour: number, today: Date): void {
		slot.addEventListener('dragover', (e: DragEvent) => {
			e.preventDefault();
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}
			if (this.dragOverSlot !== slot) {
				if (this.dragOverSlot) {
					this.dragOverSlot.removeClass('gc-sidebar__time-slot--drag-over');
				}
				slot.addClass('gc-sidebar__time-slot--drag-over');
				this.dragOverSlot = slot;
			}
		});

		slot.addEventListener('dragleave', (e: DragEvent) => {
			const related = e.relatedTarget as HTMLElement | null;
			if (related && !slot.contains(related)) {
				slot.removeClass('gc-sidebar__time-slot--drag-over');
				if (this.dragOverSlot === slot) {
					this.dragOverSlot = null;
				}
			}
		});

		slot.addEventListener('drop', async (e: DragEvent) => {
			e.preventDefault();
			slot.removeClass('gc-sidebar__time-slot--drag-over');
			this.dragOverSlot = null;

			const taskId = e.dataTransfer?.getData('taskId');
			if (!taskId) return;

			const [filePath, lineNum] = taskId.split(':');
			const lineNumber = parseInt(lineNum, 10);

			const allTasks = this.plugin.taskCache.getAllTasks();
			const sourceTask = allTasks.find((t: GCTask) => t.filePath === filePath && t.lineNumber === lineNumber);
			if (!sourceTask) {
				Logger.error('DailyTimelineTab', 'Source task not found:', taskId);
				return;
			}

			const dateFieldName = this.plugin.settings.dateFilterField || 'dueDate';

			try {
				const newDate = new Date(today);
				newDate.setHours(hour, 0, 0, 0);

				sourceTask.datePrecision = { ...sourceTask.datePrecision, [dateFieldName]: 'time' };

				await updateTaskDateField(
					this.app,
					sourceTask,
					dateFieldName,
					newDate,
					this.plugin.settings.enabledTaskFormats
				);

				Logger.debug('DailyTimelineTab', 'Task time updated via drag-drop', { taskId, hour });
			} catch (error) {
				Logger.error('DailyTimelineTab', 'Error updating task time:', error);
				new Notice(i18n.t('views.dayView.updateTimeFailed'));
			}
		});
	}

	private setupDragDropForAllDay(section: HTMLElement): void {
		section.addEventListener('dragover', (e: DragEvent) => {
			e.preventDefault();
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}
			section.addClass('gc-sidebar__all-day--drag-over');
		});

		section.addEventListener('dragleave', (e: DragEvent) => {
			const related = e.relatedTarget as HTMLElement | null;
			if (related && !section.contains(related)) {
				section.removeClass('gc-sidebar__all-day--drag-over');
			}
		});

		section.addEventListener('drop', async (e: DragEvent) => {
			e.preventDefault();
			section.removeClass('gc-sidebar__all-day--drag-over');

			const taskId = e.dataTransfer?.getData('taskId');
			if (!taskId) return;

			const [filePath, lineNum] = taskId.split(':');
			const lineNumber = parseInt(lineNum, 10);

			const allTasks = this.plugin.taskCache.getAllTasks();
			const sourceTask = allTasks.find((t: GCTask) => t.filePath === filePath && t.lineNumber === lineNumber);
			if (!sourceTask) return;

			const dateFieldName = this.plugin.settings.dateFilterField || 'dueDate';

			try {
				// 设置为当天的全天任务（去掉时间）
				const today = getTodayInTimezone();
				sourceTask.datePrecision = { ...sourceTask.datePrecision, [dateFieldName]: 'day' };

				await updateTaskDateField(
					this.app,
					sourceTask,
					dateFieldName,
					today,
					this.plugin.settings.enabledTaskFormats
				);

				Logger.debug('DailyTimelineTab', 'Task set to all-day via drag-drop', { taskId });
			} catch (error) {
				Logger.error('DailyTimelineTab', 'Error setting task to all-day:', error);
				new Notice(i18n.t('views.dayView.updateTaskFailed'));
			}
		});
	}

	private renderTaskCards(container: HTMLElement, tasks: GCTask[]): void {
		const config = buildSidebarConfig(this.plugin.settings);
		for (const task of tasks) {
			const card = new TaskCardComponent({
				task,
				config,
				container,
				app: this.app,
				plugin: this.plugin,
				onClick: () => {
					openFileInExistingLeaf(this.app, task.filePath, task.lineNumber);
				},
				onRefresh: () => {
					// 刷新通过缓存更新事件自动触发
				},
			});
			const result = card.render();
			this.cardResults.push(result);
		}
	}

	private destroyCards(): void {
		for (const card of this.cardResults) {
			card.destroy();
		}
		this.cardResults = [];
	}
}
