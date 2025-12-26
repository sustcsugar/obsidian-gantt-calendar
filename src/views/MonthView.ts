import { BaseCalendarRenderer } from './BaseCalendarRenderer';
import { generateMonthCalendar } from '../calendar/calendarGenerator';
import type { GanttTask } from '../types';

/**
 * 月视图渲染器
 */
export class MonthViewRenderer extends BaseCalendarRenderer {

	render(container: HTMLElement, currentDate: Date): void {
		const year = currentDate.getFullYear();
		const month = currentDate.getMonth() + 1;
		const monthData = generateMonthCalendar(year, month, !!(this.plugin?.settings?.startOnMonday));

		const monthContainer = container.createDiv('calendar-month-view');

		// 星期标签
		const weekdaysDiv = monthContainer.createDiv('calendar-month-weekdays');
		weekdaysDiv.createEl('div', { text: '', cls: 'calendar-month-weekday' }); // 周编号列占位
		const startOnMonday = !!(this.plugin?.settings?.startOnMonday);
		const labelsSunFirst = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
		const labelsMonFirst = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
		(startOnMonday ? labelsMonFirst : labelsSunFirst).forEach((day) => {
			weekdaysDiv.createEl('div', { text: day, cls: 'calendar-month-weekday' });
		});

		// 周行
		const weeksDiv = monthContainer.createDiv('calendar-month-weeks');
		monthData.weeks.forEach((week) => {
			const weekDiv = weeksDiv.createDiv('calendar-week-row');

			// 周编号
			const weekNum = weekDiv.createDiv('calendar-week-number');
			weekNum.createEl('span', { text: `W${week.weekNumber}` });

			// 一周的日期
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

				// 任务列表
				const tasksContainer = dayEl.createDiv('calendar-month-tasks');
				this.loadMonthViewTasks(tasksContainer, day.date);

				if (!day.isCurrentMonth) {
					dayEl.addClass('outside-month');
				}
				if (day.isToday) {
					dayEl.addClass('today');
				}

				dayEl.onclick = (e: MouseEvent) => {
					// 点击任务时不触发日期选择
					if ((e.target as HTMLElement).closest('.calendar-month-task-item')) {
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
	 * 加载月视图任务
	 */
	private async loadMonthViewTasks(container: HTMLElement, targetDate: Date): Promise<void> {
		container.empty();

		try {
			const tasks: GanttTask[] = this.plugin.taskCache.getAllTasks();
			const dateField = this.plugin.settings.dateFilterField || 'dueDate';

			const normalizedTarget = new Date(targetDate);
			normalizedTarget.setHours(0, 0, 0, 0);

			// 筛选当天任务
			const currentDayTasks = tasks.filter(task => {
				const dateValue = (task as any)[dateField];
				if (!dateValue) return false;

				const taskDate = new Date(dateValue);
				if (isNaN(taskDate.getTime())) return false;
				taskDate.setHours(0, 0, 0, 0);

				return taskDate.getTime() === normalizedTarget.getTime();
			});

			if (currentDayTasks.length === 0) {
				return;
			}

			// 限制显示数量
			const taskLimit = this.plugin.settings.monthViewTaskLimit || 5;
			const displayTasks = currentDayTasks.slice(0, taskLimit);
			displayTasks.forEach(task => this.renderMonthTaskItem(task, container));

			// 显示更多任务提示
			if (currentDayTasks.length > taskLimit) {
				const moreCount = container.createDiv('calendar-month-task-more');
				moreCount.setText(`+${currentDayTasks.length - taskLimit} more`);
			}
		} catch (error) {
			console.error('Error loading month view tasks', error);
		}
	}

	/**
	 * 渲染月视图任务项
	 */
	private renderMonthTaskItem(task: GanttTask, container: HTMLElement): void {
		const taskItem = container.createDiv('calendar-task-card');
		taskItem.addClass('calendar-task-card--month');
		taskItem.addClass(task.completed ? 'completed' : 'pending');

		// 应用状态颜色
		this.applyStatusColors(task, taskItem);

		const cleaned = task.description;

		// 使用富文本渲染支持链接
		const taskTextEl = taskItem.createDiv('calendar-task-card-text');
		this.renderTaskDescriptionWithLinks(taskTextEl, cleaned);

		// 创建悬浮提示
		this.createTaskTooltip(task, taskItem, cleaned);

		// 点击打开文件
		taskItem.onclick = async (e: MouseEvent) => {
			e.stopPropagation();
			await this.openTaskFile(task);
		};

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
				// 刷新当前月视图
				const container = document.querySelector('.calendar-month-view-container');
				if (container) {
					this.render(container as HTMLElement, new Date());
				}
			},
			this.plugin?.settings?.globalTaskFilter || ''
		);
	}
}
