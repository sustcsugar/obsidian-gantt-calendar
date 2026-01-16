import { App } from 'obsidian';
import { BaseViewRenderer } from './BaseViewRenderer';
import { generateMonthCalendar } from '../calendar/calendarGenerator';
import type { GCTask, TagFilterState } from '../types';
import { YearViewClasses } from '../utils/bem';
import { YearViewLayoutManager } from '../utils/yearViewLayout';
import { Logger } from '../utils/logger';

/**
 * 年视图布局类型
 */
type YearViewLayout = '4x3' | '3x4' | '2x6' | '1x12';

/**
 * 年视图渲染器
 */
export class YearViewRenderer extends BaseViewRenderer {
	// 设置前缀
	private readonly SETTINGS_PREFIX = 'yearView';

	constructor(app: App, plugin: any) {
		super(app, plugin);
		this.initializeFilterStates(this.SETTINGS_PREFIX);
	}

	/**
	 * 重写标签筛选 setter 以支持持久化
	 */
	public setTagFilterState(state: TagFilterState): void {
		super.setTagFilterState(state);
		this.saveTagFilterState(this.SETTINGS_PREFIX).catch(err => {
			Logger.error('YearView', 'Failed to save tag filter', err);
		});
	}
	private yearContainer: HTMLElement | null = null;
	private monthsGrid: HTMLElement | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private currentLayout: YearViewLayout = '4x3';

	/**
	 * 根据容器宽度计算布局模式（使用动态CSS值读取）
	 */
	private calculateLayout(width: number): YearViewLayout {
		if (!this.yearContainer) return '4x3';
		return YearViewLayoutManager.calculateOptimalLayout(width, this.yearContainer);
	}

	/**
	 * 应用布局模式到网格容器
	 */
	private applyLayout(layout: YearViewLayout): void {
		if (!this.monthsGrid) return;

		this.currentLayout = layout;
		const { columns, rows } = YearViewLayoutManager.getLayoutDimensions(layout);

		this.monthsGrid.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
		this.monthsGrid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
	}

	/**
	 * 设置响应式布局监听
	 */
	private setupResponsiveLayout(): void {
		if (!this.monthsGrid) return;

		// 清除缓存以确保使用最新的CSS值
		YearViewLayoutManager.clearCache();

		const initialWidth = this.monthsGrid.offsetWidth;
		this.currentLayout = this.calculateLayout(initialWidth);
		this.applyLayout(this.currentLayout);

		// 设置 ResizeObserver 监听容器宽度变化
		this.resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const width = entry.contentRect.width;
				const layout = this.calculateLayout(width);
				if (layout !== this.currentLayout) {
					this.applyLayout(layout);
				}
			}
		});

		this.resizeObserver.observe(this.monthsGrid);
	}

	/**
	 * 清理响应式布局监听
	 */
	private cleanupResponsiveLayout(): void {
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
	}

	render(container: HTMLElement, currentDate: Date): void {
		const year = currentDate.getFullYear();

		// 清理旧的 ResizeObserver
		this.cleanupResponsiveLayout();

		// 预计算当年每日任务数量
		let tasks: GCTask[] = this.plugin.taskCache?.getAllTasks?.() || [];
		// 应用标签筛选
		tasks = this.applyTagFilter(tasks);
		const dateField = this.plugin.settings.dateFilterField || 'dueDate';
		const countsMap: Map<string, number> = new Map();
		const startDate = new Date(year, 0, 1);
		const endDate = new Date(year, 11, 31);

		for (const t of tasks) {
			const d = (t as any)[dateField] as Date | undefined;
			if (!d) continue;
			if (d < startDate || d > endDate) continue;
			const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
			countsMap.set(key, (countsMap.get(key) || 0) + 1);
		}

		const yearContainer = container.createDiv('gc-view gc-view--year');
		this.yearContainer = yearContainer;

		const monthsGrid = yearContainer.createDiv('gc-year-view__months');
		this.monthsGrid = monthsGrid;

		for (let month = 1; month <= 12; month++) {
			const monthData = generateMonthCalendar(year, month, !!(this.plugin?.settings?.startOnMonday));
			const monthDiv = monthsGrid.createDiv(YearViewClasses.elements.monthCard);

			// 始终显示农历
			monthDiv.addClass('gc-year-view__month-card--show-lunar');

			// 月份标题
			const monthHeader = monthDiv.createDiv(YearViewClasses.elements.monthHeader);
			const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
			monthHeader.createEl('h3', { text: monthNames[month - 1] });

			// 星期标签
			const weekdaysDiv = monthDiv.createDiv(YearViewClasses.elements.weekdays);
			const startOnMonday = !!(this.plugin?.settings?.startOnMonday);
			const labelsSunFirst = ['日', '一', '二', '三', '四', '五', '六'];
			const labelsMonFirst = ['一', '二', '三', '四', '五', '六', '日'];
			(startOnMonday ? labelsMonFirst : labelsSunFirst).forEach((day) => {
				weekdaysDiv.createEl('div', { text: day, cls: YearViewClasses.elements.weekday });
			});

			// 日期网格
			const daysDiv = monthDiv.createDiv(YearViewClasses.elements.daysGrid);
			monthData.days.forEach((day) => {
				const dayEl = daysDiv.createEl('div');
				dayEl.addClass(YearViewClasses.elements.day);
				// 添加日期标识，用于增量刷新时定位
				dayEl.dataset.date = `${day.date.getFullYear()}-${(day.date.getMonth() + 1).toString().padStart(2, '0')}-${day.date.getDate().toString().padStart(2, '0')}`;

				// 热力图：根据任务数量设置背景
				const dayKey = `${day.date.getFullYear()}-${(day.date.getMonth() + 1).toString().padStart(2, '0')}-${day.date.getDate().toString().padStart(2, '0')}`;
				const count = countsMap.get(dayKey) || 0;
				if (this.plugin.settings.yearHeatmapEnabled && count > 0) {
					const palette = this.plugin.settings.yearHeatmapPalette || 'blue';
					const level = count >= 20 ? 5 : count >= 10 ? 4 : count >= 5 ? 3 : count >= 2 ? 2 : 1;
					dayEl.addClass(`heatmap-${palette}-${level}`);
				}

				const dateNum = dayEl.createEl('div', { text: day.day.toString() });
				dateNum.addClass(YearViewClasses.elements.dayNumber);

				if (day.lunarText) {
					const lunarEl = dayEl.createEl('div', { text: day.lunarText });
					lunarEl.addClass(YearViewClasses.elements.lunarText);
					if (day.festival || day.festivalType) {
						lunarEl.addClass('festival');
						if (day.festivalType) {
							lunarEl.addClass(`festival-${day.festivalType}`);
						}
					}
				}

				// 显示任务数量
				if (this.plugin.settings.yearShowTaskCount && count > 0) {
					const countEl = dayEl.createEl('div', { text: `${count}` });
					countEl.addClass(YearViewClasses.elements.taskCount);
				}

				if (!day.isCurrentMonth) {
					dayEl.addClass('outside-month');
				}
				if (day.isToday) {
					dayEl.addClass('today');
				}

				// 点击事件由主视图处理
				dayEl.onclick = () => {
					if (this.plugin.calendarView) {
						this.plugin.calendarView.selectDate(day.date);
					}
				};
			});
		}

		// 设置响应式布局
		this.setupResponsiveLayout();
	}

	/**
	 * 增量刷新：更新任务计数和热力图，不重建DOM
	 */
	public refreshTasks(): void {
		if (!this.yearContainer) return;

		// 重新计算任务数量
		let tasks: GCTask[] = this.plugin.taskCache?.getAllTasks?.() || [];
		tasks = this.applyTagFilter(tasks);
		const dateField = this.plugin.settings.dateFilterField || 'dueDate';

		// 获取当前年份
		const yearGrid = this.yearContainer.querySelector('.gc-year-view__months');
		if (!yearGrid) return;

		// 获取第一个月份卡片的年份来确定当前年份
		const firstMonthCard = yearGrid.querySelector('.gc-year-view__month-card');
		if (!firstMonthCard) return;

		// 重新计算任务计数
		const countsMap: Map<string, number> = new Map();
		const monthCards = yearGrid.querySelectorAll('.gc-year-view__month-card');

		// 从DOM中获取年份信息
		let currentYear = new Date().getFullYear();

		for (const t of tasks) {
			const d = (t as any)[dateField] as Date | undefined;
			if (!d) continue;
			const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
			countsMap.set(key, (countsMap.get(key) || 0) + 1);
		}

		// 更新每个日期格子的样式
		monthCards.forEach((monthCard) => {
			const days = monthCard.querySelectorAll('.gc-year-view__day');
			days.forEach((dayEl: Element) => {
				const dayNumberEl = dayEl.querySelector('.gc-year-view__day-number');
				if (!dayNumberEl) return;

				const dayNum = parseInt(dayNumberEl.textContent || '0');
				if (isNaN(dayNum)) return;

				// 从数据属性中获取完整的日期信息
				const dateStr = (dayEl as HTMLElement).dataset.date;
				let dayKey: string;
				if (dateStr) {
					dayKey = dateStr;
				} else {
					// 如果没有 data-date 属性，跳过
					return;
				}

				const count = countsMap.get(dayKey) || 0;

				// 移除旧的热力图类
				(dayEl as HTMLElement).classList.remove(
					'heatmap-blue-1', 'heatmap-blue-2', 'heatmap-blue-3', 'heatmap-blue-4', 'heatmap-blue-5',
					'heatmap-green-1', 'heatmap-green-2', 'heatmap-green-3', 'heatmap-green-4', 'heatmap-green-5',
					'heatmap-red-1', 'heatmap-red-2', 'heatmap-red-3', 'heatmap-red-4', 'heatmap-red-5'
				);

				// 添加新的热力图类
				if (this.plugin.settings.yearHeatmapEnabled && count > 0) {
					const palette = this.plugin.settings.yearHeatmapPalette || 'blue';
					const level = count >= 20 ? 5 : count >= 10 ? 4 : count >= 5 ? 3 : count >= 2 ? 2 : 1;
					(dayEl as HTMLElement).classList.add(`heatmap-${palette}-${level}`);
				}

				// 更新任务数量显示
				let countEl = dayEl.querySelector('.gc-year-view__task-count');
				if (this.plugin.settings.yearShowTaskCount && count > 0) {
					if (!countEl) {
						countEl = dayEl.ownerDocument?.createElement('div');
						if (countEl) {
							countEl.className = 'gc-year-view__task-count';
							dayEl.appendChild(countEl);
						}
					}
					if (countEl) {
						countEl.textContent = `${count}`;
					}
				} else if (countEl) {
					countEl.remove();
				}
			});
		});
	}

	/**
	 * 更新所有月卡片显示（农历始终显示，此方法保留用于字号更新）
	 */
	public updateAllMonthCards(): void {
		if (!this.yearContainer) return;
		// 农历始终显示，此方法可用于触发其他更新
	}

	/**
	 * 应用农历字号设置
	 */
	public applyLunarFontSize(container: HTMLElement): void {
		const lunarFontSize = this.plugin.settings.yearLunarFontSize || 10;
		const lunarTexts = container.querySelectorAll(`.${YearViewClasses.elements.lunarText}`);
		lunarTexts.forEach((text: Element) => {
			(text as HTMLElement).style.fontSize = `${lunarFontSize}px`;
		});
	}
}
