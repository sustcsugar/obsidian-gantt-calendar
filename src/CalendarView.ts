import { ItemView, WorkspaceLeaf, Plugin, setIcon } from 'obsidian';
import { CalendarViewType } from './types';
import { generateMonthCalendar, getWeekOfDate, formatDate, formatMonth, isToday, isThisWeek, isThisMonth } from './utils';
import { searchTasks, GanttTask } from './taskManager';

export const CALENDAR_VIEW_ID = 'gantt-calendar-view';

export class CalendarView extends ItemView {
	private currentDate: Date = new Date();
	private viewType: CalendarViewType = 'year';
	private lastCalendarViewType: CalendarViewType = 'month';
	private resizeObserver: ResizeObserver | null = null;
	private yearContainer: HTMLElement | null = null;
	private plugin: any;
	private taskFilter: 'all' | 'completed' | 'uncompleted' = 'uncompleted';
	private dateFilter: 'all' | 'today' | 'week' | 'month' = 'all'; // 日期范围筛选：全部、今日、本周、本月

	constructor(leaf: WorkspaceLeaf, plugin: any) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return CALENDAR_VIEW_ID;
	}

	getDisplayText(): string {
		return 'Gantt Calendar';
	}

	getIcon(): string {
		return 'calendar-days';
	}

	async onOpen(): Promise<void> {
		this.render();
		this.setupResizeObserver();
		this.applyYearLunarFontSize();
	}
	
	public refreshSettings(): void {
		// 实时应用设置需要重新渲染内容（周起始日、布局等）
		this.render();
		// 应用农历字号设置
		this.applyYearLunarFontSize();
	}

	async onClose(): Promise<void> {
		// Cleanup
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
		}
	}

	private applyYearLunarFontSize(): void {
		const content = this.containerEl.children[1] as HTMLElement;
		if (!content) return;

		const lunarFontSize = this.plugin.settings.yearLunarFontSize || 10;
		// 应用农历字体大小到所有农历文本
		const lunarTexts = content.querySelectorAll('.calendar-lunar-text');
		lunarTexts.forEach((text: Element) => {
			(text as HTMLElement).style.fontSize = `${lunarFontSize}px`;
		});
	}

	private setupResizeObserver(): void {
		// 监听容器大小变化，重新计算是否显示农历
		const content = this.containerEl.children[1];
		if (!content) return;

		try {
			this.resizeObserver = new ResizeObserver(() => {
				if (this.viewType === 'year' && this.yearContainer) {
					this.updateYearDisplay();
				}
			});

			this.resizeObserver.observe(content);
		} catch (e) {
			// ResizeObserver not supported, fail silently
		}
	}

	private updateYearDisplay(): void {
		if (!this.yearContainer) return;

		const monthCards = this.yearContainer.querySelectorAll('.calendar-month-card');
		monthCards.forEach((card) => {
			this.updateYearCardDisplay(card as HTMLElement);
		});
	}

	private render(): void {
		const container = this.containerEl.children[1];
		container.empty();

		// Create toolbar
		const toolbar = container.createDiv('calendar-toolbar');
		this.createToolbar(toolbar);

		// Create calendar content
		const content = container.createDiv('calendar-content');
		this.renderCalendarContent(content);
	}

	private createToolbar(toolbar: HTMLElement): void {
		const isTaskView = this.viewType === 'task';

		// Left region: 视图选择（Tasks / Calendar）
		const left = toolbar.createDiv('calendar-toolbar-left');
		const toggleGroup = left.createDiv('calendar-toggle-group');
		const taskToggle = toggleGroup.createEl('button', { text: 'Tasks' });
		taskToggle.addClass('calendar-toggle-btn');
		if (isTaskView) taskToggle.addClass('active');
		taskToggle.onclick = () => this.switchView('task');

		const calendarToggle = toggleGroup.createEl('button', { text: 'Calendar' });
		calendarToggle.addClass('calendar-toggle-btn');
		if (!isTaskView) calendarToggle.addClass('active');
		calendarToggle.onclick = () => {
			const target = this.lastCalendarViewType || 'month';
			this.switchView(target);
		};

		// Center region: 显示区（日期范围或标题，日视图附加农历/节日）
		const center = toolbar.createDiv('calendar-toolbar-center');
		const dateDisplay = center.createEl('span');
		dateDisplay.addClass('calendar-date-display');
		if (this.viewType === 'day') {
			const lunar = this.getLunarInfo(this.currentDate);
			let displayText = this.getDateRangeText();
			if (lunar.lunarText) displayText += ` • ${lunar.lunarText}`;
			if (lunar.festival) displayText += ` • ${lunar.festival}`;
			dateDisplay.setText(displayText);
		} else {
			dateDisplay.setText(this.getDateRangeText());
		}

		// Right region: 功能区（随视图变化）
		const right = toolbar.createDiv('calendar-toolbar-right');
		if (isTaskView) {
			// Global Filter 状态
			const gfText = right.createEl('span', { cls: 'gantt-filter-label' });
			gfText.setText(`Global Filter: ${this.plugin?.settings?.globalTaskFilter || '（未设置）'}`);

			// 筛选按钮
			const filterButtons = right.createDiv('gantt-task-filter-buttons');
			const btnAll = filterButtons.createEl('button', { text: '全部', cls: 'gantt-filter-btn' });
			const btnUncompleted = filterButtons.createEl('button', { text: '未完成', cls: 'gantt-filter-btn' });
			const btnCompleted = filterButtons.createEl('button', { text: '已完成', cls: 'gantt-filter-btn' });

			const updateActive = () => {
				btnAll.toggleClass('active', this.taskFilter === 'all');
				btnUncompleted.toggleClass('active', this.taskFilter === 'uncompleted');
				btnCompleted.toggleClass('active', this.taskFilter === 'completed');
			};
			updateActive();

			btnAll.addEventListener('click', () => {
				this.taskFilter = 'all';
				updateActive();
				this.render();
			});
			btnUncompleted.addEventListener('click', () => {
				this.taskFilter = 'uncompleted';
				updateActive();
				this.render();
			});
			btnCompleted.addEventListener('click', () => {
				this.taskFilter = 'completed';
				updateActive();
				this.render();
			});

			// 日期筛选按钮
			const dateFilterButtons = right.createDiv('gantt-task-filter-buttons');
			const btnDateAll = dateFilterButtons.createEl('button', { text: '全部', cls: 'gantt-filter-btn' });
			const btnDateToday = dateFilterButtons.createEl('button', { text: '今日', cls: 'gantt-filter-btn' });
			const btnDateWeek = dateFilterButtons.createEl('button', { text: '本周', cls: 'gantt-filter-btn' });
			const btnDateMonth = dateFilterButtons.createEl('button', { text: '本月', cls: 'gantt-filter-btn' });

			const updateDateActive = () => {
				btnDateAll.toggleClass('active', this.dateFilter === 'all');
				btnDateToday.toggleClass('active', this.dateFilter === 'today');
				btnDateWeek.toggleClass('active', this.dateFilter === 'week');
				btnDateMonth.toggleClass('active', this.dateFilter === 'month');
			};
			updateDateActive();

			btnDateAll.addEventListener('click', () => {
				this.dateFilter = 'all';
				updateDateActive();
				this.render();
			});
			btnDateToday.addEventListener('click', () => {
				this.dateFilter = 'today';
				updateDateActive();
				this.render();
			});
			btnDateWeek.addEventListener('click', () => {
				this.dateFilter = 'week';
				updateDateActive();
				this.render();
			});
			btnDateMonth.addEventListener('click', () => {
				this.dateFilter = 'month';
				updateDateActive();
				this.render();
			});

			// 刷新按钮（图标模式 + 悬浮提示）
			const refreshBtn = right.createEl('button', { cls: 'calendar-view-btn icon-btn', attr: { title: '刷新任务' } });
			setIcon(refreshBtn, 'rotate-ccw');
			refreshBtn.addEventListener('click', () => this.render());
		} else {
			// 日历视图功能区：上一期/今天/下一期 + 子视图选择
			const navButtons = right.createDiv('calendar-nav-buttons');
			const prevBtn = navButtons.createEl('button', { text: '◀ 上一个' });
			prevBtn.addClass('calendar-nav-btn');
			prevBtn.onclick = () => this.previousPeriod();

			const nextBtn = navButtons.createEl('button', { text: '下一个 ▶' });
			nextBtn.addClass('calendar-nav-btn');
			nextBtn.onclick = () => this.nextPeriod();

			const todayBtn = navButtons.createEl('button', { text: '今天' });
			todayBtn.addClass('calendar-nav-btn');
			todayBtn.onclick = () => this.goToToday();

			const viewContainer = right.createDiv('calendar-view-selector');
			const viewTypes: { [key: string]: string } = {
				'day': '日',
				'week': '周',
				'month': '月',
				'year': '年',
			};

			['day', 'week', 'month', 'year'].forEach((type) => {
				const btn = viewContainer.createEl('button', { text: viewTypes[type] });
				btn.addClass('calendar-view-btn');
				if (type === this.viewType) btn.addClass('active');
				btn.onclick = () => this.switchView(type as CalendarViewType);
			});
		}
	}

	private renderCalendarContent(content: HTMLElement): void {
		switch (this.viewType) {
			case 'year':
				this.renderYearView(content);
				break;
			case 'month':
				this.renderMonthView(content);
				break;
			case 'week':
				this.renderWeekView(content);
				break;
			case 'day':
				this.renderDayView(content);
				break;
			case 'task':
				this.renderTaskView(content);
				break;
		}
	}

	private renderYearView(container: HTMLElement): void {
		const year = this.currentDate.getFullYear();
		const yearContainer = container.createDiv('calendar-year-container');
		this.yearContainer = yearContainer; // 保存引用

		const monthsGrid = yearContainer.createDiv('calendar-months-grid');

		for (let month = 1; month <= 12; month++) {
			const monthData = generateMonthCalendar(year, month, !!(this.plugin?.settings?.startOnMonday));
			const monthDiv = monthsGrid.createDiv('calendar-month-card');

			// Month header
			const monthHeader = monthDiv.createDiv('calendar-month-header');
			const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
			monthHeader.createEl('h3', {
				text: monthNames[month - 1],
			});

			// Week day labels
			const weekdaysDiv = monthDiv.createDiv('calendar-weekdays');
			const startOnMondayYear = !!(this.plugin?.settings?.startOnMonday);
			const labelsSunFirstY = ['日', '一', '二', '三', '四', '五', '六'];
			const labelsMonFirstY = ['一', '二', '三', '四', '五', '六', '日'];
			(startOnMondayYear ? labelsMonFirstY : labelsSunFirstY).forEach((day) => {
				weekdaysDiv.createEl('div', { text: day, cls: 'calendar-weekday' });
			});

			// Days grid
			const daysDiv = monthDiv.createDiv('calendar-days-grid');
			monthData.days.forEach((day) => {
				const dayEl = daysDiv.createEl('div');
				dayEl.addClass('calendar-day');
				
				const dateNum = dayEl.createEl('div', { text: day.day.toString() });
				dateNum.addClass('calendar-day-number');
				
				if (day.lunarText) {
					const lunarEl = dayEl.createEl('div', { text: day.lunarText });
					lunarEl.addClass('calendar-lunar-text');
					if (day.festival || day.festivalType) {
						lunarEl.addClass('festival');
						if (day.festivalType) {
							lunarEl.addClass(`festival-${day.festivalType}`);
						}
					}
				}
				
				if (!day.isCurrentMonth) {
					dayEl.addClass('outside-month');
				}
				if (day.isToday) {
					dayEl.addClass('today');
				}
				dayEl.onclick = () => this.selectDate(day.date);
			});

			// 延迟后检查卡片大小并决定是否显示农历
			setTimeout(() => {
				this.updateYearCardDisplay(monthDiv);
			}, 100);
		}
	}

	private updateYearCardDisplay(monthDiv: HTMLElement): void {
		// 获取卡片和day元素的实际大小
		const daysGrid = monthDiv.querySelector('.calendar-days-grid') as HTMLElement;
		if (!daysGrid) return;

		const dayElements = daysGrid.querySelectorAll('.calendar-day');
		
		if (dayElements.length === 0) return;

		const firstDay = dayElements[0] as HTMLElement;
		const dayRect = firstDay.getBoundingClientRect();

		// 如果单元格足够大（宽度 > 35px 且高度 > 45px），显示农历
		const showLunar = dayRect.width > 35 && dayRect.height > 45;

		if (showLunar) {
			monthDiv.addClass('show-lunar');
		} else {
			monthDiv.removeClass('show-lunar');
		}
	}

	private renderMonthView(container: HTMLElement): void {
		const year = this.currentDate.getFullYear();
		const month = this.currentDate.getMonth() + 1;
		const monthData = generateMonthCalendar(year, month, !!(this.plugin?.settings?.startOnMonday));

		const monthContainer = container.createDiv('calendar-month-view');

		// Week day labels
		const weekdaysDiv = monthContainer.createDiv('calendar-month-weekdays');
		// 首列占位与周编号列对齐
		weekdaysDiv.createEl('div', { text: '', cls: 'calendar-month-weekday' });
		const startOnMondayMonth = !!(this.plugin?.settings?.startOnMonday);
		const labelsSunFirstM = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
		const labelsMonFirstM = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
		(startOnMondayMonth ? labelsMonFirstM : labelsSunFirstM).forEach((day) => {
			weekdaysDiv.createEl('div', { text: day, cls: 'calendar-month-weekday' });
		});

		// Weeks
		const weeksDiv = monthContainer.createDiv('calendar-month-weeks');
		monthData.weeks.forEach((week) => {
			const weekDiv = weeksDiv.createDiv('calendar-week-row');

			// Week number
			const weekNum = weekDiv.createDiv('calendar-week-number');
			weekNum.createEl('span', { text: `W${week.weekNumber}` });

			// Days in week
			const daysDiv = weekDiv.createDiv('calendar-week-days');
			week.days.forEach((day) => {
				const dayEl = daysDiv.createEl('div');
				dayEl.addClass('calendar-day-cell');
				
				const dateNum = dayEl.createEl('div', { text: day.day.toString() });
				dateNum.addClass('calendar-day-number');
				
				if (day.lunarText) {
					const lunarEl = dayEl.createEl('div', { text: day.lunarText });
					lunarEl.addClass('calendar-lunar-text');
					if (day.festival || day.festivalType) {
						lunarEl.addClass('festival');
						if (day.festivalType) {
							lunarEl.addClass(`festival-${day.festivalType}`);
						}
					}
				}
				
				if (!day.isCurrentMonth) {
					dayEl.addClass('outside-month');
				}
				if (day.isToday) {
					dayEl.addClass('today');
				}
				dayEl.onclick = () => this.selectDate(day.date);
			});
		});
	}

	private renderWeekView(container: HTMLElement): void {
		const weekData = getWeekOfDate(this.currentDate, this.currentDate.getFullYear(), !!(this.plugin?.settings?.startOnMonday));

		const weekContainer = container.createDiv('calendar-week-view');

		// Week grid with time axis
		const weekGrid = weekContainer.createDiv('calendar-week-grid');

		// Header row with day names
		const headerRow = weekGrid.createDiv('calendar-week-header-row');
		const timeAxisHeader = headerRow.createDiv('calendar-time-axis-header');
		timeAxisHeader.setText('全天');

		// 使用数据层已按设置排序后的 weekData.days 顺序
		weekData.days.forEach((day) => {
			const dayHeader = headerRow.createDiv('calendar-day-header-cell');
			const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
			dayHeader.createEl('div', { text: dayNames[day.weekday], cls: 'day-name' });
			dayHeader.createEl('div', { text: day.day.toString(), cls: 'day-number' });
			if (day.lunarText) {
				dayHeader.createEl('div', { text: day.lunarText, cls: 'day-lunar' });
			}
			if (day.isToday) {
				dayHeader.addClass('today');
			}
		});

		// Time grid
		const timeGrid = weekGrid.createDiv('calendar-time-grid');

		// Time axis column
		const timeAxis = timeGrid.createDiv('calendar-time-axis');
		for (let hour = 0; hour < 24; hour++) {
			const timeSlot = timeAxis.createDiv('calendar-time-slot');
			timeSlot.setText(`${String(hour).padStart(2, '0')}:00`);
		}

		// Day columns
		const daysGrid = timeGrid.createDiv('calendar-days-grid');
		weekData.days.forEach((day, index) => {
			const dayColumn = daysGrid.createDiv('calendar-day-column-time');
			if (day.isToday) {
				dayColumn.addClass('today');
			}

			// Create 24 hour slots
			for (let hour = 0; hour < 24; hour++) {
				const hourSlot = dayColumn.createDiv('calendar-hour-slot');
				if (hour % 2 === 0) {
					hourSlot.addClass('even-hour');
				}
			}

			dayColumn.onclick = () => this.selectDate(day.date);
		});

		// Add current time indicator if today is in the week
		this.addCurrentTimeIndicator(timeGrid, weekData);
	}

	private addCurrentTimeIndicator(timeGrid: HTMLElement, weekData: any): void {
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

		// Check if today is in this week
		const isInWeek = weekData.days.some((day: any) => {
			const dayDate = new Date(day.date.getFullYear(), day.date.getMonth(), day.date.getDate());
			return dayDate.getTime() === today.getTime();
		});

		if (!isInWeek) return;

		const hours = now.getHours();
		const minutes = now.getMinutes();
		const percentFromTop = (hours * 60 + minutes) / (24 * 60) * 100;

		const indicator = timeGrid.createDiv('calendar-current-time-indicator');
		indicator.style.top = `${percentFromTop}%`;

		// Update indicator position every minute
		const updateInterval = window.setInterval(() => {
			const now = new Date();
			const hours = now.getHours();
			const minutes = now.getMinutes();
			const percentFromTop = (hours * 60 + minutes) / (24 * 60) * 100;
			indicator.style.top = `${percentFromTop}%`;
		}, 60000); // Update every minute

		// Clean up interval on view close
		this.registerInterval(updateInterval);
	}

	private renderDayView(container: HTMLElement): void {
		const dayContainer = container.createDiv('calendar-day-view');

		// Time grid
		const dayGrid = dayContainer.createDiv('calendar-day-grid');

		// Time axis
		const timeAxis = dayGrid.createDiv('calendar-time-axis');
		for (let hour = 0; hour < 24; hour++) {
			const timeSlot = timeAxis.createDiv('calendar-time-slot');
			timeSlot.setText(`${String(hour).padStart(2, '0')}:00`);
		}

		// Day column with hourly slots
		const dayColumn = dayGrid.createDiv('calendar-day-column-full');
		for (let hour = 0; hour < 24; hour++) {
			const hourSlot = dayColumn.createDiv('calendar-hour-slot');
			if (hour % 2 === 0) {
				hourSlot.addClass('even-hour');
			}
			// Can add events here later
		}

		// Add current time indicator if today
		const today = new Date();
		const isToday = this.currentDate.getFullYear() === today.getFullYear() &&
			this.currentDate.getMonth() === today.getMonth() &&
			this.currentDate.getDate() === today.getDate();

		if (isToday) {
			const hours = today.getHours();
			const minutes = today.getMinutes();
			const percentFromTop = (hours * 60 + minutes) / (24 * 60) * 100;

			const indicator = dayGrid.createDiv('calendar-current-time-indicator');
			indicator.style.top = `${percentFromTop}%`;

			// Update indicator position every minute
			const updateInterval = window.setInterval(() => {
				const now = new Date();
				const hours = now.getHours();
				const minutes = now.getMinutes();
				const percentFromTop = (hours * 60 + minutes) / (24 * 60) * 100;
				indicator.style.top = `${percentFromTop}%`;
			}, 60000); // Update every minute

			// Clean up interval on view close
			this.registerInterval(updateInterval);
		}
	}

	private renderTaskView(container: HTMLElement): void {
		container.addClass('gantt-task-view');

		// 主体仅包含统计与列表；筛选与刷新已移动到工具栏右侧
		const statsContainer = container.createDiv('gantt-task-stats');
		const listContainer = container.createDiv('gantt-task-list');

		this.loadTaskList(statsContainer, listContainer);
	}

	private async loadTaskList(statsContainer: HTMLElement, listContainer: HTMLElement): Promise<void> {
		statsContainer.empty();
		listContainer.empty();
		listContainer.createEl('div', { text: '加载中...', cls: 'gantt-task-empty' });

		try {
			let tasks = await searchTasks(this.app, this.plugin.settings.globalTaskFilter, this.plugin.settings.enabledTaskFormats);

			// Apply filter by completion state
			if (this.taskFilter === 'completed') {
				tasks = tasks.filter(t => t.completed);
			} else if (this.taskFilter === 'uncompleted') {
				tasks = tasks.filter(t => !t.completed);
			}

			// Apply date range filter
			const dateField = this.plugin.settings.dateFilterField || 'dueDate';
			if (this.dateFilter !== 'all') {
				tasks = tasks.filter(task => {
					const dateValue = (task as any)[dateField];
					if (!dateValue) return false; // 如果没有对应日期字段，则过滤掉
					
					const taskDate = new Date(dateValue);
					if (isNaN(taskDate.getTime())) return false; // 日期解析失败
					
					if (this.dateFilter === 'today') {
						return isToday(taskDate);
					} else if (this.dateFilter === 'week') {
						return isThisWeek(taskDate, this.plugin.settings.startOnMonday);
					} else if (this.dateFilter === 'month') {
						return isThisMonth(taskDate);
					}
					return true;
				});
			}

			listContainer.empty();

			const completedCount = tasks.filter(t => t.completed).length;
			statsContainer.empty();
			statsContainer.createEl('span', { text: `✓ 已完成: ${completedCount}` });
			statsContainer.createEl('span', { text: `○ 待完成: ${tasks.length - completedCount}` });

			if (tasks.length === 0) {
				listContainer.createEl('div', { text: '未找到符合条件的任务', cls: 'gantt-task-empty' });
				return;
			}

			tasks.forEach(task => this.renderTaskItem(task, listContainer));
		} catch (error) {
			console.error('Error rendering task view', error);
			listContainer.empty();
			listContainer.createEl('div', { text: '加载任务时出错', cls: 'gantt-task-empty' });
		}
	}

	private renderTaskItem(task: GanttTask, listContainer: HTMLElement): void {
		const taskItem = listContainer.createDiv('gantt-task-item');
		taskItem.addClass(task.completed ? 'completed' : 'pending');

		// Checkbox
		const checkbox = taskItem.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
		checkbox.checked = task.completed;
		checkbox.disabled = true;
		checkbox.addClass('gantt-task-checkbox');

		// Task content: clean description; optionally prefix global filter
		const cleaned = this.cleanTaskDescription(task.content);
		const gf = (this.plugin?.settings?.globalTaskFilter || '').trim();
		const displayText = this.plugin?.settings?.showGlobalFilterInTaskText && gf ? `${gf} ${cleaned}` : cleaned;
		taskItem.createEl('span', { text: displayText, cls: 'gantt-task-text' });

		// Priority badge
		if (task.priority) {
			const priorityIcon = this.getPriorityIcon(task.priority);
			const priorityEl = taskItem.createDiv('gantt-task-priority-inline');
			priorityEl.createEl('span', { text: priorityIcon, cls: `gantt-priority-badge priority-${task.priority}` });
		}

		// Time properties inline
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

		// File location
		taskItem.createEl('span', { text: `${task.fileName}:${task.lineNumber}`, cls: 'gantt-task-file' });

		taskItem.addEventListener('click', async () => {
			const file = this.app.vault.getAbstractFileByPath(task.filePath);
			if (file) {
				const leaf = this.app.workspace.getLeaf();
				if (leaf) {
					await leaf.openFile(file as any);
					const editor = this.app.workspace.activeEditor?.editor;
					if (editor) {
						editor.setCursor(task.lineNumber - 1, 0);
					}
				}
			}
		});
	}

	private getLunarInfo(date: Date): { lunarText: string; festival: string } {
		// Import lunar calculation
		const { getShortLunarText, solarToLunar } = require('./lunar');
		const lunar = solarToLunar(date);
		return {
			lunarText: getShortLunarText(date),
			festival: lunar.festival,
		};
	}

	private getPriorityIcon(priority?: string): string {
		switch (priority) {
			case 'highest':
				return '🔺';
			case 'high':
				return '⏫';
			case 'medium':
				return '🔼';
			case 'low':
				return '🔽';
			case 'lowest':
				return '⏬';
			default:
				return '';
		}
	}

	private formatDateForDisplay(date: Date): string {
		return formatDate(date, 'YYYY-MM-DD');
	}

	// Remove Tasks/Dataview attribute markers from task text
	private cleanTaskDescription(raw: string): string {
		let text = raw;
		// Remove Tasks emoji-based priority (must be before date markers)
		text = text.replace(/\s*(🔺|⏫|🔼|🔽|⏬)\s*/g, ' ');
		// Remove Tasks emoji-based date attributes
		text = text.replace(/\s*(➕|🛫|⏳|📅|❌|✅)\s*\d{4}-\d{2}-\d{2}\s*/g, ' ');
		// Remove Dataview [field:: value] blocks
		text = text.replace(/\s*\[(priority|created|start|scheduled|due|cancelled|completion)::[^\]]+\]\s*/g, ' ');
		// Collapse multiple spaces
		text = text.replace(/\s{2,}/g, ' ').trim();
		return text;
	}

	public switchView(type: CalendarViewType): void {
		if (type !== 'task') {
			this.lastCalendarViewType = type;
		}
		this.viewType = type;
		this.render();
	}

	private previousPeriod(): void {
		const date = new Date(this.currentDate);
		switch (this.viewType) {
			case 'year':
				date.setFullYear(date.getFullYear() - 1);
				break;
			case 'month':
				date.setMonth(date.getMonth() - 1);
				break;
			case 'week':
				date.setDate(date.getDate() - 7);
				break;
			case 'day':
				date.setDate(date.getDate() - 1);
				break;
			case 'task':
				return;
		}
		this.currentDate = date;
		this.render();
	}

	private nextPeriod(): void {
		const date = new Date(this.currentDate);
		switch (this.viewType) {
			case 'year':
				date.setFullYear(date.getFullYear() + 1);
				break;
			case 'month':
				date.setMonth(date.getMonth() + 1);
				break;
			case 'week':
				date.setDate(date.getDate() + 7);
				break;
			case 'day':
				date.setDate(date.getDate() + 1);
				break;
			case 'task':
				return;
		}
		this.currentDate = date;
		this.render();
	}

	private goToToday(): void {
		if (this.viewType === 'task') return;
		this.currentDate = new Date();
		this.render();
	}

	private selectDate(date: Date): void {
		this.currentDate = new Date(date);
		if (this.viewType !== 'day') {
			this.viewType = 'day';
		}
		this.render();
	}

	private getDateRangeText(): string {
		switch (this.viewType) {
			case 'year':
				return this.currentDate.getFullYear().toString();
			case 'month':
				return formatMonth(
					this.currentDate.getFullYear(),
					this.currentDate.getMonth() + 1
				);
			case 'week': {
				const week = getWeekOfDate(this.currentDate, undefined, !!(this.plugin?.settings?.startOnMonday));
				const start = formatDate(week.startDate);
				const end = formatDate(week.endDate);
				return `Week ${week.weekNumber} (${start} - ${end})`;
			}
			case 'day':
				return formatDate(this.currentDate, 'YYYY-MM-DD ddd');
			case 'task':
				return '任务视图';
		}
	}
}
