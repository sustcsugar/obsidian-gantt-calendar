import { Notice, App } from 'obsidian';
import { BaseViewRenderer } from './BaseViewRenderer';
import { generateMonthCalendar } from '../calendar/calendarGenerator';
import type { GCTask, StatusFilterState, TagFilterState, SortState } from '../types';
import { TaskCardComponent, MonthViewConfig } from '../components/TaskCard';
import { MonthViewClasses, TaskCardClasses } from '../utils/bem';
import { Logger } from '../utils/logger';
import { TooltipManager } from '../utils/tooltipManager';
import { updateTaskDateField } from '../tasks/taskUpdater';
import { sortTasks } from '../tasks/taskSorter';
import { DEFAULT_SORT_STATE } from '../types';

/**
 * 月视图渲染器
 */
export class MonthViewRenderer extends BaseViewRenderer {
	// 排序状态
	private sortState: SortState = DEFAULT_SORT_STATE;

	// 设置前缀
	private readonly SETTINGS_PREFIX = 'monthView';

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
			Logger.error('MonthView', 'Failed to save sort state', err);
		});
	}

	/**
	 * 重写状态筛选 setter 以支持持久化
	 */
	public setStatusFilterState(state: StatusFilterState): void {
		super.setStatusFilterState(state);
		this.saveStatusFilterState(this.SETTINGS_PREFIX).catch(err => {
			Logger.error('MonthView', 'Failed to save status filter', err);
		});
	}

	/**
	 * 重写标签筛选 setter 以支持持久化
	 */
	public setTagFilterState(state: TagFilterState): void {
		super.setTagFilterState(state);
		this.saveTagFilterState(this.SETTINGS_PREFIX).catch(err => {
			Logger.error('MonthView', 'Failed to save tag filter', err);
		});
	}
	/**
	 * 设置日期格子的拖放功能
	 */
	private setupDragDropForDayCell(dayCell: HTMLElement, targetDate: Date): void {
		dayCell.addEventListener('dragover', (e: DragEvent) => {
			e.preventDefault();
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}
			dayCell.style.backgroundColor = 'var(--background-modifier-hover)';
		});

		dayCell.addEventListener('dragleave', (e: DragEvent) => {
			if (e.target === dayCell) {
				dayCell.style.backgroundColor = '';
			}
		});

		dayCell.addEventListener('drop', async (e: DragEvent) => {
			e.preventDefault();
			dayCell.style.backgroundColor = '';

			const taskId = e.dataTransfer?.getData('taskId');
			if (!taskId) return;

			const [filePath, lineNum] = taskId.split(':');
			const lineNumber = parseInt(lineNum, 10);

			const allTasks = this.plugin.taskCache.getAllTasks();
			const sourceTask = allTasks.find((t: GCTask) => t.filePath === filePath && t.lineNumber === lineNumber);
			if (!sourceTask) {
				Logger.error('MonthView', 'Source task not found:', taskId);
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
				Logger.debug('MonthView', 'Task drag-drop update successful', { taskId, dateField: dateFieldName, targetDate });
			} catch (error) {
				Logger.error('MonthView', 'Error updating task date:', error);
				new Notice('更新任务日期失败');
			}
		});
	}

	render(container: HTMLElement, currentDate: Date): void {
		const year = currentDate.getFullYear();
		const month = currentDate.getMonth() + 1;
		const monthData = generateMonthCalendar(year, month, !!(this.plugin?.settings?.startOnMonday));

		// 使用单一Grid布局：7行8列（1行星期标题 + 6行周）
		const monthContainer = container.createDiv('gc-view gc-view--month');

		// 星期标签 - 第一行
		const startOnMonday = !!(this.plugin?.settings?.startOnMonday);
		const labelsSunFirst = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
		const labelsMonFirst = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

		// 创建第一列的空占位（第1行第1列）
		const emptyPlaceholder = monthContainer.createEl('div', { cls: MonthViewClasses.elements.weekday });
		emptyPlaceholder.classList.add('gc-month-view__weekday--empty');

		// 创建7个星期标签（第1行第2-8列）
		(startOnMonday ? labelsMonFirst : labelsSunFirst).forEach((day) => {
			monthContainer.createEl('div', { text: day, cls: MonthViewClasses.elements.weekday });
		});

		// 展平渲染：6行周数据，每行包含1个周编号 + 7个日期格子
		monthData.weeks.forEach((week, weekIndex) => {
			// 周编号 - 每周的第1列
			const weekNum = monthContainer.createDiv(MonthViewClasses.elements.weekNumber);
			weekNum.createEl('span', { text: `W${week.weekNumber}` });
			// 设置grid位置：第(weekIndex + 2)行，第1列
			weekNum.style.gridRow = `${weekIndex + 2}`;
			weekNum.style.gridColumn = '1';

			// 一周的日期 - 直接放在容器中，设置grid位置
			week.days.forEach((day, dayIndex) => {
				const dayEl = monthContainer.createEl('div');
				dayEl.addClass(MonthViewClasses.elements.dayCell);
				// 添加日期标识，用于增量刷新时定位
				dayEl.dataset.date = day.date.toISOString();
				// 设置grid位置：第(weekIndex + 2)行，第(dayIndex + 2)列
				dayEl.style.gridRow = `${weekIndex + 2}`;
				dayEl.style.gridColumn = `${dayIndex + 2}`;

				// 日期头部：包含日期数字和农历文本
				const dayHeader = dayEl.createDiv(MonthViewClasses.elements.dayHeader);
				const dateNum = dayHeader.createEl('div', { text: day.day.toString() });
				dateNum.addClass(MonthViewClasses.elements.dayNumber);

				// 中间分隔圆点
				const separator = dayHeader.createEl('span');
				separator.addClass(MonthViewClasses.elements.dayHeaderSeparator);

				if (day.lunarText) {
					const lunarEl = dayHeader.createEl('div', { text: day.lunarText });
					lunarEl.addClass(MonthViewClasses.elements.lunarText);
					if (day.festival || day.festivalType) {
						lunarEl.addClass(MonthViewClasses.modifiers.festival);
						if (day.festivalType) {
							// 根据节日类型添加对应的修饰符类名
							const festivalClassMap: Record<string, string> = {
								solar: MonthViewClasses.modifiers.festivalSolar,
								lunar: MonthViewClasses.modifiers.festivalLunar,
								solarTerm: MonthViewClasses.modifiers.festivalSolarTerm,
							};
							const festivalClass = festivalClassMap[day.festivalType];
							if (festivalClass) {
								lunarEl.addClass(festivalClass);
							}
						}
					}
				}

				// 任务列表
				const tasksContainer = dayEl.createDiv(MonthViewClasses.elements.tasks);
				this.loadMonthViewTasks(tasksContainer, day.date);

				// 设置拖放目标
				this.setupDragDropForDayCell(dayEl, day.date);

				if (!day.isCurrentMonth) {
					dayEl.addClass(MonthViewClasses.modifiers.outsideMonth);
				}
				if (day.isToday) {
					dayEl.addClass(MonthViewClasses.modifiers.today);
				}

				dayEl.onclick = (e: MouseEvent) => {
					// 点击任务时不触发日期选择（使用正确的任务卡片类名）
					if ((e.target as HTMLElement).closest(`.${TaskCardClasses.block}`)) {
						return;
					}
					if (this.plugin.calendarView) {
						this.plugin.calendarView.selectDate(day.date);
					}
				};
			});
		});
	}

	/**
	 * 增量刷新：只重新加载任务内容，不重建DOM
	 */
	public refreshTasks(): void {
		const container = document.querySelector('.gc-view.gc-view--month') as HTMLElement;
		if (!container) return;

		// 获取所有日期格子的任务容器
		const taskContainers = container.querySelectorAll('.gc-month-view__tasks');
		taskContainers.forEach((tasksContainer) => {
			const dayCell = tasksContainer.parentElement;
			const dateStr = dayCell?.dataset.date;
			if (dateStr) {
				const date = new Date(dateStr);
				this.loadMonthViewTasks(tasksContainer as HTMLElement, date);
			}
		});
	}

	/**
	 * 加载月视图任务
	 */
	private async loadMonthViewTasks(container: HTMLElement, targetDate: Date): Promise<void> {
		container.empty();

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
				return;
			}

			// 限制显示数量
			const taskLimit = this.plugin.settings.monthViewTaskLimit || 5;
			const displayTasks = currentDayTasks.slice(0, taskLimit);
			displayTasks.forEach(task => this.renderTaskItem(task, container));

			// 显示更多任务提示
			if (currentDayTasks.length > taskLimit) {
				const moreCount = container.createDiv(MonthViewClasses.elements.taskMore);
				moreCount.setText(`+${currentDayTasks.length - taskLimit} more`);
			}
		} catch (error) {
			Logger.error('MonthView', 'Error loading month view tasks', error);
		}
	}

	/**
	 * 渲染月视图任务项（使用统一组件）
	 */
	private renderTaskItem(task: GCTask, container: HTMLElement): void {
		new TaskCardComponent({
			task,
			config: MonthViewConfig,
			container,
			app: this.app,
			plugin: this.plugin,
			onClick: (task) => {
				// 隐藏 tooltip
				const tooltipManager = TooltipManager.getInstance(this.plugin);
				tooltipManager.hide();
				// 增量刷新：只更新任务，不重建DOM
				this.refreshTasks();
			},
		}).render();
	}
}
