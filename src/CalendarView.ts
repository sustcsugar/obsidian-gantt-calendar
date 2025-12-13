import { ItemView, WorkspaceLeaf, Plugin } from 'obsidian';
import { CalendarViewType } from './types';
import { generateMonthCalendar, getWeekOfDate, formatDate, formatMonth } from './utils';

export const CALENDAR_VIEW_ID = 'gantt-calendar-view';

export class CalendarView extends ItemView {
	private currentDate: Date = new Date();
	private viewType: CalendarViewType = 'year';
	private resizeObserver: ResizeObserver | null = null;
	private yearContainer: HTMLElement | null = null;
	private plugin: any;

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
		this.applyYearViewGapSettings();
	}
	
	public refreshSettings(): void {
		// 实时应用设置需要重新渲染内容（周起始日、布局等）
		this.render();
		// 在渲染完新内容后应用 CSS 变量，避免被容器清空时丢失
		this.applyYearViewGapSettings();
	}

	async onClose(): Promise<void> {
		// Cleanup
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
		}
	}

	private applyYearViewGapSettings(): void {
		const content = this.containerEl.children[1] as HTMLElement;
		if (!content) return;

		const rowGap = this.plugin.settings.yearViewRowGap || 0;
		const columnGap = this.plugin.settings.yearViewColumnGap || 0;
        const lunarFontSize = this.plugin.settings.yearLunarFontSize || 10;

		// 直接应用到所有 calendar-days-grid 元素确保设置生效
		const daysGrids = content.querySelectorAll('.calendar-days-grid');
		daysGrids.forEach((grid: Element) => {
			(grid as HTMLElement).style.setProperty('--year-view-row-gap', `${rowGap}px`);
			(grid as HTMLElement).style.setProperty('--year-view-column-gap', `${columnGap}px`);
		});

		// 同时应用到 calendar-weekdays 确保星期标签与日期竖向对齐
		const weekdaysGrids = content.querySelectorAll('.calendar-weekdays');
		weekdaysGrids.forEach((grid: Element) => {
			(grid as HTMLElement).style.setProperty('--year-view-column-gap', `${columnGap}px`);
		});

		// 应用农历字体大小到整个容器
		content.style.setProperty('--year-lunar-font-size', `${lunarFontSize}px`);
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
		// Date navigation
		const navContainer = toolbar.createDiv('calendar-nav');

		const prevBtn = navContainer.createEl('button', { text: '◀ 上一个' });
		prevBtn.addClass('calendar-nav-btn');
		prevBtn.onclick = () => this.previousPeriod();

		const dateDisplay = navContainer.createEl('span', {
			text: this.getDateRangeText(),
		});
		dateDisplay.addClass('calendar-date-display');

		const nextBtn = navContainer.createEl('button', { text: '下一个 ▶' });
		nextBtn.addClass('calendar-nav-btn');
		nextBtn.onclick = () => this.nextPeriod();

		const todayBtn = navContainer.createEl('button', { text: '今天' });
		todayBtn.addClass('calendar-nav-btn');
		todayBtn.onclick = () => this.goToToday();

		// View type selector
		const viewContainer = toolbar.createDiv('calendar-view-selector');

		const viewTypes: { [key: string]: string } = {
			'day': '日',
			'week': '周',
			'month': '月',
			'year': '年'
		};

		['day', 'week', 'month', 'year'].forEach((type) => {
			const btn = viewContainer.createEl('button', {
				text: viewTypes[type],
			});
			btn.addClass('calendar-view-btn');
			if (type === this.viewType) {
				btn.addClass('active');
			}
			btn.onclick = () => this.switchView(type as CalendarViewType);
		});
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
					if (day.festival) {
						lunarEl.addClass('festival');
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
		const monthData = generateMonthCalendar(year, month);

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
					if (day.festival) {
						lunarEl.addClass('festival');
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

		// Show lunar date
		const lunarInfo = container.createDiv('calendar-lunar-info');
		const lunar = this.getLunarInfo(this.currentDate);
		if (lunar.lunarText) {
			lunarInfo.createEl('div', { text: lunar.lunarText, cls: 'lunar-date' });
		}
		if (lunar.festival) {
			lunarInfo.createEl('div', { text: lunar.festival, cls: 'lunar-festival' });
		}

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

	private getLunarInfo(date: Date): { lunarText: string; festival: string } {
		// Import lunar calculation
		const { getShortLunarText, solarToLunar } = require('./lunar');
		const lunar = solarToLunar(date);
		return {
			lunarText: getShortLunarText(date),
			festival: lunar.festival,
		};
	}

	private switchView(type: CalendarViewType): void {
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
		}
		this.currentDate = date;
		this.render();
	}

	private goToToday(): void {
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
		}
	}
}
