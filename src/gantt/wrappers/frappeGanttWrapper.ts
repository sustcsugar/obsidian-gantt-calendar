/**
 * Frappe Gantt 包装类
 * 管理 SVG 甘特图实例的生命周期、渲染和事件处理
 */

import { SvgGanttRenderer } from './svgGanttRenderer';
import type { FrappeTask, FrappeGanttConfig, IFrappeGantt } from '../types';

/**
 * Frappe Gantt 包装类
 *
 * 负责初始化、更新和销毁甘特图实例
 * 处理所有与甘特图的交互
 */
export class FrappeGanttWrapper {
	private renderer: SvgGanttRenderer | null = null;
	private container: HTMLElement;
	private config: FrappeGanttConfig;
	private isInitialized = false;

	/**
	 * 构造函数
	 *
	 * @param container - 容器元素
	 * @param config - 甘特图配置
	 */
	constructor(container: HTMLElement, config: FrappeGanttConfig) {
		this.container = container;
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
	async init(tasks: FrappeTask[] = []): Promise<void> {
		if (this.isInitialized) {
			this.destroy();
		}

		try {
			// 创建 SVG 渲染器
			this.renderer = new SvgGanttRenderer(this.container, this.config);

			// 设置事件处理器
			this.renderer.setEventHandlers({
				onDateChange: this.config.on_date_change,
				onProgressChange: this.config.on_progress_change
			});

			// 初始化渲染
			this.renderer.init(tasks);

			this.isInitialized = true;
		} catch (error) {
			console.error('[FrappeGanttWrapper] Failed to initialize:', error);
			throw error;
		}
	}

	/**
	 * 更新任务数据
	 *
	 * @param tasks - 新的任务列表
	 */
	updateTasks(tasks: FrappeTask[]): void {
		if (!this.renderer) {
			console.warn('[FrappeGanttWrapper] Renderer not initialized, call init() first');
			return;
		}

		this.renderer.refresh(tasks);
	}

	/**
	 * 更新配置
	 *
	 * @param newConfig - 新的配置选项
	 */
	updateConfig(newConfig: Partial<FrappeGanttConfig>): void {
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
	changeViewMode(mode: FrappeGanttConfig['view_mode']): void {
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
	 * 获取当前任务列表
	 *
	 * @returns 当前任务列表
	 */
	getTasks(): FrappeTask[] {
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
		this.container.removeClass('frappe-gantt-container');
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
	getConfig(): FrappeGanttConfig {
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
