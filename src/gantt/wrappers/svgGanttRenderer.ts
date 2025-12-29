/**
 * SVG 甘特图渲染器
 * 自研实现，参考 Frappe Gantt 设计
 * 完全控制渲染、交互和样式
 */

import type { FrappeTask, FrappeGanttConfig } from '../types';

/**
 * SVG 元素辅助方法
 */
function addSvgClass(element: Element, className: string): void {
	const existing = element.getAttribute('class') || '';
	const classes = existing.split(' ').filter(c => c);
	if (!classes.includes(className)) {
		classes.push(className);
	}
	element.setAttribute('class', classes.join(' '));
}

/**
 * SVG 甘特图渲染器
 *
 * 使用 SVG 绘制专业的甘特图
 */
export class SvgGanttRenderer {
	private svgElement: SVGSVGElement | null = null;
	private config: FrappeGanttConfig;
	private tasks: FrappeTask[] = [];
	private container: HTMLElement;

	// 尺寸相关
	private headerHeight = 50;
	private rowHeight = 40;
	private columnWidth = 50;
	private padding = 18;

	// 事件回调
	private onDateChange?: (task: FrappeTask, start: Date, end: Date) => void;
	private onProgressChange?: (task: FrappeTask, progress: number) => void;

	constructor(container: HTMLElement, config: FrappeGanttConfig) {
		this.container = container;
		this.config = config;

		// 从配置读取尺寸
		this.headerHeight = config.header_height ?? 50;
		this.columnWidth = config.column_width ?? 50;
		this.padding = config.padding ?? 18;
	}

	/**
	 * 初始化渲染器
	 */
	init(tasks: FrappeTask[]): void {
		this.tasks = tasks;
		this.render();
	}

	/**
	 * 刷新任务数据
	 */
	refresh(tasks: FrappeTask[]): void {
		this.tasks = tasks;
		this.render();
	}

	/**
	 * 更新配置
	 */
	updateConfig(config: Partial<FrappeGanttConfig>): void {
		this.config = { ...this.config, ...config };

		// 更新尺寸
		if (config.header_height !== undefined) this.headerHeight = config.header_height;
		if (config.column_width !== undefined) this.columnWidth = config.column_width;
		if (config.padding !== undefined) this.padding = config.padding;

		this.render();
	}

	/**
	 * 设置事件处理器
	 */
	setEventHandlers(handlers: {
		onDateChange?: (task: FrappeTask, start: Date, end: Date) => void;
		onProgressChange?: (task: FrappeTask, progress: number) => void;
	}): void {
		this.onDateChange = handlers.onDateChange;
		this.onProgressChange = handlers.onProgressChange;
	}

	/**
	 * 主渲染方法
	 */
	private render(): void {
		// 清空容器
		this.container.empty();

		// 计算日期范围
		const { minDate, maxDate, totalDays } = this.calculateDateRange();

		// 计算 SVG 尺寸
		const width = Math.max(this.container.offsetWidth || 800, totalDays * this.columnWidth + this.padding * 2);
		const height = this.headerHeight + this.tasks.length * this.rowHeight + this.padding * 2;

		// 创建 SVG 元素
		this.svgElement = this.container.createSvg('svg');
		this.svgElement.setAttribute('width', '100%');
		this.svgElement.setAttribute('height', '100%');
		this.svgElement.setAttribute('viewBox', `0 0 ${width} ${height}`);
		addSvgClass(this.svgElement, 'gantt-svg');

		// 创建命名空间
		const ns = 'http://www.w3.org/2000/svg';

		// 1. 绘制背景
		this.renderBackground(ns, width, height);

		// 2. 绘制头部（日期列）
		this.renderHeader(ns, minDate, totalDays, width);

		// 3. 绘制网格线
		this.renderGrid(ns, minDate, totalDays, width, height);

		// 4. 绘制今天线
		this.renderTodayLine(ns, minDate, totalDays, height);

		// 5. 绘制任务条
		this.renderTaskBars(ns, minDate, totalDays);

		// 6. 添加弹窗容器
		this.renderPopupContainer();
	}

	/**
	 * 计算日期范围
	 */
	private calculateDateRange(): { minDate: Date; maxDate: Date; totalDays: number } {
		if (this.tasks.length === 0) {
			const today = new Date();
			return {
				minDate: today,
				maxDate: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000),
				totalDays: 30
			};
		}

		const dates = this.tasks.flatMap(t => [
			new Date(t.start),
			new Date(t.end)
		]);

		let minDate = new Date(Math.min(...dates.map(d => d.getTime())));
		let maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

		// 添加一些边距
		minDate = new Date(minDate.getTime() - 7 * 24 * 60 * 60 * 1000);
		maxDate = new Date(maxDate.getTime() + 7 * 24 * 60 * 60 * 1000);

		const totalDays = Math.ceil((maxDate.getTime() - minDate.getTime()) / (24 * 60 * 60 * 1000));

		return { minDate, maxDate, totalDays };
	}

	/**
	 * 渲染背景
	 */
	private renderBackground(ns: string, width: number, height: number): void {
		const bg = document.createElementNS(ns, 'rect');
		bg.setAttribute('x', '0');
		bg.setAttribute('y', '0');
		bg.setAttribute('width', String(width));
		bg.setAttribute('height', String(height));
		bg.setAttribute('fill', 'var(--background-primary)');
		this.svgElement!.appendChild(bg);
	}

	/**
	 * 渲染头部（日期列）
	 */
	private renderHeader(ns: string, minDate: Date, totalDays: number, width: number): void {
		const headerBg = document.createElementNS(ns, 'rect');
		headerBg.setAttribute('x', '0');
		headerBg.setAttribute('y', '0');
		headerBg.setAttribute('width', String(width));
		headerBg.setAttribute('height', String(this.headerHeight));
		headerBg.setAttribute('fill', 'var(--background-secondary)');
		this.svgElement!.appendChild(headerBg);

		// 绘制日期文本
		for (let i = 0; i < totalDays; i++) {
			const date = new Date(minDate);
			date.setDate(date.getDate() + i);

			const x = this.padding + i * this.columnWidth;
			const y = this.headerHeight / 2;

			// 判断是否是今天
			const today = new Date();
			const isToday = (
				date.getDate() === today.getDate() &&
				date.getMonth() === today.getMonth() &&
				date.getFullYear() === today.getFullYear()
			);

			// 绘制日期
			const text = document.createElementNS(ns, 'text');
			text.setAttribute('x', String(x + this.columnWidth / 2));
			text.setAttribute('y', String(y + 6));
			text.setAttribute('text-anchor', 'middle');
			text.setAttribute('font-size', '11');
			text.setAttribute('fill', isToday ? 'var(--interactive-accent)' : 'var(--text-muted)');
			text.setAttribute('font-weight', isToday ? '600' : '400');

			// 根据视图模式格式化日期
			const label = this.formatDateLabel(date, i);
			text.textContent = label;

			this.svgElement!.appendChild(text);
		}
	}

	/**
	 * 格式化日期标签
	 */
	private formatDateLabel(date: Date, index: number): string {
		const viewMode = this.config.view_mode;

		switch (viewMode) {
			case 'day':
				return `${date.getMonth() + 1}/${date.getDate()}`;
			case 'week':
				if (date.getDay() === 1 || index === 0) {
					return `W${this.getWeekNumber(date)}`;
				}
				return '';
			case 'month':
				if (date.getDate() === 1 || index === 0) {
					return `${date.getMonth() + 1}月`;
				}
				return '';
			default:
				return `${date.getMonth() + 1}/${date.getDate()}`;
		}
	}

	/**
	 * 获取周数
	 */
	private getWeekNumber(date: Date): number {
		const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
		const dayNum = d.getUTCDay() || 7;
		d.setUTCDate(d.getUTCDate() + 4 - dayNum);
		const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
		return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
	}

	/**
	 * 渲染网格线
	 */
	private renderGrid(ns: string, minDate: Date, totalDays: number, width: number, height: number): void {
		const gridGroup = document.createElementNS(ns, 'g');
		addSvgClass(gridGroup, 'gantt-grid');

		// 垂直线（日期分隔）
		for (let i = 0; i <= totalDays; i++) {
			const x = this.padding + i * this.columnWidth;

			const line = document.createElementNS(ns, 'line');
			line.setAttribute('x1', String(x));
			line.setAttribute('y1', String(this.headerHeight));
			line.setAttribute('x2', String(x));
			line.setAttribute('y2', String(height));
			line.setAttribute('stroke', 'var(--background-modifier-border)');
			line.setAttribute('stroke-width', '0.5');
			line.setAttribute('stroke-dasharray', i % 7 === 0 ? 'none' : '2 2');

			gridGroup.appendChild(line);
		}

		// 水平线（任务行分隔）
		for (let i = 0; i <= this.tasks.length; i++) {
			const y = this.headerHeight + i * this.rowHeight;

			const line = document.createElementNS(ns, 'line');
			line.setAttribute('x1', String(this.padding));
			line.setAttribute('y1', String(y));
			line.setAttribute('x2', String(width - this.padding));
			line.setAttribute('y2', String(y));
			line.setAttribute('stroke', 'var(--background-modifier-border)');
			line.setAttribute('stroke-width', '0.5');

			gridGroup.appendChild(line);
		}

		this.svgElement!.appendChild(gridGroup);
	}

	/**
	 * 渲染今天线
	 */
	private renderTodayLine(ns: string, minDate: Date, totalDays: number, height: number): void {
		const today = new Date();
		const daysDiff = Math.floor((today.getTime() - minDate.getTime()) / (24 * 60 * 60 * 1000));

		if (daysDiff >= 0 && daysDiff <= totalDays) {
			const x = this.padding + daysDiff * this.columnWidth + this.columnWidth / 2;

			const line = document.createElementNS(ns, 'line');
			line.setAttribute('x1', String(x));
			line.setAttribute('y1', String(this.headerHeight));
			line.setAttribute('x2', String(x));
			line.setAttribute('y2', String(height));
			line.setAttribute('stroke', 'var(--interactive-accent)');
			line.setAttribute('stroke-width', '2');
			line.setAttribute('stroke-dasharray', '4 2');
			addSvgClass(line, 'gantt-today-line');

			this.svgElement!.appendChild(line);
		}
	}

	/**
	 * 渲染任务条
	 */
	private renderTaskBars(ns: string, minDate: Date, totalDays: number): void {
		const tasksGroup = document.createElementNS(ns, 'g');
		addSvgClass(tasksGroup, 'gantt-tasks');

		this.tasks.forEach((task, index) => {
			const taskStart = new Date(task.start);
			const taskEnd = new Date(task.end);

			const startOffset = Math.floor((taskStart.getTime() - minDate.getTime()) / (24 * 60 * 60 * 1000));
			const duration = Math.ceil((taskEnd.getTime() - taskStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;

			const x = this.padding + startOffset * this.columnWidth;
			const y = this.headerHeight + index * this.rowHeight + (this.rowHeight - 24) / 2;
			const barWidth = duration * this.columnWidth - 8;

			// 任务条组
			const barGroup = document.createElementNS(ns, 'g');
			addSvgClass(barGroup, 'gantt-bar-group');
			barGroup.setAttribute('data-task-id', task.id);

			// 任务条背景
			const bar = document.createElementNS(ns, 'rect');
			bar.setAttribute('x', String(x));
			bar.setAttribute('y', String(y));
			bar.setAttribute('width', String(Math.max(barWidth, 20)));
			bar.setAttribute('height', '24');
			bar.setAttribute('rx', '4');

			// 根据状态设置颜色
			let fillColor = 'var(--interactive-accent)';
			if (task.progress === 100) {
				fillColor = 'var(--task-completed-color, #52c41a)';
			} else if (task.custom_class) {
				// 解析自定义类名获取颜色
				if (task.custom_class.includes('priority-highest')) {
					fillColor = 'var(--priority-highest-color, #ef4444)';
				} else if (task.custom_class.includes('priority-high')) {
					fillColor = 'var(--priority-high-color, #f97316)';
				} else if (task.custom_class.includes('priority-medium')) {
					fillColor = 'var(--priority-medium-color, #eab308)';
				} else if (task.custom_class.includes('priority-low')) {
					fillColor = 'var(--priority-low-color, #22c55e)';
				}
			}

			bar.setAttribute('fill', fillColor);
			bar.setAttribute('opacity', '0.85');
			bar.setAttribute('cursor', 'pointer');

			// 进度条
			if (task.progress > 0 && task.progress < 100) {
				const progressWidth = barWidth * task.progress / 100;
				const progress = document.createElementNS(ns, 'rect');
				progress.setAttribute('x', String(x));
				progress.setAttribute('y', String(y));
				progress.setAttribute('width', String(Math.max(progressWidth - 8, 0)));
				progress.setAttribute('height', '24');
				progress.setAttribute('rx', '4');
				progress.setAttribute('fill', fillColor);
				progress.setAttribute('opacity', '0.4');
				barGroup.appendChild(progress);
			}

			// 任务名称
			const text = document.createElementNS(ns, 'text');
			text.setAttribute('x', String(x + 8));
			text.setAttribute('y', String(y + 16));
			text.setAttribute('font-size', '11');
			text.setAttribute('fill', 'white');
			text.setAttribute('pointer-events', 'none');

			// 截断长文本
			const maxWidth = Math.max(barWidth - 16, 20);
			const charsPerPx = 0.12;
			const maxChars = Math.floor(maxWidth / charsPerPx);
			const displayName = task.name.length > maxChars
				? task.name.substring(0, maxChars) + '...'
				: task.name;

			text.textContent = displayName;

			// 添加点击事件
			bar.addEventListener('click', () => this.handleTaskClick(task));

			// 添加悬停效果
			bar.addEventListener('mouseenter', () => {
				bar.setAttribute('opacity', '1');
				this.showPopup(task, bar);
			});

			bar.addEventListener('mouseleave', () => {
				bar.setAttribute('opacity', '0.85');
				this.hidePopup();
			});

			barGroup.appendChild(bar);
			barGroup.appendChild(text);
			tasksGroup.appendChild(barGroup);
		});

		this.svgElement!.appendChild(tasksGroup);
	}

	/**
	 * 渲染弹窗容器
	 */
	private renderPopupContainer(): void {
		// 弹窗在需要时动态创建
	}

	/**
	 * 处理任务点击
	 */
	private handleTaskClick(task: FrappeTask): void {
		if (this.config.on_click) {
			this.config.on_click(task);
		}
	}

	/**
	 * 显示弹窗
	 */
	private showPopup(task: FrappeTask, targetElement: Element): void {
		if (!this.config.custom_popup_html) return;

		// 移除现有弹窗
		this.hidePopup();

		// 创建弹窗
		const popup = document.createElement('div');
		popup.classList.add('gantt-tooltip');
		popup.innerHTML = this.config.custom_popup_html(task);

		// 定位
		const rect = targetElement.getBoundingClientRect();
		popup.style.position = 'fixed';
		popup.style.left = `${rect.right + 10}px`;
		popup.style.top = `${rect.top}px`;
		popup.style.zIndex = '1000';

		document.body.appendChild(popup);

		// 自动隐藏
		setTimeout(() => {
			if (popup.isConnected) {
				this.hidePopup();
			}
		}, 5000);
	}

	/**
	 * 隐藏弹窗
	 */
	private hidePopup(): void {
		const existing = document.querySelector('.gantt-tooltip');
		if (existing) {
			existing.remove();
		}
	}

	/**
	 * 销毁渲染器
	 */
	destroy(): void {
		this.hidePopup();
		this.svgElement = null;
		this.tasks = [];
	}

	/**
	 * 获取 SVG 元素
	 */
	getSvgElement(): SVGSVGElement | null {
		return this.svgElement;
	}
}
