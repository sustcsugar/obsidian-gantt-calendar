/**
 * SVG 甘特图渲染器
 * 自研实现，参考甘特图设计模式
 * 完全控制渲染、交互和样式
 *
 * 布局结构：
 * ┌────────────┬──────────────────────────────┐
 * │ 空白区域   │ 时间轴（水平固定）           │
 * ├────────────┼──────────────────────────────┤
 * │ 任务列表   │ 甘特图（双向滚动）           │
 * │ (垂直固定) │                              │
 * └────────────┴──────────────────────────────┘
 */

import type { GanttChartTask, GanttChartConfig, DateFieldType } from '../types';
import { TimeGranularity, GRANULARITY_CONFIGS, getWeekNumber } from '../types';
import type { GCTask } from '../../types';
import { GanttClasses } from '../../utils/bem';
import { TooltipManager, type MousePosition } from '../../utils/tooltipManager';

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
	// 多个 SVG 元素
	private headerSvg: SVGSVGElement | null = null;   // 时间轴
	private taskListSvg: SVGSVGElement | null = null;  // 任务列表
	private ganttSvg: SVGSVGElement | null = null;     // 甘特图主体
	private cornerSvg: SVGSVGElement | null = null;    // 左上角空白

	private config: GanttChartConfig;
	private tasks: GanttChartTask[] = [];
	private container: HTMLElement;
	private plugin: any;
	private app: any;  // Obsidian App 实例

	// 时间颗粒度
	private granularity: TimeGranularity = TimeGranularity.DAY;

	// 尺寸相关
	private headerHeight = 50;
	private rowHeight = 40;
	private columnWidth = 50;
	private taskNumberColumnWidth = 40;  // 任务序号列宽度
	private taskColumnWidth = 240;  // 任务列宽度（包含序号列）
	private resizerWidth = 4;  // 分隔条宽度
	private padding = 18;

	// 日期范围（用于滚动到今天）
	private minDate: Date | null = null;
	private totalUnits = 0;  // 颗粒度单元数（原totalDays）

	// 布局容器
	private ganttLayout: HTMLElement | null = null;
	private headerContainer: HTMLElement | null = null;
	private taskListContainer: HTMLElement | null = null;
	private ganttContainer: HTMLElement | null = null;
	private cornerContainer: HTMLElement | null = null;
	private resizer: HTMLElement | null = null;  // 分隔条元素

	// 拖动状态
	private isResizing = false;

	// 事件回调
	private onDateChange?: (task: GanttChartTask, start: Date, end: Date) => void;
	private onProgressChange?: (task: GanttChartTask, progress: number) => void;
	private startField: DateFieldType = 'startDate';
	private endField: DateFieldType = 'dueDate';

	constructor(container: HTMLElement, config: GanttChartConfig, plugin: any, _originalTasks: GCTask[] = [], app: any = null, startField: DateFieldType = 'startDate', endField: DateFieldType = 'dueDate') {
		this.container = container;
		this.config = config;
		this.plugin = plugin;
		// _originalTasks 参数保留以保持向后兼容，但不再使用（GanttChartTask 已包含所有必要信息）
		this.app = app || plugin?.app;
		this.startField = startField;
		this.endField = endField;

		// 从配置读取尺寸
		this.headerHeight = config.header_height ?? 50;
		this.columnWidth = config.column_width ?? 50;
		this.taskNumberColumnWidth = 40;  // 固定序号列宽度
		this.taskColumnWidth = this.taskNumberColumnWidth + 200;  // 序号列 + 任务内容列
		this.padding = config.padding ?? 18;

		// 初始化时间颗粒度
		this.granularity = config.granularity ?? TimeGranularity.DAY;
	}

	/**
	 * 初始化渲染器
	 */
	init(tasks: GanttChartTask[]): void {
		this.tasks = tasks;
		this.render();
	}

	/**
	 * 刷新任务数据
	 */
	refresh(tasks: GanttChartTask[]): void {
		this.tasks = tasks;
		this.render();
	}

	/**
	 * 更新配置（支持颗粒度切换）
	 */
	updateConfig(config: Partial<GanttChartConfig>): void {
		// 更新颗粒度
		if (config.granularity) {
			this.granularity = config.granularity;
		}

		// 更新配置对象
		this.config = { ...this.config, ...config };

		// 更新尺寸配置（如果提供）
		if (config.header_height !== undefined) {
			this.headerHeight = config.header_height;
		}
		if (config.column_width !== undefined) {
			this.columnWidth = config.column_width;
		}
		if (config.padding !== undefined) {
			this.padding = config.padding;
		}

		// 重新渲染
		this.render();
	}

	/**
	 * 增量更新任务（不完整重建视图）
	 * 只更新受影响的 DOM 元素，保持滚动位置
	 */
	updateTasks(newTasks: GanttChartTask[]): void {
		const oldTasks = this.tasks;
		this.tasks = newTasks;

		// 构建任务ID映射
		const oldTaskMap = new Map(oldTasks.map(t => [t.id, t]));
		const newTaskMap = new Map(newTasks.map(t => [t.id, t]));

		// 找出新增、删除、修改的任务
		const added = newTasks.filter(t => !oldTaskMap.has(t.id));
		const removed = oldTasks.filter(t => !newTaskMap.has(t.id));
		const modified = newTasks.filter(t => {
			const old = oldTaskMap.get(t.id);
			return old && this.isTaskDifferent(old, t);
		});

		// 如果变化太大，执行完整渲染
		if (added.length + removed.length > 5) {
			this.render();
			return;
		}

		// 执行增量更新
		this.updateTaskListIncremental(added, removed, modified, newTasks);
		this.updateGanttAreaIncremental(added, removed, modified, newTasks);
	}

	/**
	 * 检查任务是否发生变化
	 */
	private isTaskDifferent(old: GanttChartTask, current: GanttChartTask): boolean {
		return old.start !== current.start ||
			   old.end !== current.end ||
			   old.progress !== current.progress ||
			   old.completed !== current.completed ||
			   old.name !== current.name ||
			   old.custom_class !== current.custom_class;
	}

	/**
	 * 设置事件处理器
	 */
	setEventHandlers(handlers: {
		onDateChange?: (task: GanttChartTask, start: Date, end: Date) => void;
		onProgressChange?: (task: GanttChartTask, progress: number) => void;
	}): void {
		this.onDateChange = handlers.onDateChange;
		this.onProgressChange = handlers.onProgressChange;
	}

	/**
	 * 主渲染方法 - 使用多区域布局实现冻结效果
	 */
	private render(): void {
		// 清空容器
		this.container.empty();

		// 计算日期范围
		const { minDate, maxDate, totalUnits, granularity } = this.calculateDateRange();

		// 保存日期范围信息（用于滚动到今天）
		this.minDate = minDate;
		this.totalUnits = totalUnits;

		// 计算尺寸
		const ganttWidth = totalUnits * this.columnWidth + this.padding * 2;
		const ganttHeight = this.headerHeight + this.tasks.length * this.rowHeight + this.padding * 2;
		// 任务列表使用足够大的宽度来显示完整任务描述
		const taskListWidth = 2040; // taskNumberColumnWidth (40) + contentWidth (2000)
		const taskListHeight = ganttHeight;

		// 创建 BEM 结构的布局容器
		this.ganttLayout = this.container.createDiv(GanttClasses.elements.layout);

		// 左上角空白区域
		this.cornerContainer = this.ganttLayout.createDiv(GanttClasses.elements.corner);
		this.cornerSvg = this.createSvgElement(
			this.cornerContainer,
			this.taskColumnWidth,
			this.headerHeight,
			GanttClasses.elements.cornerSvg
		);
		this.renderCorner(this.cornerSvg);

		// 顶部时间轴容器（可水平滚动）
		this.headerContainer = this.ganttLayout.createDiv(GanttClasses.elements.headerContainer);
		this.headerSvg = this.createSvgElement(
			this.headerContainer,
			ganttWidth,
			this.headerHeight,
			GanttClasses.elements.headerSvg
		);
		this.renderHeader(this.headerSvg, minDate, totalUnits, granularity);

		// 左侧任务列表容器（可垂直滚动）
		this.taskListContainer = this.ganttLayout.createDiv(GanttClasses.elements.tasklistContainer);
		this.taskListSvg = this.createSvgElement(
			this.taskListContainer,
			taskListWidth,
			taskListHeight,
			GanttClasses.elements.tasklistSvg
		);
		this.renderTaskList(this.taskListSvg);

		// 右侧甘特图容器（双向滚动）
		this.ganttContainer = this.ganttLayout.createDiv(GanttClasses.elements.chartContainer);
		this.ganttSvg = this.createSvgElement(
			this.ganttContainer,
			ganttWidth,
			ganttHeight,  // 使用完整高度以保持y坐标系统一致
			GanttClasses.elements.chartSvg
		);
		this.renderGanttChart(this.ganttSvg, minDate, totalUnits, ganttHeight, granularity);

		// 创建分隔条
		this.resizer = this.ganttLayout.createDiv(GanttClasses.elements.resizer);

		// 设置同步滚动
		this.setupSyncScrolling();

		// 设置分隔条拖动
		this.setupResizer();
	}

	/**
	 * 计算日期范围
	 */
	private calculateDateRange(): {
		minDate: Date;
		maxDate: Date;
		totalUnits: number;  // 颗粒度单元数（原totalDays）
		granularity: TimeGranularity
	} {
		const config = GRANULARITY_CONFIGS[this.granularity];

		if (this.tasks.length === 0) {
			const today = new Date();
			const defaultUnits = 30; // 默认30个单元
			return {
				minDate: today,
				maxDate: new Date(today.getTime() + defaultUnits * config.milliseconds),
				totalUnits: defaultUnits,
				granularity: this.granularity
			};
		}

		const dates = this.tasks.flatMap(t => [
			new Date(t.start),
			new Date(t.end)
		]);

		let minDate = new Date(Math.min(...dates.map(d => d.getTime())));
		let maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

		// 根据颗粒度对齐网格边界
		minDate = config.gridAligner(minDate);
		maxDate = config.gridAligner(maxDate);

		// 确保maxDate > minDate（至少1个单元）
		if (maxDate <= minDate) {
			maxDate = new Date(minDate.getTime() + config.milliseconds);
		}

		// 添加边距（前2后2个单元）
		const paddingUnits = 2;
		minDate = new Date(minDate.getTime() - paddingUnits * config.milliseconds);
		maxDate = new Date(maxDate.getTime() + paddingUnits * config.milliseconds);

		// 计算总单元数
		const totalUnits = Math.ceil((maxDate.getTime() - minDate.getTime()) / config.milliseconds);

		return { minDate, maxDate, totalUnits, granularity: this.granularity };
	}

	/**
	 * 创建 SVG 元素的辅助方法
	 */
	private createSvgElement(
		container: HTMLElement,
		width: number,
		height: number,
		className: string
	): SVGSVGElement {
		const svg = container.createSvg('svg');
		svg.setAttribute('width', String(width));
		svg.setAttribute('height', String(height));
		svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
		addSvgClass(svg, className);
		return svg;
	}

	/**
	 * 设置同步滚动
	 */
	private setupSyncScrolling(): void {
		if (!this.headerContainer || !this.taskListContainer || !this.ganttContainer) return;

		const headerContainer = this.headerContainer;
		const taskListContainer = this.taskListContainer;
		const ganttContainer = this.ganttContainer;

		// 使用标志位防止循环触发
		let isSyncing = false;

		// chart 容器滚动 → 同步到 header 和 tasklist
		ganttContainer.addEventListener('scroll', () => {
			if (isSyncing) return;
			isSyncing = true;

			headerContainer.scrollLeft = ganttContainer.scrollLeft;
			taskListContainer.scrollTop = ganttContainer.scrollTop;

			requestAnimationFrame(() => {
				isSyncing = false;
			});
		});

		// header 容器滚动 → 同步到 chart
		headerContainer.addEventListener('scroll', () => {
			if (isSyncing) return;
			isSyncing = true;

			ganttContainer.scrollLeft = headerContainer.scrollLeft;

			requestAnimationFrame(() => {
				isSyncing = false;
			});
		});

		// tasklist 容器滚动 → 同步到 chart
		taskListContainer.addEventListener('scroll', () => {
			if (isSyncing) return;
			isSyncing = true;

			ganttContainer.scrollTop = taskListContainer.scrollTop;

			requestAnimationFrame(() => {
				isSyncing = false;
			});
		});
	}

	/**
	 * 设置分隔条拖动
	 */
	private setupResizer(): void {
		if (!this.resizer || !this.ganttLayout) return;

		const resizer = this.resizer;
		const layout = this.ganttLayout;

		// 鼠标按下开始拖动
		resizer.addEventListener('mousedown', (e) => {
			this.isResizing = true;
			document.body.style.cursor = 'col-resize';
			document.body.style.userSelect = 'none'; // 防止拖动时选中文字

			e.preventDefault();
		});

		// 鼠标移动调整宽度
		document.addEventListener('mousemove', (e) => {
			if (!this.isResizing || !layout) return;

			const layoutRect = layout.getBoundingClientRect();
			const newWidth = e.clientX - layoutRect.left;

			// 限制最小和最大宽度
			const minWidth = 100;
			const maxWidth = layoutRect.width - this.resizerWidth - 200;

			if (newWidth >= minWidth && newWidth <= maxWidth) {
				this.taskColumnWidth = newWidth;

				// 更新 Grid 列宽
				layout.style.gridTemplateColumns = `${newWidth}px ${this.resizerWidth}px 1fr`;

				// 更新 corner SVG 元素
				if (this.cornerSvg) {
					this.cornerSvg.setAttribute('width', String(newWidth));
					const viewBox = this.cornerSvg.getAttribute('viewBox')?.split(' ');
					if (viewBox && viewBox.length === 4) {
						viewBox[2] = String(newWidth);
						this.cornerSvg.setAttribute('viewBox', viewBox.join(' '));
					}
					// 更新内部 rect 宽度和分隔线位置
					const bgRect = this.cornerSvg.querySelector('rect');
					if (bgRect) {
						bgRect.setAttribute('width', String(newWidth));
					}
					// 更新标题位置和分隔线
					const texts = this.cornerSvg.querySelectorAll('text');
					if (texts.length >= 2) {
						// 任务列标题
						texts[1].setAttribute('x', String(this.taskNumberColumnWidth + (newWidth - this.taskNumberColumnWidth) / 2));
					}
					const dividerLine = this.cornerSvg.querySelector('line[stroke-width="1"]');
					if (dividerLine) {
						dividerLine.setAttribute('x1', String(this.taskNumberColumnWidth));
						dividerLine.setAttribute('x2', String(this.taskNumberColumnWidth));
					}
				}

				// tasklist SVG 保持固定大宽度以显示完整任务描述，不随拖动改变
			}
		});

		// 鼠标释放结束拖动
		document.addEventListener('mouseup', () => {
			if (this.isResizing) {
				this.isResizing = false;
				document.body.style.cursor = '';
				document.body.style.userSelect = '';
			}
		});
	}

	/**
	 * 渲染左上角空白区域（包含序号和任务列标题）
	 */
	private renderCorner(svg: SVGSVGElement | null): void {
		if (!svg) return;

		const ns = 'http://www.w3.org/2000/svg';
		const width = this.taskColumnWidth;
		const height = this.headerHeight;

		// 背景
		const bg = document.createElementNS(ns, 'rect');
		bg.setAttribute('x', '0');
		bg.setAttribute('y', '0');
		bg.setAttribute('width', String(width));
		bg.setAttribute('height', String(height));
		bg.setAttribute('fill', 'var(--background-secondary)');
		svg.appendChild(bg);

		// 序号列标题
		const numberText = document.createElementNS(ns, 'text');
		numberText.setAttribute('x', String(this.taskNumberColumnWidth / 2));
		numberText.setAttribute('y', String(height / 2 + 5));
		numberText.setAttribute('text-anchor', 'middle');
		numberText.setAttribute('font-size', '11');
		numberText.setAttribute('font-weight', '600');
		numberText.setAttribute('fill', 'var(--text-muted)');
		numberText.textContent = '序号';
		svg.appendChild(numberText);

		// 任务列标题
		const taskText = document.createElementNS(ns, 'text');
		taskText.setAttribute('x', String(this.taskNumberColumnWidth + (width - this.taskNumberColumnWidth) / 2));
		taskText.setAttribute('y', String(height / 2 + 5));
		taskText.setAttribute('text-anchor', 'middle');
		taskText.setAttribute('font-size', '11');
		taskText.setAttribute('font-weight', '600');
		taskText.setAttribute('fill', 'var(--text-muted)');
		taskText.textContent = '任务';
		svg.appendChild(taskText);

		// 序号列和任务列之间的分隔线
		const dividerLine = document.createElementNS(ns, 'line');
		dividerLine.setAttribute('x1', String(this.taskNumberColumnWidth));
		dividerLine.setAttribute('y1', '0');
		dividerLine.setAttribute('x2', String(this.taskNumberColumnWidth));
		dividerLine.setAttribute('y2', String(height));
		dividerLine.setAttribute('stroke', 'var(--background-modifier-border)');
		dividerLine.setAttribute('stroke-width', '1');
		svg.appendChild(dividerLine);
	}

	/**
	 * 渲染任务列表（左侧）
	 */
	private renderTaskList(svg: SVGSVGElement | null): void {
		if (!svg) return;

		const ns = 'http://www.w3.org/2000/svg';
		const width = this.taskColumnWidth;
		const numberWidth = this.taskNumberColumnWidth;
		// 使用足够大的宽度来显示完整任务描述
		const contentWidth = 2000;

		// 背景 - 只需要任务区域的高度
		const bg = document.createElementNS(ns, 'rect');
		bg.setAttribute('x', '0');
		bg.setAttribute('y', '0');
		bg.setAttribute('width', String(contentWidth + numberWidth));
		bg.setAttribute('height', String(this.tasks.length * this.rowHeight));
		bg.setAttribute('fill', 'var(--background-primary)');
		svg.appendChild(bg);

		// 绘制任务名称
		this.tasks.forEach((task, index) => {
			const y = index * this.rowHeight;
			const taskNumber = index + 1;

			// 直接从 GanttChartTask 获取信息（不需要查找 originalTask）
			const isCompleted = task.completed || task.progress === 100;

			// 行背景（偶数行添加背景色）
			if (index % 2 === 0) {
				const rowBg = document.createElementNS(ns, 'rect');
				rowBg.setAttribute('x', '0');
				rowBg.setAttribute('y', String(y));
				rowBg.setAttribute('width', String(contentWidth + numberWidth));
				rowBg.setAttribute('height', String(this.rowHeight));
				rowBg.setAttribute('fill', 'var(--background-secondary)');
				rowBg.setAttribute('opacity', '0.3');
				svg.appendChild(rowBg);
			}

			// === 序号列 ===
			const numberForeignObj = document.createElementNS(ns, 'foreignObject');
			numberForeignObj.setAttribute('x', '0');
			numberForeignObj.setAttribute('y', String(y));
			numberForeignObj.setAttribute('width', String(numberWidth));
			numberForeignObj.setAttribute('height', String(this.rowHeight));

			const numberDiv = document.createElement('div');
			numberDiv.className = GanttClasses.elements.taskNumberCell;
			numberDiv.style.cssText = `
				display: flex;
				align-items: center;
				justify-content: center;
				height: 100%;
				font-size: 11px;
				color: var(--text-muted);
				font-weight: 500;
			`;
			numberDiv.textContent = String(taskNumber);
			numberForeignObj.appendChild(numberDiv);
			svg.appendChild(numberForeignObj);

			// === 任务内容列 ===
			const contentForeignObj = document.createElementNS(ns, 'foreignObject');
			contentForeignObj.setAttribute('x', String(numberWidth));
			contentForeignObj.setAttribute('y', String(y));
			contentForeignObj.setAttribute('width', String(contentWidth));
			contentForeignObj.setAttribute('height', String(this.rowHeight));

			// 创建 HTML 内容容器
			const contentDiv = document.createElement('div');
			contentDiv.className = GanttClasses.elements.taskContentCell;
			contentDiv.style.cssText = `
				display: flex;
				align-items: center;
				height: 100%;
				font-size: 12px;
				color: var(--text-normal);
				gap: 8px;
				padding: 0 8px;
				width: 100%;
			`;

			// === 创建复选框 ===
			const checkbox = this.createTaskCheckbox(task, isCompleted);
			contentDiv.appendChild(checkbox);

			// === 创建可点击的文本容器 ===
			const textContainer = document.createElement('div');
			textContainer.className = 'gantt-task-list-item__text';
			textContainer.style.cssText = `
				flex: 1;
				white-space: nowrap;
				cursor: pointer;
			`;

			// 设置点击事件用于跳转（阻止链接点击触发）
			textContainer.addEventListener('click', (e) => {
				if ((e.target as HTMLElement).tagName !== 'A') {
					e.stopPropagation(); // 阻止事件冒泡
					this.handleTaskListItemClick(task);
				}
			});

			// 使用用户设置 showGlobalFilterInTaskText 控制是否显示全局过滤词
			const gf = (this.plugin?.settings?.globalTaskFilter || '').trim();
			const displayText = (this.plugin?.settings?.showGlobalFilterInTaskText && gf)
				? gf + ' ' + task.name
				: task.name;
			this.renderTaskDescriptionWithLinks(textContainer, displayText);
			contentDiv.appendChild(textContainer);

			contentForeignObj.appendChild(contentDiv);
			svg.appendChild(contentForeignObj);

			// 序号列和任务列之间的竖线分隔
			const dividerLine = document.createElementNS(ns, 'line');
			dividerLine.setAttribute('x1', String(numberWidth));
			dividerLine.setAttribute('y1', String(y));
			dividerLine.setAttribute('x2', String(numberWidth));
			dividerLine.setAttribute('y2', String((index + 1) * this.rowHeight));
			dividerLine.setAttribute('stroke', 'var(--background-modifier-border)');
			dividerLine.setAttribute('stroke-width', '1');
			svg.appendChild(dividerLine);

			// 底部分隔线
			const line = document.createElementNS(ns, 'line');
			line.setAttribute('x1', '0');
			line.setAttribute('y1', String((index + 1) * this.rowHeight));
			line.setAttribute('x2', String(contentWidth + numberWidth));
			line.setAttribute('y2', String((index + 1) * this.rowHeight));
			line.setAttribute('stroke', 'var(--background-modifier-border)');
			line.setAttribute('stroke-width', '0.5');
			svg.appendChild(line);
		});
	}

	/**
	 * 渲染任务描述为富文本（包含可点击的链接）
	 * 支持与 BaseViewRenderer 相同的链接格式
	 */
	private renderTaskDescriptionWithLinks(container: HTMLElement, text: string): void {
		// Obsidian 双向链接：[[note]] 或 [[note|alias]]
		const obsidianLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
		// Markdown 链接：[text](url)
		const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
		// 网址链接：http://example.com 或 https://example.com
		const urlRegex = /(https?:\/\/[^\s]+)/g;

		// 分割文本并处理链接
		let lastIndex = 0;
		const matches: Array<{ type: 'obsidian' | 'markdown' | 'url'; start: number; end: number; groups: RegExpExecArray }> = [];

		// 收集所有匹配
		let match;
		const textLower = text;

		// 收集 Obsidian 链接
		while ((match = obsidianLinkRegex.exec(textLower)) !== null) {
			matches.push({ type: 'obsidian', start: match.index, end: match.index + match[0].length, groups: match });
		}

		// 收集 Markdown 链接
		while ((match = markdownLinkRegex.exec(textLower)) !== null) {
			matches.push({ type: 'markdown', start: match.index, end: match.index + match[0].length, groups: match });
		}

		// 收集网址链接
		while ((match = urlRegex.exec(textLower)) !== null) {
			matches.push({ type: 'url', start: match.index, end: match.index + match[0].length, groups: match });
		}

		// 按位置排序并去重重叠
		matches.sort((a, b) => a.start - b.start);
		const uniqueMatches = [];
		let lastEnd = 0;
		for (const m of matches) {
			if (m.start >= lastEnd) {
				uniqueMatches.push(m);
				lastEnd = m.end;
			}
		}

		// 渲染文本和链接
		lastIndex = 0;
		for (const m of uniqueMatches) {
			// 添加前面的普通文本
			if (m.start > lastIndex) {
				container.appendText(text.substring(lastIndex, m.start));
			}

			// 添加链接
			if (m.type === 'obsidian') {
				const notePath = m.groups[1];
				const displayText = m.groups[2] || notePath;
				const link = container.createEl('a', { text: displayText, cls: 'gc-link gc-link--obsidian' });
				link.setAttr('data-href', notePath);
				link.href = 'javascript:void(0)';
				link.addEventListener('click', async (e) => {
					e.preventDefault();
					e.stopPropagation();
					// 尝试打开文件
					const file = this.app.metadataCache.getFirstLinkpathDest(notePath, '');
					if (file) {
						this.app.workspace.openLinkText(notePath, '');
					}
				});
			} else if (m.type === 'markdown') {
				const displayText = m.groups[1];
				const url = m.groups[2];
				const link = container.createEl('a', { text: displayText, cls: 'gc-link gc-link--markdown' });
				link.href = url;
				link.setAttr('target', '_blank');
				link.setAttr('rel', 'noopener noreferrer');
			} else if (m.type === 'url') {
				const url = m.groups[1];
				const link = container.createEl('a', { text: url, cls: 'gc-link gc-link--url' });
				link.href = url;
				link.setAttr('target', '_blank');
				link.setAttr('rel', 'noopener noreferrer');
			}

			lastIndex = m.end;
		}

		// 添加剩余的普通文本
		if (lastIndex < text.length) {
			container.appendText(text.substring(lastIndex));
		}
	}

	/**
	 * 创建任务复选框
	 */
	private createTaskCheckbox(
		ganttTask: GanttChartTask,
		isCompleted: boolean
	): HTMLInputElement {
		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.checked = isCompleted;
		checkbox.className = 'gc-gantt-view__task-checkbox';
		checkbox.style.cssText = `
			flex-shrink: 0;
			width: 16px;
			height: 16px;
			cursor: pointer;
			margin: 0;
			accent-color: var(--interactive-accent);
		`;

		// 阻止点击事件冒泡到任务列表项
		checkbox.addEventListener('click', (e) => {
			e.stopPropagation();
		});

		// 监听复选框变化
		checkbox.addEventListener('change', async (e) => {
			e.stopPropagation();
			const newCompletedState = (e.target as HTMLInputElement).checked;

			// 通过 onProgressChange 回调更新任务
			if (this.onProgressChange) {
				try {
					await this.onProgressChange(ganttTask, newCompletedState ? 100 : 0);
				} catch (error) {
					console.error('[SvgGanttRenderer] Error updating task completion:', error);
					// 恢复复选框状态
					checkbox.checked = isCompleted;
				}
			}
		});

		return checkbox;
	}

	/**
	 * 处理任务列表项点击事件 - 跳转到文件
	 */
	private handleTaskListItemClick(task: GanttChartTask): void {
		if (!task.filePath || !task.lineNumber || !this.app) return;

		// 使用 openFileInExistingLeaf 跳转到文件
		const { openFileInExistingLeaf } = require('../../utils/fileOpener');
		openFileInExistingLeaf(this.app, task.filePath, task.lineNumber);
	}

	/**
	 * 渲染头部（时间轴）- 支持颗粒度
	 */
	private renderHeader(
		svg: SVGSVGElement | null,
		minDate: Date,
		totalUnits: number,
		granularity: TimeGranularity
	): void {
		if (!svg) return;

		const ns = 'http://www.w3.org/2000/svg';
		const config = GRANULARITY_CONFIGS[granularity];
		const width = totalUnits * this.columnWidth + this.padding * 2;

		// 背景
		const headerBg = document.createElementNS(ns, 'rect');
		headerBg.setAttribute('x', '0');
		headerBg.setAttribute('y', '0');
		headerBg.setAttribute('width', String(width));
		headerBg.setAttribute('height', String(this.headerHeight));
		headerBg.setAttribute('fill', 'var(--background-secondary)');
		svg.appendChild(headerBg);

		// 绘制时间单元标签
		for (let i = 0; i < totalUnits; i++) {
			const unitDate = this.getDateForUnit(minDate, i, granularity);
			const x = this.padding + i * this.columnWidth;
			const y = this.headerHeight / 2;

			// 判断是否是今天所在的单元
			const today = new Date();
			const isCurrentUnit = this.isSameUnit(unitDate, today, granularity);

			// 绘制标签
			const text = document.createElementNS(ns, 'text');
			text.setAttribute('x', String(x + this.columnWidth / 2));
			text.setAttribute('y', String(y + 6));
			text.setAttribute('text-anchor', 'middle');
			text.setAttribute('font-size', '11');
			text.setAttribute('fill', isCurrentUnit ? 'var(--interactive-accent)' : 'var(--text-muted)');
			text.setAttribute('font-weight', isCurrentUnit ? '600' : '400');

			// 使用颗粒度配置的标签格式化器
			const label = config.labelFormatter(unitDate, i, getWeekNumber);
			if (label) {  // 只渲染非空标签
				text.textContent = label;
				svg.appendChild(text);
			}
		}
	}

	/**
	 * 渲染甘特图主体（网格线 + 任务条）
	 */
	private renderGanttChart(
		svg: SVGSVGElement | null,
		minDate: Date,
		totalUnits: number,
		fullHeight: number,
		granularity: TimeGranularity
	): void {
		if (!svg) return;

		const ns = 'http://www.w3.org/2000/svg';
		const width = totalUnits * this.columnWidth + this.padding * 2;
		const height = fullHeight - this.headerHeight;

		// 背景 - 从 y=0 开始
		const bg = document.createElementNS(ns, 'rect');
		bg.setAttribute('x', '0');
		bg.setAttribute('y', '0');
		bg.setAttribute('width', String(width));
		bg.setAttribute('height', String(height));
		bg.setAttribute('fill', 'var(--background-primary)');
		svg.appendChild(bg);

		// 绘制网格线
		this.renderGrid(ns, svg, minDate, totalUnits, width, height, granularity);

		// 绘制今天线
		this.renderTodayLine(ns, svg, minDate, totalUnits, height, granularity);

		// 绘制任务条
		this.renderTaskBars(ns, svg, minDate, totalUnits, granularity);
	}

	/**
	 * 获取指定单元的日期 - 辅助方法
	 */
	private getDateForUnit(minDate: Date, unitIndex: number, granularity: TimeGranularity): Date {
		const config = GRANULARITY_CONFIGS[granularity];
		return new Date(minDate.getTime() + unitIndex * config.milliseconds);
	}

	/**
	 * 判断两个日期是否在同一颗粒度单元 - 辅助方法
	 */
	private isSameUnit(date1: Date, date2: Date, granularity: TimeGranularity): boolean {
		switch (granularity) {
			case TimeGranularity.DAY:
				return date1.getFullYear() === date2.getFullYear() &&
					   date1.getMonth() === date2.getMonth() &&
					   date1.getDate() === date2.getDate();
			case TimeGranularity.WEEK:
				return getWeekNumber(date1) === getWeekNumber(date2) &&
					   date1.getFullYear() === date2.getFullYear();
			case TimeGranularity.MONTH:
				return date1.getFullYear() === date2.getFullYear() &&
					   date1.getMonth() === date2.getMonth();
		}
		return false;
	}

	/**
	 * 判断是否为主要网格线 - 辅助方法
	 */
	private isMajorGridLine(unitIndex: number, granularity: TimeGranularity): boolean {
		switch (granularity) {
			case TimeGranularity.DAY:
				return unitIndex % 7 === 0; // 每周加粗
			case TimeGranularity.WEEK:
				return unitIndex % 4 === 0; // 每月（约4周）加粗
			case TimeGranularity.MONTH:
				return unitIndex % 3 === 0; // 每季度加粗
		}
		return false;
	}

	/**
	 * 渲染网格线 - 支持颗粒度
	 */
	private renderGrid(
		ns: string,
		svg: SVGSVGElement | null,
		minDate: Date,
		totalUnits: number,
		width: number,
		height: number,
		granularity: TimeGranularity
	): void {
		if (!svg) return;

		const gridGroup = document.createElementNS(ns, 'g');
		addSvgClass(gridGroup, GanttClasses.elements.grid);

		// 垂直线（时间单元分隔）
		for (let i = 0; i <= totalUnits; i++) {
			const x = this.padding + i * this.columnWidth;

			const line = document.createElementNS(ns, 'line');
			line.setAttribute('x1', String(x));
			line.setAttribute('y1', '0');
			line.setAttribute('x2', String(x));
			line.setAttribute('y2', String(height));
			line.setAttribute('stroke', 'var(--background-modifier-border)');
			line.setAttribute('stroke-width', '0.5');

			// 根据颗粒度设置主要/次要网格线
			const isMajorLine = this.isMajorGridLine(i, granularity);
			line.setAttribute('stroke-dasharray', isMajorLine ? 'none' : '2 2');

			gridGroup.appendChild(line);
		}

		// 水平线（任务行分隔）- 保持不变
		for (let i = 0; i <= this.tasks.length; i++) {
			const y = i * this.rowHeight;

			const line = document.createElementNS(ns, 'line');
			line.setAttribute('x1', String(this.padding));
			line.setAttribute('y1', String(y));
			line.setAttribute('x2', String(width - this.padding));
			line.setAttribute('y2', String(y));
			line.setAttribute('stroke', 'var(--background-modifier-border)');
			line.setAttribute('stroke-width', '0.5');

			gridGroup.appendChild(line);
		}

		svg.appendChild(gridGroup);
	}

	/**
	 * 渲染今天线 - 支持颗粒度
	 */
	private renderTodayLine(
		ns: string,
		svg: SVGSVGElement | null,
		minDate: Date,
		totalUnits: number,
		height: number,
		granularity: TimeGranularity
	): void {
		if (!svg) return;

		const today = new Date();
		const config = GRANULARITY_CONFIGS[granularity];
		const unitsDiff = (today.getTime() - minDate.getTime()) / config.milliseconds;

		if (unitsDiff >= 0 && unitsDiff <= totalUnits) {
			const x = this.padding + unitsDiff * this.columnWidth;

			const line = document.createElementNS(ns, 'line');
			line.setAttribute('x1', String(x));
			line.setAttribute('y1', '0');
			line.setAttribute('x2', String(x));
			line.setAttribute('y2', String(height));
			line.setAttribute('stroke', 'var(--interactive-accent)');
			line.setAttribute('stroke-width', '2');
			line.setAttribute('stroke-dasharray', '4 2');

			svg.appendChild(line);
		}
	}

	/**
	 * 渲染任务条 - 支持颗粒度（保持原始精度）
	 */
	private renderTaskBars(
		ns: string,
		svg: SVGSVGElement | null,
		minDate: Date,
		totalUnits: number,
		granularity: TimeGranularity
	): void {
		if (!svg) return;

		const tasksGroup = document.createElementNS(ns, 'g');
		addSvgClass(tasksGroup, GanttClasses.elements.tasks);

		const config = GRANULARITY_CONFIGS[granularity];

		this.tasks.forEach((task, index) => {
			const taskStart = new Date(task.start);
			const taskEnd = new Date(task.end);

			// 计算任务在当前颗粒度下的精确位置和宽度
			const startOffset = (taskStart.getTime() - minDate.getTime()) / config.milliseconds;
			const duration = (taskEnd.getTime() - taskStart.getTime()) / config.milliseconds;

			const x = this.padding + startOffset * this.columnWidth;
			const y = index * this.rowHeight + (this.rowHeight - 24) / 2;
			const barWidth = duration * this.columnWidth - 8;

			// 任务条组
			const barGroup = document.createElementNS(ns, 'g');
			addSvgClass(barGroup, GanttClasses.elements.barGroup);
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
			let progressElement: SVGRectElement | null = null;
			if (task.progress > 0 && task.progress < 100) {
				const progressWidth = barWidth * task.progress / 100;
				const elem = document.createElementNS(ns, 'rect') as SVGRectElement;
				elem.setAttribute('x', String(x));
				elem.setAttribute('y', String(y));
				elem.setAttribute('width', String(Math.max(progressWidth - 8, 0)));
				elem.setAttribute('height', '24');
				elem.setAttribute('rx', '4');
				elem.setAttribute('fill', fillColor);
				elem.setAttribute('opacity', '0.4');
				progressElement = elem;
			}

			// === 添加拖动手柄 ===
			const HANDLE_HIT_AREA = 12;
			const HANDLE_VISUAL_SIZE = 4;

			// 左侧手柄 - 修改开始时间
			const leftHandle = document.createElementNS(ns, 'rect');
			leftHandle.setAttribute('x', String(x));
			leftHandle.setAttribute('y', String(y));
			leftHandle.setAttribute('width', String(HANDLE_HIT_AREA));
			leftHandle.setAttribute('height', '24');
			leftHandle.setAttribute('fill', 'transparent');
			(leftHandle as any).style.cursor = 'w-resize';
			leftHandle.classList.add('gc-gantt-view__handle-left');

			// 左侧视觉提示
			const leftVisual = document.createElementNS(ns, 'rect');
			leftVisual.setAttribute('x', String(x + 2));
			leftVisual.setAttribute('y', String(y + 8));
			leftVisual.setAttribute('width', String(HANDLE_VISUAL_SIZE));
			leftVisual.setAttribute('height', '8');
			leftVisual.setAttribute('rx', '1');
			leftVisual.setAttribute('fill', 'white');
			leftVisual.setAttribute('opacity', '0.5');
			(leftVisual as any).style.pointerEvents = 'none';

			// 右侧手柄 - 修改结束时间
			const rightHandleX = x + Math.max(barWidth, 20) - HANDLE_HIT_AREA;
			const rightHandle = document.createElementNS(ns, 'rect');
			rightHandle.setAttribute('x', String(rightHandleX));
			rightHandle.setAttribute('y', String(y));
			rightHandle.setAttribute('width', String(HANDLE_HIT_AREA));
			rightHandle.setAttribute('height', '24');
			rightHandle.setAttribute('fill', 'transparent');
			(rightHandle as any).style.cursor = 'e-resize';
			rightHandle.classList.add('gc-gantt-view__handle-right');

			// 右侧视觉提示
			const rightVisual = document.createElementNS(ns, 'rect');
			rightVisual.setAttribute('x', String(rightHandleX + HANDLE_HIT_AREA - 2 - HANDLE_VISUAL_SIZE));
			rightVisual.setAttribute('y', String(y + 8));
			rightVisual.setAttribute('width', String(HANDLE_VISUAL_SIZE));
			rightVisual.setAttribute('height', '8');
			rightVisual.setAttribute('rx', '1');
			rightVisual.setAttribute('fill', 'white');
			rightVisual.setAttribute('opacity', '0.5');
			(rightVisual as any).style.pointerEvents = 'none';

			// 设置拖动事件
			this.setupTaskBarDragging(barGroup as SVGGElement, bar as SVGRectElement, leftHandle as SVGRectElement, rightHandle as SVGRectElement, task, minDate);

			// 添加点击和悬停事件（如果刚结束拖动，不执行点击）
			bar.addEventListener('click', (e) => {
				if (this.taskDragState.justFinishedDragging) return;
				e.stopPropagation(); // 阻止事件冒泡
				this.handleTaskClick(task);
			});
			bar.addEventListener('mouseenter', (event: MouseEvent) => {
				bar.setAttribute('opacity', '1');
				this.showPopup(task, bar, { x: event.clientX, y: event.clientY });
			});
			bar.addEventListener('mouseleave', () => {
				bar.setAttribute('opacity', '0.85');
				this.hidePopup();
			});

			// 添加元素到组
			if (progressElement) {
				barGroup.appendChild(progressElement);  // 进度条
			}
			barGroup.appendChild(bar);       // 主任务条
			barGroup.appendChild(leftHandle);   // 左侧手柄
			barGroup.appendChild(leftVisual);   // 左侧视觉
			barGroup.appendChild(rightHandle);  // 右侧手柄
			barGroup.appendChild(rightVisual);  // 右侧视觉
			tasksGroup.appendChild(barGroup);
		});

		svg.appendChild(tasksGroup);
	}

	/**
	 * 渲染弹窗容器
	 */
	private renderPopupContainer(): void {
		// 弹窗由 TooltipManager 统一管理
	}

	/**
	 * 处理任务点击
	 */
	private handleTaskClick(task: GanttChartTask): void {
		if (this.config.on_click) {
			this.config.on_click(task);
		}
	}

	/**
	 * 显示弹窗（使用全局 TooltipManager）
	 * @param task - 甘特图任务
	 * @param targetElement - 目标元素
	 * @param mousePosition - 鼠标位置（可选）
	 */
	private showPopup(task: GanttChartTask, targetElement: Element, mousePosition?: MousePosition): void {
		if (!this.plugin || !task.filePath) return;

		// 直接使用 GanttChartTask（已包含完整任务信息）
		const tooltipManager = TooltipManager.getInstance(this.plugin);
		tooltipManager.show(task as any, targetElement as HTMLElement, mousePosition);
	}

	/**
	 * 隐藏弹窗（使用全局 TooltipManager）
	 */
	private hidePopup(): void {
		if (!this.plugin) return;

		const tooltipManager = TooltipManager.getInstance(this.plugin);
		tooltipManager.hide();
	}

	/**
	 * 拖动状态
	 */
	private taskDragState = {
		isDragging: false,
		dragType: 'none' as 'none' | 'move' | 'resize-left' | 'resize-right',
		task: null as GanttChartTask | null,
		startX: 0,
		originalStart: null as Date | null,
		originalEnd: null as Date | null,
		taskMinDate: null as Date | null,
		hasMoved: false,
		barElement: null as SVGRectElement | null,
		leftHandleElement: null as SVGRectElement | null,
		rightHandleElement: null as SVGRectElement | null,
		leftVisualElement: null as SVGRectElement | null,
		rightVisualElement: null as SVGRectElement | null,
		justFinishedDragging: false, // 标志位：刚结束拖动，用于屏蔽点击事件
	};

	/**
	 * 设置任务条拖动事件
	 */
	private setupTaskBarDragging(
		barGroup: SVGGElement,
		bar: SVGRectElement,
		leftHandle: SVGRectElement,
		rightHandle: SVGRectElement,
		task: GanttChartTask,
		minDate: Date
	): void {
		// 左手柄拖动 - 只修改开始时间
		leftHandle.addEventListener('mousedown', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this.startDragging(task, 'resize-left', e.clientX, minDate, bar, leftHandle, null);
		});

		// 右手柄拖动 - 只修改结束时间
		rightHandle.addEventListener('mousedown', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this.startDragging(task, 'resize-right', e.clientX, minDate, bar, null, rightHandle);
		});

		// 任务条整体拖动 - 同时修改开始和结束时间
		bar.addEventListener('mousedown', (e: MouseEvent) => {
			e.preventDefault();
			this.startDragging(task, 'move', e.clientX, minDate, bar, null, null);
		});
	}

	/**
	 * 开始拖动
	 */
	private startDragging(
		task: GanttChartTask,
		dragType: 'move' | 'resize-left' | 'resize-right',
		startX: number,
		minDate: Date,
		bar: SVGRectElement,
		leftHandle: SVGRectElement | null,
		rightHandle: SVGRectElement | null
	): void {
		this.taskDragState = {
			isDragging: true,
			dragType,
			task,
			startX,
			originalStart: new Date(task.start),
			originalEnd: new Date(task.end),
			taskMinDate: minDate,
			hasMoved: false,
			barElement: bar,
			leftHandleElement: leftHandle,
			rightHandleElement: rightHandle,
			leftVisualElement: null,
			rightVisualElement: null,
			justFinishedDragging: false,
		};

		// 保存视觉元素引用
		const barGroup = bar.parentElement;
		if (barGroup) {
			this.taskDragState.leftVisualElement = barGroup.querySelector('.gc-gantt-view__handle-left + rect + *') as SVGRectElement;
			this.taskDragState.rightVisualElement = barGroup.querySelector('.gc-gantt-view__handle-right + rect + *') as SVGRectElement;
		}

		// 设置全局光标
		const cursorMap = {
			'move': 'grabbing',
			'resize-left': 'w-resize',
			'resize-right': 'e-resize',
		};
		document.body.style.cursor = cursorMap[dragType];
		document.body.style.userSelect = 'none';

		// 设置全局事件监听
		document.addEventListener('mousemove', this.handleDragMove);
		document.addEventListener('mouseup', this.handleDragEnd);
	}

	/**
	 * 处理拖动移动（绑定方法）
	 */
	private handleDragMove = (e: MouseEvent): void => {
		if (!this.taskDragState.isDragging) return;

		const deltaX = e.clientX - this.taskDragState.startX;
		const daysDelta = Math.round(deltaX / this.columnWidth);

		if (daysDelta === 0) return;

		this.taskDragState.hasMoved = true;

		const { dragType, originalStart, originalEnd, taskMinDate } = this.taskDragState;
		let newStart: Date;
		let newEnd: Date;

		switch (dragType) {
			case 'move':
				// 整体拖动：同时修改开始和结束时间
				newStart = this.addDays(originalStart!, daysDelta);
				newEnd = this.addDays(originalEnd!, daysDelta);
				break;
			case 'resize-left':
				// 左侧拖动：只修改开始时间
				newStart = this.addDays(originalStart!, daysDelta);
				newEnd = originalEnd!;
				// 确保开始时间不晚于结束时间
				if (newStart >= newEnd) {
					newStart = new Date(newEnd);
					newStart.setDate(newStart.getDate() - 1);
				}
				break;
			case 'resize-right':
				// 右侧拖动：只修改结束时间
				newStart = originalStart!;
				newEnd = this.addDays(originalEnd!, daysDelta);
				// 确保结束时间不早于开始时间
				if (newEnd <= newStart) {
					newEnd = new Date(newStart);
					newEnd.setDate(newEnd.getDate() + 1);
				}
				break;
			default:
				return;
		}

		// 实时更新任务条视觉
		this.updateTaskBarVisual(newStart, newEnd, taskMinDate!);
	}

	/**
	 * 处理拖动结束（绑定方法）
	 */
	private handleDragEnd = async (e: MouseEvent): Promise<void> => {
		if (!this.taskDragState.isDragging) return;

		const { task, dragType, originalStart, originalEnd, startX, hasMoved } = this.taskDragState;

		// 重置状态
		this.taskDragState.isDragging = false;
		document.body.style.cursor = '';
		document.body.style.userSelect = '';

		// 移除全局事件监听
		document.removeEventListener('mousemove', this.handleDragMove);
		document.removeEventListener('mouseup', this.handleDragEnd);

		if (!hasMoved) {
			// 没有移动，视为点击，不设置标志位
			if (task!) this.handleTaskClick(task!);
			return;
		}

		// 有移动，设置标志位屏蔽点击事件
		this.taskDragState.justFinishedDragging = true;
		setTimeout(() => {
			this.taskDragState.justFinishedDragging = false;
		}, 100); // 100ms 后恢复点击功能

		const daysDelta = Math.round((e.clientX - startX) / this.columnWidth);
		if (daysDelta === 0) {
			this.refresh(this.tasks);
			return;
		}

		// 计算新日期
		let newStart: Date;
		let newEnd: Date;

		switch (dragType) {
			case 'move':
				newStart = this.addDays(originalStart!, daysDelta);
				newEnd = this.addDays(originalEnd!, daysDelta);
				break;
			case 'resize-left':
				newStart = this.addDays(originalStart!, daysDelta);
				newEnd = originalEnd!;
				if (newStart >= newEnd) {
					newStart = new Date(newEnd);
					newStart.setDate(newStart.getDate() - 1);
				}
				break;
			case 'resize-right':
				newStart = originalStart!;
				newEnd = this.addDays(originalEnd!, daysDelta);
				if (newEnd <= newStart) {
					newEnd = newStart;
					newEnd.setDate(newEnd.getDate() + 1);
				}
				break;
			default:
				return;
		}

		// 调用相应的更新方法
		try {
			if (dragType === 'move') {
				// 整体拖动：使用现有的 onDateChange 回调
				if (this.onDateChange && task!) {
					await this.onDateChange(task!, newStart, newEnd);
				}
			} else if (dragType === 'resize-left') {
				// 左侧拖动：只更新开始时间
				if (task!) await this.handleStartDateChange(task!, newStart);
			} else if (dragType === 'resize-right') {
				// 右侧拖动：只更新结束时间
				if (task!) await this.handleEndDateChange(task!, newEnd);
			}
		} catch (error) {
			console.error('[SvgGanttRenderer] Error updating task dates:', error);
		}
	}

	/**
	 * 日期加减天数
	 */
	private addDays(date: Date, days: number): Date {
		const result = new Date(date);
		result.setDate(result.getDate() + days);
		return result;
	}

	/**
	 * 实时更新任务条视觉
	 */
	private updateTaskBarVisual(newStart: Date, newEnd: Date, minDate: Date): void {
		if (!this.taskDragState.task) return;

		const { barElement, leftHandleElement, rightHandleElement, leftVisualElement, rightVisualElement } = this.taskDragState;

		// 计算新的位置和宽度
		const startOffset = Math.floor((newStart.getTime() - minDate.getTime()) / (24 * 60 * 60 * 1000));
		const duration = Math.ceil((newEnd.getTime() - newStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;
		const x = this.padding + startOffset * this.columnWidth;
		const barWidth = duration * this.columnWidth - 8;

		// 更新任务条
		barElement!.setAttribute('x', String(x));
		barElement!.setAttribute('width', String(Math.max(barWidth, 20)));

		// 更新手柄位置
		if (leftHandleElement) {
			leftHandleElement.setAttribute('x', String(x));
		}
		if (leftVisualElement) {
			leftVisualElement.setAttribute('x', String(x + 2));
		}

		const rightHandleX = x + Math.max(barWidth, 20) - 12; // HANDLE_HIT_AREA
		if (rightHandleElement) {
			rightHandleElement.setAttribute('x', String(rightHandleX));
		}
		if (rightVisualElement) {
			rightVisualElement.setAttribute('x', String(rightHandleX + 12 - 2 - 4)); // HANDLE_HIT_AREA - 2 - HANDLE_VISUAL_SIZE
		}
	}

	/**
	 * 单独更新开始时间（左侧拖动）
	 */
	private async handleStartDateChange(task: GanttChartTask, newStart: Date): Promise<void> {
		if (!this.plugin || !task.filePath) return;

		const { updateTaskProperties } = require('../../tasks/taskUpdater');
		const updates: Record<string, Date> = {};
		updates[this.startField] = newStart;

		try {
			// 直接使用 task（已包含完整任务信息）
			await updateTaskProperties(this.app, task as any, updates, this.plugin.settings.enabledTaskFormats);
			await this.plugin.taskCache.updateFileCache(task.filePath);
		} catch (error) {
			console.error('[SvgGanttRenderer] Error updating start date:', error);
		}
	}

	/**
	 * 单独更新结束时间（右侧拖动）
	 */
	private async handleEndDateChange(task: GanttChartTask, newEnd: Date): Promise<void> {
		if (!this.plugin || !task.filePath) return;

		const { updateTaskProperties } = require('../../tasks/taskUpdater');
		const updates: Record<string, Date> = {};
		updates[this.endField] = newEnd;

		try {
			// 直接使用 task（已包含完整任务信息）
			await updateTaskProperties(this.app, task as any, updates, this.plugin.settings.enabledTaskFormats);
			await this.plugin.taskCache.updateFileCache(task.filePath);
		} catch (error) {
			console.error('[SvgGanttRenderer] Error updating end date:', error);
		}
	}

	/**
	 * 增量更新任务列表区域
	 */
	private updateTaskListIncremental(
		added: GanttChartTask[],
		removed: GanttChartTask[],
		modified: GanttChartTask[],
		allTasks: GanttChartTask[]
	): void {
		const svg = this.taskListSvg;
		if (!svg) return;

		// 1. 移除删除的任务
		removed.forEach(task => {
			const row = svg.querySelector(`[data-task-row="${task.id}"]`);
			if (row) row.remove();
		});

		// 2. 更新现有任务
		allTasks.forEach((task, index) => {
			const row = svg.querySelector(`[data-task-row="${task.id}"]`);
			if (row) {
				// 更新复选框状态
				const checkbox = row.querySelector('input[type="checkbox"]') as HTMLInputElement;
				if (checkbox) {
					const isCompleted = task.completed || task.progress === 100;
					checkbox.checked = isCompleted;
				}
				// 更新序号
				const numberCell = row.querySelector('.gantt-task-number');
				if (numberCell) {
					numberCell.textContent = String(index + 1);
				}
			}
		});

		// 3. 简化处理：如果任务数量变化，重新渲染整个列表
		if (added.length > 0 || removed.length > 0) {
			// 重新渲染任务列表
			svg.innerHTML = '';
			this.renderTaskList(svg);
		}
	}

	/**
	 * 增量更新甘特图区域
	 */
	private updateGanttAreaIncremental(
		added: GanttChartTask[],
		removed: GanttChartTask[],
		modified: GanttChartTask[],
		allTasks: GanttChartTask[]
	): void {
		if (!this.ganttSvg) return;

		const tasksGroup = this.ganttSvg.querySelector('.gantt-tasks-group') as SVGGElement;
		if (!tasksGroup) return;

		// 1. 移除删除的任务条
		removed.forEach(task => {
			const barGroup = tasksGroup.querySelector(`[data-task-bar="${task.id}"]`);
			if (barGroup) barGroup.remove();
		});

		// 2. 更新现有任务条
		modified.forEach(task => {
			const barGroup = tasksGroup.querySelector(`[data-task-bar="${task.id}"]`) as SVGGElement;
			if (barGroup) {
				this.updateTaskBarElement(barGroup, task);
			}
		});

		// 3. 添加新任务条（简化处理：重新渲染整个甘特图区域）
		if (added.length > 0) {
			if (this.ganttSvg) {
				const { minDate, totalUnits, granularity } = this.calculateDateRange();
				const ganttHeight = this.tasks.length * this.rowHeight + 10;
				this.renderGanttChart(this.ganttSvg, minDate, totalUnits, ganttHeight, granularity);
			}
		}
	}

	/**
	 * 更新单个任务条元素 - 支持颗粒度
	 */
	private updateTaskBarElement(barGroup: SVGGElement, task: GanttChartTask): void {
		const ns = 'http://www.w3.org/2000/svg';
		const { minDate, granularity } = this.calculateDateRange();
		const config = GRANULARITY_CONFIGS[granularity];

		const startDate = new Date(task.start);
		const endDate = new Date(task.end);

		// 计算任务在当前颗粒度下的精确位置和宽度
		const startOffset = (startDate.getTime() - minDate.getTime()) / config.milliseconds;
		const duration = (endDate.getTime() - startDate.getTime()) / config.milliseconds;

		const x = this.padding + startOffset * this.columnWidth;
		const y = this.tasks.findIndex(t => t.id === task.id) * this.rowHeight + 10; // 10px top padding
		const width = duration * this.columnWidth;

		// 更新任务条位置和宽度
		const bar = barGroup.querySelector('.task-bar') as SVGRectElement;
		if (bar) {
			bar.setAttribute('x', String(x));
			bar.setAttribute('width', String(Math.max(width, 20)));
			bar.setAttribute('y', String(y));

			// 更新颜色（根据完成状态）
			const isCompleted = task.completed || task.progress === 100;
			if (isCompleted) {
				bar.setAttribute('fill', 'var(--checkbox-done)'); // 完成状态颜色
			} else {
				// 根据优先级设置颜色
				const priorityClass = task.custom_class?.split(' ').find(c => c.startsWith('priority-'));
				if (priorityClass === 'priority-high') {
					bar.setAttribute('fill', 'var(--tag-fill-hot)');
				} else if (priorityClass === 'priority-medium') {
					bar.setAttribute('fill', 'var(--tag-fill-warm)');
				} else if (priorityClass === 'priority-low') {
					bar.setAttribute('fill', 'var(--tag-fill-cool)');
				} else {
					bar.setAttribute('fill', 'var(--interactive-accent)');
				}
			}
		}

		// 更新进度条
		const progressRect = barGroup.querySelector('.task-progress') as SVGRectElement;
		if (progressRect) {
			const progressWidth = width * (task.progress / 100);
			progressRect.setAttribute('x', String(x));
			progressRect.setAttribute('y', String(y));
			progressRect.setAttribute('width', String(progressWidth));
		}
	}

	/**
	 * 滚动到今天 - 支持颗粒度
	 */
	scrollToToday(): void {
		if (!this.ganttContainer || !this.minDate) return;

		const today = new Date();
		const config = GRANULARITY_CONFIGS[this.granularity];
		const unitsDiff = (today.getTime() - this.minDate.getTime()) / config.milliseconds;

		if (unitsDiff >= 0 && unitsDiff <= this.totalUnits) {
			// 计算今天的 x 坐标
			const todayX = this.padding + unitsDiff * this.columnWidth;

			// 获取容器宽度
			const containerWidth = this.ganttContainer.clientWidth;

			// 滚动到使今天线居中的位置
			const scrollLeft = todayX - containerWidth / 2;

			// 设置滚动位置
			this.ganttContainer.scrollLeft = Math.max(0, scrollLeft);
		}
	}

	/**
	 * 销毁渲染器
	 */
	destroy(): void {
		this.hidePopup();
		this.headerSvg = null;
		this.taskListSvg = null;
		this.ganttSvg = null;
		this.cornerSvg = null;
		this.headerContainer = null;
		this.taskListContainer = null;
		this.ganttContainer = null;
		this.cornerContainer = null;
		this.ganttLayout = null;
		this.tasks = [];
	}

	/**
	 * 获取 SVG 元素（保留兼容性）
	 */
	getSvgElement(): SVGSVGElement | null {
		return this.ganttSvg;
	}
}
