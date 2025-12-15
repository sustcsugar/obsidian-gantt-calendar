import { ItemView, WorkspaceLeaf, Plugin, setIcon, TFile, MarkdownRenderer, Notice } from 'obsidian';
import { CalendarViewType } from './types';
import { generateMonthCalendar, getWeekOfDate, formatDate, formatMonth, isToday, isThisWeek, isThisMonth, openFileInExistingLeaf } from './utils';
import { searchTasks, GanttTask } from './taskManager';

export const CALENDAR_VIEW_ID = 'gantt-calendar-view';

export class CalendarView extends ItemView {
	private currentDate: Date = new Date();
	private viewType: CalendarViewType = 'year';
	private lastCalendarViewType: CalendarViewType = 'month';
	private resizeObserver: ResizeObserver | null = null;
	private yearContainer: HTMLElement | null = null;
	private plugin: any;
	private taskFilter: 'all' | 'completed' | 'uncompleted' = 'all'; // 默认显示全部任务（包括已完成和未完成）
	private dateFilter: 'all' | 'today' | 'week' | 'month' = 'today'; // 默认显示当日任务
	private cacheUpdateListener: (() => void) | null = null;

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
		// 等待任务缓存准备完成，避免首屏任务为空
		if (this.plugin?.taskCache?.whenReady) {
			await this.plugin.taskCache.whenReady();
		}
		this.render();
		this.setupResizeObserver();
		this.applyYearLunarFontSize();

		// 订阅缓存更新事件
		this.cacheUpdateListener = () => {
			if (this.containerEl.isConnected) {
				this.render();
			}
		};
		this.plugin?.taskCache?.onUpdate(this.cacheUpdateListener);
	}
	
	public refreshSettings(): void {
		// 实时应用设置需要重新渲染内容（周起始日、布局等）
		this.render();
		// 应用农历字号设置
		this.applyYearLunarFontSize();
	}

	async onClose(): Promise<void> {
		// Unsubscribe from cache updates
		if (this.cacheUpdateListener) {
			this.plugin?.taskCache?.offUpdate(this.cacheUpdateListener);
			this.cacheUpdateListener = null;
		}

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

			// 状态筛选标签和按钮
			const statusFilterGroup = right.createDiv('gantt-filter-group');
			const statusLabel = statusFilterGroup.createEl('span', { text: '状态筛选', cls: 'gantt-filter-group-label' });
			
			const filterButtons = statusFilterGroup.createDiv('gantt-task-filter-buttons');
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

			// 分割线
			const divider = right.createDiv('gantt-filter-divider');

			// 日期筛选标签和按钮
			const dateFilterGroup = right.createDiv('gantt-filter-group');
			const dateLabel = dateFilterGroup.createEl('span', { text: '日期筛选', cls: 'gantt-filter-group-label' });
			
			const dateFilterButtons = dateFilterGroup.createDiv('gantt-task-filter-buttons');
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

			const refreshBtn = right.createEl('button', { cls: 'calendar-view-btn icon-btn', attr: { title: '刷新任务' } });
			setIcon(refreshBtn, 'rotate-ccw');
			refreshBtn.addEventListener('click', async () => {
			// 重新扫描库并更新缓存
			await this.plugin.taskCache.initialize(
				this.plugin.settings.globalTaskFilter,
				this.plugin.settings.enabledTaskFormats
			);
			this.render();
		});
			right.appendChild(refreshBtn);
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

			// 刷新按钮（图标模式 + 悬浮提示）
			const refreshBtn = right.createEl('button', { cls: 'calendar-view-btn icon-btn', attr: { title: '刷新任务' } });
			setIcon(refreshBtn, 'rotate-ccw');
			refreshBtn.addEventListener('click', async () => {
				// 重新扫描库并更新缓存
				await this.plugin.taskCache.initialize(
					this.plugin.settings.globalTaskFilter,
					this.plugin.settings.enabledTaskFormats
				);
				this.render();
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
		// 预计算当年每日任务数量（依据设置的日期筛选字段）
		const tasks: GanttTask[] = this.plugin.taskCache?.getAllTasks?.() || [];
		const dateField = this.plugin.settings.dateFilterField || 'dueDate';
		const countsMap: Map<string, number> = new Map();
		const startDate = new Date(year, 0, 1);
		const endDate = new Date(year, 11, 31);
		for (const t of tasks) {
			const d = (t as any)[dateField] as Date | undefined;
			if (!d) continue;
			if (d < startDate || d > endDate) continue;
			const key = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
			countsMap.set(key, (countsMap.get(key) || 0) + 1);
		}

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
				// 热力图：根据当天任务数量设置背景深浅
				const dayKey = `${day.date.getFullYear()}-${(day.date.getMonth()+1).toString().padStart(2,'0')}-${day.date.getDate().toString().padStart(2,'0')}`;
				const count = countsMap.get(dayKey) || 0;
				if (this.plugin.settings.yearHeatmapEnabled && count > 0) {
					const palette = this.plugin.settings.yearHeatmapPalette || 'blue';
					const level = count >= 20 ? 5 : count >= 10 ? 4 : count >= 5 ? 3 : count >= 2 ? 2 : 1;
					dayEl.addClass(`heatmap-${palette}-${level}`);
				}
				
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
				
				// 在农历下方显示任务数量（可选）
				if (this.plugin.settings.yearShowTaskCount && count > 0) {
					const countEl = dayEl.createEl('div', { text: `${count}` });
					countEl.addClass('calendar-day-task-count');
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
				
				// Tasks list for this day
				const tasksContainer = dayEl.createDiv('calendar-month-tasks');
				this.loadMonthViewTasks(tasksContainer, day.date);
				
				if (!day.isCurrentMonth) {
					dayEl.addClass('outside-month');
				}
				if (day.isToday) {
					dayEl.addClass('today');
				}
				dayEl.onclick = (e: MouseEvent) => {
					// Only select date when clicking on the card, not on tasks
					if ((e.target as HTMLElement).closest('.calendar-month-task-item')) {
						return;
					}
					this.selectDate(day.date);
				};
			});
		});
	}

	private renderWeekView(container: HTMLElement): void {
		const weekData = getWeekOfDate(this.currentDate, this.currentDate.getFullYear(), !!(this.plugin?.settings?.startOnMonday));

		const weekContainer = container.createDiv('calendar-week-view');

		// Week grid with header and tasks
		const weekGrid = weekContainer.createDiv('calendar-week-grid');

		// Header row with day names
		const headerRow = weekGrid.createDiv('calendar-week-header-row');

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

		// Tasks grid - seven columns for seven days
		const tasksGrid = weekGrid.createDiv('calendar-week-tasks-grid');
		weekData.days.forEach((day) => {
			const dayTasksColumn = tasksGrid.createDiv('calendar-week-tasks-column');
			if (day.isToday) {
				dayTasksColumn.addClass('today');
			}

			// Load and display tasks for this day
			this.loadWeekViewTasks(dayTasksColumn, day.date);
		});
	}

	private async loadWeekViewTasks(columnContainer: HTMLElement, targetDate: Date): Promise<void> {
		columnContainer.empty();

		try {
			// Get tasks from cache instead of scanning
			let tasks: GanttTask[] = this.plugin.taskCache.getAllTasks();

			// Get the date field to filter by
			const dateField = this.plugin.settings.dateFilterField || 'dueDate';

			// Normalize target date to compare by Y-M-D
			const normalizedTarget = new Date(targetDate);
			normalizedTarget.setHours(0, 0, 0, 0);

			// Filter tasks for the target day
			const currentDayTasks = tasks.filter(task => {
				const dateValue = (task as any)[dateField];
				if (!dateValue) return false;
				
				const taskDate = new Date(dateValue);
				if (isNaN(taskDate.getTime())) return false;
				taskDate.setHours(0, 0, 0, 0);
				
				return taskDate.getTime() === normalizedTarget.getTime();
			});

			if (currentDayTasks.length === 0) {
				columnContainer.createEl('div', { text: '暂无任务', cls: 'calendar-week-task-empty' });
				return;
			}

			currentDayTasks.forEach(task => this.renderWeekTaskItem(task, columnContainer));
		} catch (error) {
			console.error('Error loading week view tasks', error);
			columnContainer.createEl('div', { text: '加载出错', cls: 'calendar-week-task-empty' });
		}
	}

	private renderWeekTaskItem(task: GanttTask, container: HTMLElement): void {
		const taskItem = container.createDiv('calendar-week-task-item');
		taskItem.addClass(task.completed ? 'completed' : 'pending');

		// Checkbox
		const checkbox = taskItem.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
		checkbox.checked = task.completed;
		checkbox.disabled = true;
		checkbox.addClass('calendar-week-task-checkbox');

		// Task content: only clean description, no global filter, priority, or time properties
		const cleaned = this.cleanTaskDescription(task.content);
		taskItem.createEl('span', { text: cleaned, cls: 'calendar-week-task-text' });

		// Create tooltip for detailed information
		let tooltip: HTMLElement | null = null;
		let hideTimeout: number | null = null;

		const showTooltip = (e: MouseEvent) => {
			// Clear any pending hide timeout
			if (hideTimeout) {
				window.clearTimeout(hideTimeout);
				hideTimeout = null;
			}

			// Remove existing tooltip if any
			if (tooltip) {
				tooltip.remove();
			}

			// Create tooltip
			tooltip = document.body.createDiv('calendar-week-task-tooltip');
			tooltip.style.opacity = '0';
			
			// Task description with global filter
			const gf = (this.plugin?.settings?.globalTaskFilter || '').trim();
			const displayText = this.plugin?.settings?.showGlobalFilterInTaskText && gf ? `${gf} ${cleaned}` : cleaned;
			const descDiv = tooltip.createDiv('tooltip-description');
			descDiv.createEl('strong', { text: displayText });

			// Priority
			if (task.priority) {
				const priorityDiv = tooltip.createDiv('tooltip-priority');
				const priorityIcon = this.getPriorityIcon(task.priority);
				priorityDiv.createEl('span', { text: `${priorityIcon} 优先级: ${task.priority}`, cls: `priority-${task.priority}` });
			}

			// Time properties
			const hasTimeProperties = task.createdDate || task.startDate || task.scheduledDate || 
			                          task.dueDate || task.cancelledDate || task.completionDate;
			
			if (hasTimeProperties) {
				const timeDiv = tooltip.createDiv('tooltip-time-properties');
				
				if (task.createdDate) {
					timeDiv.createEl('div', { text: `➕ 创建: ${this.formatDateForDisplay(task.createdDate)}`, cls: 'tooltip-time-item' });
				}
				
				if (task.startDate) {
					timeDiv.createEl('div', { text: `🛫 开始: ${this.formatDateForDisplay(task.startDate)}`, cls: 'tooltip-time-item' });
				}
				
				if (task.scheduledDate) {
					timeDiv.createEl('div', { text: `⏳ 计划: ${this.formatDateForDisplay(task.scheduledDate)}`, cls: 'tooltip-time-item' });
				}
				
				if (task.dueDate) {
					const dueText = `📅 截止: ${this.formatDateForDisplay(task.dueDate)}`;
					const dueEl = timeDiv.createEl('div', { text: dueText, cls: 'tooltip-time-item' });
					if (task.dueDate < new Date() && !task.completed) {
						dueEl.addClass('tooltip-overdue');
					}
				}
				
				if (task.cancelledDate) {
					timeDiv.createEl('div', { text: `❌ 取消: ${this.formatDateForDisplay(task.cancelledDate)}`, cls: 'tooltip-time-item' });
				}
				
				if (task.completionDate) {
					timeDiv.createEl('div', { text: `✅ 完成: ${this.formatDateForDisplay(task.completionDate)}`, cls: 'tooltip-time-item' });
				}
			}

			// File location
			const fileDiv = tooltip.createDiv('tooltip-file');
			fileDiv.createEl('span', { text: `📄 ${task.fileName}:${task.lineNumber}`, cls: 'tooltip-file-location' });

			// Position tooltip
			const rect = taskItem.getBoundingClientRect();
			const tooltipWidth = 300; // Estimated width
			const tooltipHeight = tooltip.offsetHeight;
			
			// Try to position to the right of the task item
			let left = rect.right + 10;
			let top = rect.top;
			
			// If tooltip would go off right edge, position to the left
			if (left + tooltipWidth > window.innerWidth) {
				left = rect.left - tooltipWidth - 10;
			}
			
			// If tooltip would go off left edge, center it on screen
			if (left < 0) {
				left = (window.innerWidth - tooltipWidth) / 2;
			}
			
			// Adjust vertical position if needed
			if (top + tooltipHeight > window.innerHeight) {
				top = window.innerHeight - tooltipHeight - 10;
			}
			if (top < 0) {
				top = 10;
			}
			
			tooltip.style.left = `${left}px`;
			tooltip.style.top = `${top}px`;
			
			// Trigger fade-in animation
			setTimeout(() => {
				if (tooltip) {
					tooltip.style.opacity = '1';
					tooltip.addClass('tooltip-show');
				}
			}, 10);
		};

		const hideTooltip = () => {
			hideTimeout = window.setTimeout(() => {
				if (tooltip) {
					// Start fade-out animation
					tooltip.removeClass('tooltip-show');
					tooltip.style.opacity = '0';
					
					// Remove element after animation completes
					setTimeout(() => {
						if (tooltip) {
							tooltip.remove();
							tooltip = null;
						}
					}, 200); // Match CSS transition duration
				}
			}, 100); // Small delay before starting hide
		};

		taskItem.addEventListener('mouseenter', showTooltip);
		taskItem.addEventListener('mouseleave', hideTooltip);

		// Click to open task location
		taskItem.onclick = async () => {
			await openFileInExistingLeaf(this.app, task.filePath, task.lineNumber);
		};
	}

	private async loadMonthViewTasks(container: HTMLElement, targetDate: Date): Promise<void> {
		container.empty();

		try {
			// Get tasks from cache instead of scanning
			let tasks: GanttTask[] = this.plugin.taskCache.getAllTasks();

			// Get the date field to filter by
			const dateField = this.plugin.settings.dateFilterField || 'dueDate';

			// Normalize target date to compare by Y-M-D
			const normalizedTarget = new Date(targetDate);
			normalizedTarget.setHours(0, 0, 0, 0);

			// Filter tasks for the target day
			const currentDayTasks = tasks.filter(task => {
				const dateValue = (task as any)[dateField];
				if (!dateValue) return false;
				
				const taskDate = new Date(dateValue);
				if (isNaN(taskDate.getTime())) return false;
				taskDate.setHours(0, 0, 0, 0);
				
				return taskDate.getTime() === normalizedTarget.getTime();
			});

			if (currentDayTasks.length === 0) {
				return; // Don't show anything if no tasks
			}

			// Get task limit from settings (default 5)
			const taskLimit = this.plugin.settings.monthViewTaskLimit || 5;
			
			// Limit to configured number of tasks to avoid overflow
			const displayTasks = currentDayTasks.slice(0, taskLimit);
			displayTasks.forEach(task => this.renderMonthTaskItem(task, container));
			
			// Show count if there are more tasks
			if (currentDayTasks.length > taskLimit) {
				const moreCount = container.createDiv('calendar-month-task-more');
				moreCount.setText(`+${currentDayTasks.length - taskLimit} more`);
			}
		} catch (error) {
			console.error('Error loading month view tasks', error);
		}
	}

	private renderMonthTaskItem(task: GanttTask, container: HTMLElement): void {
		const taskItem = container.createDiv('calendar-month-task-item');
		taskItem.addClass(task.completed ? 'completed' : 'pending');

		// Task content: only clean description
		const cleaned = this.cleanTaskDescription(task.content);
		taskItem.createEl('span', { text: cleaned, cls: 'calendar-month-task-text' });

		// Create tooltip for detailed information
		let tooltip: HTMLElement | null = null;
		let hideTimeout: number | null = null;

		const showTooltip = (e: MouseEvent) => {
			e.stopPropagation();
			
			if (hideTimeout) {
				window.clearTimeout(hideTimeout);
				hideTimeout = null;
			}

			if (tooltip) {
				tooltip.remove();
			}

			tooltip = document.body.createDiv('calendar-week-task-tooltip');
			tooltip.style.opacity = '0';
			
			const gf = (this.plugin?.settings?.globalTaskFilter || '').trim();
			const displayText = this.plugin?.settings?.showGlobalFilterInTaskText && gf ? `${gf} ${cleaned}` : cleaned;
			const descDiv = tooltip.createDiv('tooltip-description');
			descDiv.createEl('strong', { text: displayText });

			if (task.priority) {
				const priorityDiv = tooltip.createDiv('tooltip-priority');
				const priorityIcon = this.getPriorityIcon(task.priority);
				priorityDiv.createEl('span', { text: `${priorityIcon} 优先级: ${task.priority}`, cls: `priority-${task.priority}` });
			}

			const hasTimeProperties = task.createdDate || task.startDate || task.scheduledDate || 
			                          task.dueDate || task.cancelledDate || task.completionDate;
			
			if (hasTimeProperties) {
				const timeDiv = tooltip.createDiv('tooltip-time-properties');
				
				if (task.createdDate) {
					timeDiv.createEl('div', { text: `➕ 创建: ${this.formatDateForDisplay(task.createdDate)}`, cls: 'tooltip-time-item' });
				}
				
				if (task.startDate) {
					timeDiv.createEl('div', { text: `🛫 开始: ${this.formatDateForDisplay(task.startDate)}`, cls: 'tooltip-time-item' });
				}
				
				if (task.scheduledDate) {
					timeDiv.createEl('div', { text: `⏳ 计划: ${this.formatDateForDisplay(task.scheduledDate)}`, cls: 'tooltip-time-item' });
				}
				
				if (task.dueDate) {
					const dueText = `📅 截止: ${this.formatDateForDisplay(task.dueDate)}`;
					const dueEl = timeDiv.createEl('div', { text: dueText, cls: 'tooltip-time-item' });
					if (task.dueDate < new Date() && !task.completed) {
						dueEl.addClass('tooltip-overdue');
					}
				}
				
				if (task.cancelledDate) {
					timeDiv.createEl('div', { text: `❌ 取消: ${this.formatDateForDisplay(task.cancelledDate)}`, cls: 'tooltip-time-item' });
				}
				
				if (task.completionDate) {
					timeDiv.createEl('div', { text: `✅ 完成: ${this.formatDateForDisplay(task.completionDate)}`, cls: 'tooltip-time-item' });
				}
			}

			const fileDiv = tooltip.createDiv('tooltip-file');
			fileDiv.createEl('span', { text: `📄 ${task.fileName}:${task.lineNumber}`, cls: 'tooltip-file-location' });

			const rect = taskItem.getBoundingClientRect();
			const tooltipWidth = 300;
			const tooltipHeight = tooltip.offsetHeight;
			
			let left = rect.right + 10;
			let top = rect.top;
			
			if (left + tooltipWidth > window.innerWidth) {
				left = rect.left - tooltipWidth - 10;
			}
			
			if (left < 0) {
				left = (window.innerWidth - tooltipWidth) / 2;
			}
			
			if (top + tooltipHeight > window.innerHeight) {
				top = window.innerHeight - tooltipHeight - 10;
			}
			if (top < 0) {
				top = 10;
			}
			
			tooltip.style.left = `${left}px`;
			tooltip.style.top = `${top}px`;
			
			setTimeout(() => {
				if (tooltip) {
					tooltip.style.opacity = '1';
					tooltip.addClass('tooltip-show');
				}
			}, 10);
		};

		const hideTooltip = () => {
			hideTimeout = window.setTimeout(() => {
				if (tooltip) {
					tooltip.removeClass('tooltip-show');
					tooltip.style.opacity = '0';
					
					setTimeout(() => {
						if (tooltip) {
							tooltip.remove();
							tooltip = null;
						}
					}, 200);
				}
			}, 100);
		};

		taskItem.addEventListener('mouseenter', showTooltip);
		taskItem.addEventListener('mouseleave', hideTooltip);

		taskItem.onclick = async (e: MouseEvent) => {
			e.stopPropagation();
			await openFileInExistingLeaf(this.app, task.filePath, task.lineNumber);
		};
	}

	private renderDayView(container: HTMLElement): void {
		const dayContainer = container.createDiv('calendar-day-view');

		// Check if Daily Note should be displayed
		const enableDailyNote = this.plugin.settings.enableDailyNote !== false;

		if (enableDailyNote) {
			const layout = this.plugin.settings.dayViewLayout || 'horizontal';

			if (layout === 'horizontal') {
				// Horizontal split-screen layout (tasks left, notes right)
				this.renderDayViewHorizontal(dayContainer);
			} else {
				// Vertical split-screen layout (tasks top, notes bottom)
				this.renderDayViewVertical(dayContainer);
			}
		} else {
			// Display tasks only (full width)
			const tasksSection = dayContainer.createDiv('calendar-day-tasks-section-full');
			const tasksTitle = tasksSection.createEl('h3', { text: '当日任务' });
			tasksTitle.addClass('calendar-day-tasks-title');
			const tasksList = tasksSection.createDiv('calendar-day-tasks-list');

			// Load and display tasks for current view date
			this.loadDayViewTasks(tasksList, new Date(this.currentDate));
		}
	}

	private renderDayViewHorizontal(dayContainer: HTMLElement): void {
		// Split-screen layout container
		const splitContainer = dayContainer.createDiv('calendar-day-split-container');

		// Tasks section (left)
		const tasksSection = splitContainer.createDiv('calendar-day-tasks-section');
		const tasksTitle = tasksSection.createEl('h3', { text: '当日任务' });
		tasksTitle.addClass('calendar-day-tasks-title');
		const tasksList = tasksSection.createDiv('calendar-day-tasks-list');

		// Divider (middle)
		const divider = splitContainer.createDiv('calendar-day-divider');

		// Notes section (right)
		const notesSection = splitContainer.createDiv('calendar-day-notes-section');
		const notesTitle = notesSection.createEl('h3', { text: 'Daily Note' });
		notesTitle.addClass('calendar-day-notes-title');
		const notesContent = notesSection.createDiv('calendar-day-notes-content');

		// Setup resizable divider
		this.setupDayViewDivider(divider, tasksSection, notesSection);

		// Load and display tasks for current view date
		this.loadDayViewTasks(tasksList, new Date(this.currentDate));

		// Load and display daily note for current view date
		this.loadDayViewNotes(notesContent, new Date(this.currentDate));
	}

	private renderDayViewVertical(dayContainer: HTMLElement): void {
		// Vertical split-screen layout container
		const splitContainer = dayContainer.createDiv('calendar-day-split-container-vertical');

		// Tasks section (top)
		const tasksSection = splitContainer.createDiv('calendar-day-tasks-section-vertical');
		const tasksTitle = tasksSection.createEl('h3', { text: '当日任务' });
		tasksTitle.addClass('calendar-day-tasks-title');
		const tasksList = tasksSection.createDiv('calendar-day-tasks-list');

		// Divider (middle)
		const divider = splitContainer.createDiv('calendar-day-divider-vertical');

		// Notes section (bottom)
		const notesSection = splitContainer.createDiv('calendar-day-notes-section-vertical');
		const notesTitle = notesSection.createEl('h3', { text: 'Daily Note' });
		notesTitle.addClass('calendar-day-notes-title');
		const notesContent = notesSection.createDiv('calendar-day-notes-content');

		// Setup resizable divider for vertical
		this.setupDayViewDividerVertical(divider, tasksSection, notesSection);

		// Load and display tasks for current view date
		this.loadDayViewTasks(tasksList, new Date(this.currentDate));

		// Load and display daily note for current view date
		this.loadDayViewNotes(notesContent, new Date(this.currentDate));
	}

	private async loadDayViewTasks(listContainer: HTMLElement, targetDate: Date): Promise<void> {
		listContainer.empty();
		listContainer.createEl('div', { text: '加载中...', cls: 'gantt-task-empty' });

		try {
			// Get tasks from cache instead of scanning
			let tasks: GanttTask[] = this.plugin.taskCache.getAllTasks();

			// Get the date field to filter by
			const dateField = this.plugin.settings.dateFilterField || 'dueDate';

			// Normalize target date to compare by Y-M-D
			const normalizedTarget = new Date(targetDate);
			normalizedTarget.setHours(0, 0, 0, 0);

			// Filter tasks for the target day
			const currentDayTasks = tasks.filter(task => {
				const dateValue = (task as any)[dateField];
				if (!dateValue) return false;
				
				const taskDate = new Date(dateValue);
				if (isNaN(taskDate.getTime())) return false;
				taskDate.setHours(0, 0, 0, 0);
				
				return taskDate.getTime() === normalizedTarget.getTime();
			});

			listContainer.empty();

			if (currentDayTasks.length === 0) {
				listContainer.createEl('div', { text: '暂无任务', cls: 'gantt-task-empty' });
				return;
			}

			currentDayTasks.forEach(task => this.renderTaskItem(task, listContainer));
		} catch (error) {
			console.error('Error loading day view tasks', error);
			listContainer.empty();
			listContainer.createEl('div', { text: '加载任务时出错', cls: 'gantt-task-empty' });
		}
	}

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
				const newNotesWidth = Math.max(100, totalWidth - newTasksWidth - 8); // 8px for divider

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
				const newNotesHeight = Math.max(100, totalHeight - newTasksHeight - 8); // 8px for divider

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

	private formatDateByPattern(date: Date, pattern: string): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');

		return pattern
			.replace('yyyy', String(year))
			.replace('MM', month)
			.replace('dd', day);
	}

	private async loadDayViewNotes(contentContainer: HTMLElement, targetDate: Date): Promise<void> {
		contentContainer.empty();
		contentContainer.createEl('div', { text: '加载中...', cls: 'gantt-task-empty' });

		try {
			const folderPath = this.plugin.settings.dailyNotePath || 'DailyNotes';
			const nameFormat = this.plugin.settings.dailyNoteNameFormat || 'yyyy-MM-dd';
			const fileName = this.formatDateByPattern(targetDate, nameFormat) + '.md';
			const filePath = `${folderPath}/${fileName}`;

			const file = this.app.vault.getAbstractFileByPath(filePath);

			// 检查文件是否存在且是文件类型
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

			// 使用 MarkdownRenderer 渲染 Markdown 内容为阅读视图
			const noteContent = contentContainer.createDiv('calendar-day-notes-markdown');
			await MarkdownRenderer.render(this.app, content, noteContent, file.path, this);
		} catch (error) {
			console.error('Error loading daily note', error);
			contentContainer.empty();
			contentContainer.createEl('div', { text: '加载 Daily Note 时出错', cls: 'gantt-task-empty' });
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
			// Get tasks from cache instead of scanning
			let tasks: GanttTask[] = this.plugin.taskCache.getAllTasks();

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
		checkbox.disabled = false; // 启用复选框
		checkbox.addClass('gantt-task-checkbox');

		// 复选框变更事件
		checkbox.addEventListener('change', async (e) => {
			console.log('[CalendarView] Checkbox change event triggered', e);
			e.stopPropagation(); // 防止事件冒泡
			const isNowCompleted = checkbox.checked;
			try {
				const { updateTaskCompletion } = await import('./taskManager');
				await updateTaskCompletion(
					this.app,
					task,
					isNowCompleted,
					this.plugin.settings.enabledTaskFormats
				);
				// 更新 UI 状态（视图会自动刷新）
				taskItem.toggleClass('completed', isNowCompleted);
				taskItem.toggleClass('pending', !isNowCompleted);
			} catch (error) {
				console.error('Error updating task:', error);
				new Notice('更新任务失败');
				// 恢复复选框状态
				checkbox.checked = task.completed;
			}
		});

		// 添加 click 事件监听用于调试
		checkbox.addEventListener('click', (e) => {
			console.log('[CalendarView] Checkbox click event triggered', e);
			e.stopPropagation();
		});

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
			await openFileInExistingLeaf(this.app, task.filePath, task.lineNumber);
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
