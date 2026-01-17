/**
 * 甘特图适配器类
 * 管理 SVG 甘特图实例的生命周期、渲染和事件处理
 */

import { SvgGanttRenderer } from './svgGanttRenderer';
import type { GanttChartTask, GanttChartConfig, DateFieldType } from '../types';
import type { GCTask } from '../../types';
import { GanttClasses } from '../../utils/bem';
import { Logger } from '../../utils/logger';

/**
 * 甘特图适配器类
 *
 * 负责初始化、更新和销毁甘特图实例
 * 处理所有与甘特图的交互
 */
export class GanttChartAdapter {
	private renderer: SvgGanttRenderer | null = null;
	private container: HTMLElement;
	private config: GanttChartConfig;
	private isInitialized = false;
	private plugin: any;
	private app: any;  // Obsidian App 实例
	private originalTasks: GCTask[] = [];
	private startField: DateFieldType = 'startDate';
	private endField: DateFieldType = 'dueDate';

	/**
	 * 构造函数
	 *
	 * @param container - 容器元素
	 * @param config - 甘特图配置
	 * @param plugin - 插件实例（用于 TooltipManager）
	 * @param originalTasks - 原始任务列表（用于 tooltip 显示）
	 * @param startField - 开始时间字段
	 * @param endField - 结束时间字段
	 */
	constructor(
		container: HTMLElement,
		config: GanttChartConfig,
		plugin: any,
		originalTasks: GCTask[] = [],
		startField: DateFieldType = 'startDate',
		endField: DateFieldType = 'dueDate'
	) {
		this.container = container;
		this.plugin = plugin;
		this.app = plugin?.app;
		this.originalTasks = originalTasks;
		this.startField = startField;
		this.endField = endField;
		this.config = {
			...config,
			header_height: config.header_height ?? 50,
			column_width: config.column_width ?? 50,
			step: config.step ?? 24,
			bar_height: config.bar_height ?? 24,
			bar_corner_radius: config.bar_corner_radius ?? 4,
			arrow_curve: config.arrow_curve ?? 5,
			padding: config.padding ?? 18,
			date_format: config.date_format ?? 'YYYY-MM-DD',
			language: config.language ?? 'zh'
		};
	}

	/**
	 * 初始化甘特图
	 *
	 * @param tasks - 初始任务列表
	 */
	async init(tasks: GanttChartTask[] = []): Promise<void> {
		if (this.isInitialized) {
			this.destroy();
		}

		try {
			// 创建 SVG 渲染器
			this.renderer = new SvgGanttRenderer(
				this.container,
				this.config,
				this.plugin,
				this.originalTasks,
				this.app,
				this.startField,
				this.endField
			);

			// 设置事件处理器
			this.renderer.setEventHandlers({
				onDateChange: this.config.on_date_change,
				onProgressChange: this.config.on_progress_change
			});

			// 初始化渲染
			this.renderer.init(tasks);

			this.isInitialized = true;
		} catch (error) {
			Logger.error('GanttChartAdapter', 'Failed to initialize:', error);
			throw error;
		}
	}

	/**
	 * 更新配置
	 *
	 * @param newConfig - 新的配置选项
	 */
	updateConfig(newConfig: Partial<GanttChartConfig>): void {
		this.config = { ...this.config, ...newConfig };

		if (this.renderer) {
			this.renderer.updateConfig(this.config);
		}
	}

	/**
	 * 更改视图模式
	 *
	 * @param mode - 新的视图模式
	 */
	changeViewMode(mode: GanttChartConfig['view_mode']): void {
		if (this.renderer) {
			this.renderer.updateConfig({ view_mode: mode });
		}
		this.config.view_mode = mode;
	}

	/**
	 * 滚动到今天
	 */
	scrollToToday(): void {
		if (this.renderer) {
			this.renderer.scrollToToday();
		}
	}

	/**
	 * 滚动到最左边
	 */
	scrollToLeft(): void {
		if (this.renderer) {
			this.renderer.scrollToLeft();
		}
	}

	/**
	 * 滚动到最右边
	 */
	scrollToRight(): void {
		if (this.renderer) {
			this.renderer.scrollToRight();
		}
	}

	/**
	 * 获取滚动位置
	 */
	getScrollPosition(): { scrollLeft: number; scrollTop: number } {
		if (this.renderer) {
			return this.renderer.getScrollPosition();
		}
		return { scrollLeft: 0, scrollTop: 0 };
	}

	/**
	 * 设置滚动位置
	 */
	setScrollPosition(scrollLeft: number, scrollTop: number): void {
		if (this.renderer) {
			this.renderer.setScrollPosition(scrollLeft, scrollTop);
		}
	}

	/**
	 * 增量更新任务（不完整重建视图）
	 */
	updateTasks(ganttTasks: GanttChartTask[]): void {
		if (this.renderer) {
			this.renderer.updateTasks(ganttTasks);
		}
	}

	/**
	 * 获取当前任务列表
	 *
	 * @returns 当前任务列表
	 */
	getTasks(): GanttChartTask[] {
		// 返回配置中的任务（由外部维护）
		return [];
	}

	/**
	 * 销毁实例
	 */
	destroy(): void {
		if (this.renderer) {
			this.renderer.destroy();
			this.renderer = null;
		}
		this.container.empty();
		this.container.removeClass(GanttClasses.elements.container);
		this.isInitialized = false;
	}

	/**
	 * 检查是否已初始化
	 */
	get ready(): boolean {
		return this.isInitialized && this.renderer !== null;
	}

	/**
	 * 获取当前配置
	 */
	getConfig(): GanttChartConfig {
		return { ...this.config };
	}

	/**
	 * 获取渲染器实例
	 */
	getRenderer(): SvgGanttRenderer | null {
		return this.renderer;
	}
}

/**
 * 导出渲染器供外部使用
 */
export { SvgGanttRenderer };
