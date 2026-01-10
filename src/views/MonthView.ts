import { BaseViewRenderer } from './BaseViewRenderer';
import { generateMonthCalendar } from '../calendar/calendarGenerator';
import type { GCTask } from '../types';
import { TaskCardComponent, MonthViewConfig } from '../components/TaskCard';
import { MonthViewClasses } from '../utils/bem';

/**
 * 月视图渲染器
 */
export class MonthViewRenderer extends BaseViewRenderer {
	// 性能优化：当前渲染周期的任务缓存
	private currentRenderTasks: GCTask[] | null = null;

	render(container: HTMLElement, currentDate: Date): void {
		// 性能优化：只调用一次 getAllTasks()，缓存结果供整个渲染周期使用
		this.currentRenderTasks = this.plugin.taskCache.getAllTasks();

		const year = currentDate.getFullYear();
		const month = currentDate.getMonth() + 1;
		const monthData = generateMonthCalendar(year, month, !!(this.plugin?.settings?.startOnMonday));

		const monthContainer = container.createDiv('gc-view gc-view--month');

		// 星期标签
		const weekdaysDiv = monthContainer.createDiv(MonthViewClasses.elements.weekdays);
		weekdaysDiv.createEl('div', { text: '', cls: MonthViewClasses.elements.weekday }); // 周编号列占位
		const startOnMonday = !!(this.plugin?.settings?.startOnMonday);
		const labelsSunFirst = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
		const labelsMonFirst = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
		(startOnMonday ? labelsMonFirst : labelsSunFirst).forEach((day) => {
			weekdaysDiv.createEl('div', { text: day, cls: MonthViewClasses.elements.weekday });
		});

		// 周行
		const weeksDiv = monthContainer.createDiv(MonthViewClasses.elements.weeks);
		monthData.weeks.forEach((week) => {
			const weekDiv = weeksDiv.createDiv(MonthViewClasses.elements.weekRow);

			// 周编号
			const weekNum = weekDiv.createDiv(MonthViewClasses.elements.weekNumber);
			weekNum.createEl('span', { text: `W${week.weekNumber}` });

			// 一周的日期
			const daysDiv = weekDiv.createDiv(MonthViewClasses.elements.weekDays);
			week.days.forEach((day) => {
				const dayEl = daysDiv.createEl('div');
				dayEl.addClass(MonthViewClasses.elements.dayCell);

				const dateNum = dayEl.createEl('div', { text: day.day.toString() });
				dateNum.addClass(MonthViewClasses.elements.dayNumber);

				if (day.lunarText) {
					const lunarEl = dayEl.createEl('div', { text: day.lunarText });
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

				if (!day.isCurrentMonth) {
					dayEl.addClass(MonthViewClasses.modifiers.outsideMonth);
				}
				if (day.isToday) {
					dayEl.addClass(MonthViewClasses.modifiers.today);
				}

				dayEl.onclick = (e: MouseEvent) => {
					// 点击任务时不触发日期选择
					if ((e.target as HTMLElement).closest(`.${MonthViewClasses.elements.taskItem}`)) {
						return;
					}
					if (this.plugin.calendarView) {
						this.plugin.calendarView.selectDate(day.date);
					}
				};
			});
		});

		// 渲染完成后清空缓存
		this.currentRenderTasks = null;
	}

	/**
	 * 加载月视图任务
	 */
	private async loadMonthViewTasks(container: HTMLElement, targetDate: Date): Promise<void> {
		container.empty();

		try {
			// 性能优化：使用缓存的任务列表，避免重复调用 getAllTasks()
			let tasks: GCTask[] = this.currentRenderTasks || this.plugin.taskCache.getAllTasks();
			// 应用标签筛选
			tasks = this.applyTagFilter(tasks);
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
			displayTasks.forEach(task => this.renderTaskItem(task, container));

			// 显示更多任务提示
			if (currentDayTasks.length > taskLimit) {
				const moreCount = container.createDiv(MonthViewClasses.elements.taskMore);
				moreCount.setText(`+${currentDayTasks.length - taskLimit} more`);
			}
		} catch (error) {
			console.error('Error loading month view tasks', error);
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
				// 刷新当前月视图
				const viewContainer = document.querySelector('.calendar-month-view-container');
				if (viewContainer) {
					this.render(viewContainer as HTMLElement, new Date());
				}
			},
		}).render();
	}
}
