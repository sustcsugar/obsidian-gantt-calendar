/**
 * 甘特图视图渲染器 (基于 Frappe Gantt)
 *
 * 使用 Frappe Gantt 库实现专业的甘特图可视化
 */

import { Notice } from 'obsidian';
import { BaseViewRenderer } from './BaseViewRenderer';
import type { GanttTask, GanttTimeGranularity, SortState, TagFilterState } from '../types';
import { DEFAULT_TAG_FILTER_STATE } from '../types';
import { sortTasks } from '../tasks/taskSorter';
import {
	FrappeGanttWrapper,
	TaskUpdateHandler,
	TaskDataAdapter,
	type FrappeGanttConfig,
	type DateFieldType,
	type TaskStatusFilter
} from '../gantt';

/**
 * 甘特图视图渲染器
 *
 * 基于 Frappe Gantt 的重新实现
 */
export class GanttViewRenderer extends BaseViewRenderer {
	// 保存当前渲染容器的引用
	private currentContainer: HTMLElement | null = null;

	// 时间字段配置
	private startField: DateFieldType = 'startDate';
	private endField: DateFieldType = 'dueDate';
	private statusFilter: TaskStatusFilter = 'uncompleted';

	// 视图模式
	private timeGranularity: GanttTimeGranularity = 'day';
	private frappeViewMode: FrappeGanttConfig['view_mode'] = 'day';

	// 排序状态（默认按截止时间降序）
	private sortState: SortState = { field: 'dueDate', order: 'desc' };

	// Frappe Gantt 组件
	private ganttWrapper: FrappeGanttWrapper | null = null;
	private updateHandler: TaskUpdateHandler | null = null;

	// 当前任务数据（用于事件处理）
	private currentTasks: GanttTask[] = [];
	private currentFrappeTasks: import('../gantt').FrappeTask[] = [];

	// Getter 方法（供工具栏调用）
	public getStartField(): DateFieldType { return this.startField; }
	public setStartField(value: DateFieldType): void {
		this.startField = value;
		this.refresh();
	}

	public getEndField(): DateFieldType { return this.endField; }
	public setEndField(value: DateFieldType): void {
		this.endField = value;
		this.refresh();
	}

	public getStatusFilter(): TaskStatusFilter { return this.statusFilter; }
	public setStatusFilter(value: TaskStatusFilter): void {
		this.statusFilter = value;
		this.refresh();
	}

	public getTimeGranularity(): GanttTimeGranularity { return this.timeGranularity; }
	public setTimeGranularity(value: GanttTimeGranularity): void {
		this.timeGranularity = value;
		this.frappeViewMode = this.mapGranularityToViewMode(value);
		if (this.ganttWrapper) {
			this.ganttWrapper.changeViewMode(this.frappeViewMode);
		}
		this.refresh();
	}

	public getSortState(): SortState { return this.sortState; }
	public setSortState(state: SortState): void {
		this.sortState = state;
		this.refresh();
	}

	public getTagFilterState(): TagFilterState { return this.tagFilterState; }
	public setTagFilterState(state: TagFilterState): void {
		this.tagFilterState = state;
		this.refresh();
	}

	/**
	 * 跳转到今天
	 */
	public jumpToToday(): void {
		if (this.ganttWrapper) {
			// 滚动到今天的位置
			this.ganttWrapper.scrollToToday();
		}
	}

	/**
	 * 刷新甘特图
	 */
	private refresh(): void {
		if (this.currentContainer && this.currentContainer.isConnected) {
			this.render(this.currentContainer, new Date());
		}
	}

	/**
	 * 渲染甘特图视图
	 */
	render(container: HTMLElement, currentDate: Date): void {
		// 保存容器引用
		this.currentContainer = container;

		// 清理上一次的渲染
		this.cleanup();

		// 清理旧的甘特图容器（防止重复创建）
		const oldViews = container.querySelectorAll('.gc-view--gantt');
		oldViews.forEach(el => el.remove());

		// 清空容器
		container.empty();

		// 创建根容器
		const root = container.createDiv('gc-view gc-view--gantt');

		// 加载并渲染任务
		this.loadAndRenderGantt(root);
	}

	/**
	 * 加载并渲染甘特图
	 */
	private async loadAndRenderGantt(root: HTMLElement): Promise<void> {
		try {
			// 1. 获取所有任务
			const allTasks: GanttTask[] = this.plugin.taskCache.getAllTasks();
			this.currentTasks = allTasks;

			// 2. 应用筛选条件
			let filteredTasks = TaskDataAdapter.applyFilters(
				allTasks,
				this.statusFilter,
				this.tagFilterState.selectedTags,
				this.tagFilterState.operator
			);

			// 3. 应用排序
			filteredTasks = sortTasks(filteredTasks, this.sortState);

			// 4. 转换为 Frappe Gantt 格式
			const frappeTasks = TaskDataAdapter.toFrappeTasks(
				filteredTasks,
				this.startField,
				this.endField
			);
			this.currentFrappeTasks = frappeTasks;

			// 5. 如果没有任务，显示提示
			if (frappeTasks.length === 0) {
				this.renderEmptyState(root);
				return;
			}

			// 6. 创建甘特图容器
			const ganttContainer = root.createDiv('gantt-chart-container');
			const ganttRoot = ganttContainer.createDiv('frappe-gantt-root');

			// 7. 初始化更新处理器
			if (!this.updateHandler) {
				this.updateHandler = new TaskUpdateHandler(this.app, this.plugin);
				// 设置增量更新回调
				this.updateHandler.onTaskUpdated = (filePath: string) => {
					this.incrementallyUpdate(filePath);
				};
			}

			// 8. 配置 Frappe Gantt
			const config: FrappeGanttConfig = {
				view_mode: this.frappeViewMode,
				language: 'zh',
				header_height: 50,
				column_width: 40,
				step: 24,
				bar_height: 24,
				bar_corner_radius: 4,
				arrow_curve: 5,
				padding: 18,
				date_format: 'YYYY-MM-DD',
				on_click: (task) => this.handleTaskClick(task),
				on_date_change: (task, start, end) => this.handleDateChange(task, start, end),
				on_progress_change: (task, progress) => this.handleProgressChange(task, progress)
				// tooltip 由全局 TooltipManager 统一管理
			};

			// 9. 初始化 Frappe Gantt 包装器（传递 plugin、原始任务列表和字段配置）
			this.ganttWrapper = new FrappeGanttWrapper(ganttRoot, config, this.plugin, filteredTasks, this.startField, this.endField);

			// 10. 渲染甘特图
			await this.ganttWrapper.init(frappeTasks);

			// 11. 滚动到今天
			if (this.ganttWrapper) {
				this.ganttWrapper.scrollToToday();
			}

			// 12. 创建控制面板（可选）
			this.renderControlPanel(root, frappeTasks.length);

		} catch (error) {
			console.error('[GanttViewRenderer] Error rendering gantt:', error);
			root.createEl('div', {
				text: '渲染甘特图时出错: ' + (error as Error).message,
				cls: 'gantt-error'
			});
		}
	}

	/**
	 * 渲染空状态
	 */
	private renderEmptyState(root: HTMLElement): void {
		const emptyState = root.createDiv('gantt-empty-state');

		emptyState.createEl('div', {
			text: '📊',
			cls: 'gantt-empty-icon'
		});

		emptyState.createEl('h3', {
			text: '暂无可显示的任务',
			cls: 'gantt-empty-title'
		});

		const reasons: string[] = [];
		if (this.statusFilter !== 'all') {
			reasons.push(`当前筛选: ${this.statusFilter === 'completed' ? '已完成' : '未完成'}`);
		}
		if (this.tagFilterState.selectedTags.length > 0) {
			reasons.push(`标签筛选: ${this.tagFilterState.selectedTags.join(', ')}`);
		}
		if (!this.startField || !this.endField) {
			reasons.push('缺少时间字段配置');
		}

		if (reasons.length > 0) {
			emptyState.createEl('p', {
				text: '可能的原因: ' + reasons.join(', '),
				cls: 'gantt-empty-reason'
			});
		}

		emptyState.createEl('p', {
			text: '请检查任务是否包含开始和结束日期',
			cls: 'gantt-empty-hint'
		});
	}

	/**
	 * 渲染控制面板
	 */
	private renderControlPanel(root: HTMLElement, taskCount: number): void {
		const panel = root.createDiv('gantt-control-panel');

		// 显示任务统计
		const stats = panel.createDiv('gantt-stats');
		stats.innerHTML = `
			<span class="gantt-stat-item">
				<strong>${taskCount}</strong> 个任务
			</span>
			<span class="gantt-stat-item">
				<strong>${this.timeGranularity}</strong> 视图
			</span>
			<span class="gantt-stat-item">
				<strong>${this.startField}</strong> → <strong>${this.endField}</strong>
			</span>
		`;
	}

	/**
	 * 处理任务点击事件
	 */
	private handleTaskClick(frappeTask: import('../gantt').FrappeTask): void {
		if (this.updateHandler) {
			this.updateHandler.handleTaskClick(frappeTask, this.currentTasks);
		}
	}

	/**
	 * 处理日期变更事件（拖拽）
	 */
	private async handleDateChange(
		frappeTask: import('../gantt').FrappeTask,
		start: Date,
		end: Date
	): Promise<void> {
		if (!this.updateHandler) return;

		// 验证日期变更
		if (!TaskUpdateHandler.validateDateChange(start, end)) {
			new Notice('无效的日期范围');
			return;
		}

		await this.updateHandler.handleDateChange(
			frappeTask,
			start,
			end,
			this.startField,
			this.endField,
			this.currentTasks
		);
	}

	/**
	 * 处理进度变更事件
	 */
	private async handleProgressChange(
		frappeTask: import('../gantt').FrappeTask,
		progress: number
	): Promise<void> {
		if (!this.updateHandler) return;

		await this.updateHandler.handleProgressChange(
			frappeTask,
			progress,
			this.currentTasks
		);
	}

	/**
	 * 映射时间颗粒度到 Frappe Gantt 视图模式
	 */
	private mapGranularityToViewMode(granularity: GanttTimeGranularity): FrappeGanttConfig['view_mode'] {
		const modeMap: Record<GanttTimeGranularity, FrappeGanttConfig['view_mode']> = {
			'day': 'day',
			'week': 'week',
			'month': 'month'
		};
		return modeMap[granularity] || 'day';
	}

	/**
	 * 增量更新（不完整重建视图）
	 * 当单个任务更新时调用，只更新受影响的 DOM 元素
	 */
	private incrementallyUpdate(filePath: string): void {
		try {
			// 1. 更新内部任务数据
			const allTasks: GanttTask[] = this.plugin.taskCache.getAllTasks();
			const oldFrappeTasks = this.currentFrappeTasks;
			this.currentTasks = allTasks;

			// 2. 应用筛选和排序
			let filteredTasks = TaskDataAdapter.applyFilters(
				allTasks,
				this.statusFilter,
				this.tagFilterState.selectedTags,
				this.tagFilterState.operator
			);
			filteredTasks = sortTasks(filteredTasks, this.sortState);

			// 3. 转换为 FrappeTask
			const frappeTasks = TaskDataAdapter.toFrappeTasks(
				filteredTasks,
				this.startField,
				this.endField
			);
			this.currentFrappeTasks = frappeTasks;

			// 4. 判断更新策略
			if (this.shouldFullRefresh(oldFrappeTasks, frappeTasks)) {
				// 排序变化或任务数量变化大，执行完整刷新
				this.refresh();
			} else {
				// 只更新视觉，保持滚动位置
				if (this.ganttWrapper) {
					this.ganttWrapper.updateTasks(frappeTasks);
				}
			}
		} catch (error) {
			console.error('[GanttViewRenderer] Error in incremental update:', error);
			// 出错时回退到完整刷新
			this.refresh();
		}
	}

	/**
	 * 判断是否需要完整刷新
	 */
	private shouldFullRefresh(oldTasks: import('../gantt').FrappeTask[], newTasks: import('../gantt').FrappeTask[]): boolean {
		// 任务数量变化超过阈值，完整刷新
		if (Math.abs(oldTasks.length - newTasks.length) > 5) {
			return true;
		}

		// 检查任务顺序是否变化
		if (oldTasks.length !== newTasks.length) return true;

		for (let i = 0; i < oldTasks.length; i++) {
			if (oldTasks[i].id !== newTasks[i].id) {
				return true; // 顺序变了
			}
		}

		return false; // 顺序没变，可以增量更新
	}

	/**
	 * 清理资源
	 */
	private cleanup(): void {
		if (this.ganttWrapper) {
			this.ganttWrapper.destroy();
			this.ganttWrapper = null;
		}
		// updateHandler 不需要销毁，可以复用
	}

	/**
	 * 公共清理方法（由 BaseViewRenderer 调用）
	 */
	public override runDomCleanups(): void {
		this.cleanup();
		super.runDomCleanups();
	}
}
