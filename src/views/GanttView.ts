/**
 * 甘特图视图渲染器 (基于 甘特图)
 *
 * 使用 甘特图 库实现专业的甘特图可视化
 */

import { Notice } from 'obsidian';
import { BaseViewRenderer } from './BaseViewRenderer';
import type { GCTask, SortState, TagFilterState } from '../types';
import { sortTasks } from '../tasks/taskSorter';
import { GanttClasses } from '../utils/bem';
import { Logger } from '../utils/logger';
import {
	GanttChartAdapter,
	TaskUpdateHandler,
	TaskDataAdapter,
	type GanttChartConfig,
	type DateFieldType,

	TimeGranularity
} from '../gantt';
import { i18n } from '../i18n/i18n';

/**
 * 甘特图视图渲染器
 *
 * 基于 甘特图 的重新实现
 */
export class GanttViewRenderer extends BaseViewRenderer {
	// 保存当前渲染容器的引用
	private currentContainer: HTMLElement | null = null;

	// 滚动位置保存
	private scrollLeftPosition = 0;
	private scrollTopPosition = 0;

	// 视图模式（仅支持周视图）
	private ganttViewMode: GanttChartConfig['view_mode'] = 'week';

	// 甘特图 组件
	private ganttWrapper: GanttChartAdapter | null = null;
	private updateHandler: TaskUpdateHandler | null = null;

	// 当前任务数据（用于事件处理）
	private currentGlobalTasks: GCTask[] = [];
	private currentGanttTasks: import('../gantt').GanttChartTask[] = [];

	// 刷新后是否滚动到今天（用户主动点击刷新按钮时为true）
	private shouldScrollToTodayOnRefresh = false;

	// 防止重复刷新的递归保护标志
	private isRefreshing = false;

	// Getter 方法（供工具栏调用）- 从插件设置读取
	public getStartField(): DateFieldType { return this.plugin.settings.ganttStartField; }
	public setStartField(value: DateFieldType): void {
		this.plugin.settings.ganttStartField = value;
		this.refresh();
	}

	public getEndField(): DateFieldType { return this.plugin.settings.ganttEndField; }
	public setEndField(value: DateFieldType): void {
		this.plugin.settings.ganttEndField = value;
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
			// 保存当前位置
			this.saveScrollPosition();
			// 滚动到今天的位置
			this.ganttWrapper.scrollToToday();
		}
	}

	/**
	 * 跳转到最左边
	 */
	public jumpToLeft(): void {
		if (this.ganttWrapper) {
			// 保存当前位置
			this.saveScrollPosition();
			// 滚动到最左边
			this.ganttWrapper.scrollToLeft();
		}
	}

	/**
	 * 跳转到最右边
	 */
	public jumpToRight(): void {
		if (this.ganttWrapper) {
			// 保存当前位置
			this.saveScrollPosition();
			// 滚动到最右边
			this.ganttWrapper.scrollToRight();
		}
	}

	/**
	 * 保存滚动位置
	 */
	private saveScrollPosition(): void {
		if (this.ganttWrapper) {
			const pos = this.ganttWrapper.getScrollPosition();
			this.scrollLeftPosition = pos.scrollLeft;
			this.scrollTopPosition = pos.scrollTop;
		}
	}

	/**
	 * 恢复滚动位置
	 */
	private restoreScrollPosition(): void {
		if (this.ganttWrapper) {
			window.requestAnimationFrame(() => {
				this.ganttWrapper?.setScrollPosition(this.scrollLeftPosition, this.scrollTopPosition);
			});
		}
	}

	/**
	 * 刷新任务数据（公共接口）
	 * 当外部文件变更时调用此方法执行增量更新
	 */
	public refreshTasks(): void {
		this.performRefreshWithRetry();
	}

	/**
	 * 执行刷新
	 * 依赖 TaskStore 的事件通知系统，确保缓存已更新
	 */
	private performRefreshWithRetry(): void {
		try {
			// 如果甘特图还未初始化，跳过
			if (!this.ganttWrapper || !this.currentContainer) {
				return;
			}

			// 获取最新的任务数据
			const globalTasks: GCTask[] = this.plugin.taskCache.getAllTasks();
			const oldGanttTasks = this.currentGanttTasks;
			this.currentGlobalTasks = globalTasks;

			// 应用筛选和排序
			let filteredGlobalTasks = TaskDataAdapter.applyFilters(
				globalTasks,
				this.getStatusFilterState(),
				this.tagFilterState.selectedTags,
				this.tagFilterState.operator
			);
			filteredGlobalTasks = sortTasks(filteredGlobalTasks, this.sortState);

			// 转换为 GanttChartTask
			const ganttTasks = TaskDataAdapter.toGanttChartTasks(
				filteredGlobalTasks,
				this.getStartField(),
				this.getEndField()
			);
			this.currentGanttTasks = ganttTasks;

			// 判断更新策略
			if (this.shouldFullRefresh(oldGanttTasks, ganttTasks)) {
				// 任务数量或顺序变化大，执行完整刷新
				this.refresh();
			} else {
				// 增量更新：只更新视觉，保持滚动位置
				this.ganttWrapper.updateTasks(ganttTasks);
			}
		} catch (error) {
			Logger.error('GanttView', 'Error in refreshTasks:', error);
			// 出错时回退到完整刷新
			this.refresh();
		}
	}

	/**
	 * 刷新甘特图
	 */
	private refresh(): void {
		if (this.isRefreshing) return;
		if (this.currentContainer && this.currentContainer.isConnected) {
			this.isRefreshing = true;
			// 设置标志位：刷新后滚动到今天
			this.shouldScrollToTodayOnRefresh = true;
			this.render(this.currentContainer, new Date());
		}
	}

	/**
	 * 渲染甘特图视图
	 */
	render(container: HTMLElement, currentDate: Date): void {
		// 保存当前滚动位置（如果有）
		this.saveScrollPosition();

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
		void this.loadAndRenderGantt(root);
	}

	/**
	 * 加载并渲染甘特图
	 */
	private async loadAndRenderGantt(root: HTMLElement): Promise<void> {
		try {
			// 1. 获取所有任务
			const globalTasks: GCTask[] = this.plugin.taskCache.getAllTasks();
			this.currentGlobalTasks = globalTasks;

			// 2. 应用筛选条件
			let filteredGlobalTasks = TaskDataAdapter.applyFilters(
			globalTasks,
			this.getStatusFilterState(),
			this.tagFilterState.selectedTags,
			this.tagFilterState.operator
		);

			// 3. 应用排序
			filteredGlobalTasks = sortTasks(filteredGlobalTasks, this.sortState);

			// 4. 转换为 甘特图 格式
			const ganttTasks = TaskDataAdapter.toGanttChartTasks(
				filteredGlobalTasks,
				this.getStartField(),
				this.getEndField()
			);
			this.currentGanttTasks = ganttTasks;

			// 5. 如果没有任务，显示提示
			if (ganttTasks.length === 0) {
				this.renderEmptyState(root);
				return;
			}

			// 6. 创建甘特图容器
			const ganttContainer = root.createDiv(GanttClasses.elements.container);
			const ganttRoot = ganttContainer.createDiv(GanttClasses.elements.root);

			// 7. 初始化更新处理器
			if (!this.updateHandler) {
				this.updateHandler = new TaskUpdateHandler(this.app, this.plugin);
			}

			// 8. 配置 甘特图
			const config: GanttChartConfig = {
				view_mode: this.ganttViewMode,
				granularity: TimeGranularity.WEEK,  // 固定为周视图
				language: 'zh',
				header_height: 50,
				column_width: 40,
				step: 24,
				bar_height: 24,
				bar_corner_radius: 4,
				arrow_curve: 5,
				padding: 18,
				date_format: 'YYYY-MM-DD',
				on_click: (task) => { void this.handleTaskClick(task); },
				on_date_change: (task, start, end) => { void this.handleDateChange(task, start, end); },
				on_progress_change: (task, progress) => { void this.handleProgressChange(task, progress); }
				// tooltip 由全局 TooltipManager 统一管理
			};

			// 9. 初始化 甘特图 包装器（传递 plugin、原始任务列表、字段配置）
			this.ganttWrapper = new GanttChartAdapter(ganttRoot, config, this.plugin, filteredGlobalTasks, this.getStartField(), this.getEndField());

			// 10. 渲染甘特图
			await this.ganttWrapper.init(ganttTasks);

			// 11. 根据标志位决定滚动位置
			if (this.ganttWrapper) {
				if (this.shouldScrollToTodayOnRefresh) {
					// 用户主动刷新，滚动到今天
					this.ganttWrapper.scrollToToday();
				} else if (this.scrollLeftPosition === 0 && this.scrollTopPosition === 0) {
					// 首次加载（滚动位置为初始值），滚动到今天
					this.ganttWrapper.scrollToToday();
				} else {
					// 其他情况（如筛选、排序变更），恢复之前的滚动位置
					this.restoreScrollPosition();
				}
			}
			// 重置标志位
			this.shouldScrollToTodayOnRefresh = false;
			this.isRefreshing = false;

		} catch (error) {
			Logger.error('GanttView', 'Error rendering gantt:', error);
			this.isRefreshing = false;
			root.createEl('div', {
				text: i18n.t('views.ganttView.renderError') + (error as Error).message,
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
			text: i18n.t('views.ganttView.emptyTitle'),
			cls: 'gantt-empty-title'
		});

		const reasons: string[] = [];
		const state = this.getStatusFilterState();
		if (state.selectedStatuses.length > 0) {
			reasons.push(i18n.t('views.ganttView.currentFilter', { count: state.selectedStatuses.length }));
		}
		if (this.tagFilterState.selectedTags.length > 0) {
			reasons.push(i18n.t('views.ganttView.tagFilter', { tags: this.tagFilterState.selectedTags.join(', ') }));
		}
		if (!this.getStartField() || !this.getEndField()) {
			reasons.push(i18n.t('views.ganttView.missingFieldConfig'));
		}

		if (reasons.length > 0) {
			emptyState.createEl('p', {
				text: i18n.t('views.ganttView.possibleReasons') + reasons.join(', '),
				cls: 'gantt-empty-reason'
			});
		}

		emptyState.createEl('p', {
			text: i18n.t('views.ganttView.checkDatesHint'),
			cls: 'gantt-empty-hint'
		});
	}

	/**
	 * 处理任务点击事件
	 */
	private handleTaskClick(ganttTask: import('../gantt').GanttChartTask): void {
		if (this.updateHandler) {
			this.updateHandler.handleTaskClick(ganttTask, this.currentGlobalTasks);
		}
	}

	/**
	 * 处理日期变更事件（拖拽）
	 */
	private async handleDateChange(
		ganttTask: import('../gantt').GanttChartTask,
		start: Date,
		end: Date
	): Promise<void> {
		if (!this.updateHandler) return;

		// 验证日期变更
		if (!TaskUpdateHandler.validateDateChange(start, end)) {
			new Notice(i18n.t('views.ganttView.invalidDateRange'));
			return;
		}

		await this.updateHandler.handleDateChange(
			ganttTask,
			start,
			end,
			this.getStartField(),
			this.getEndField(),
			this.currentGlobalTasks
		);
	}

	/**
	 * 处理进度变更事件
	 */
	private async handleProgressChange(
		ganttTask: import('../gantt').GanttChartTask,
		progress: number
	): Promise<void> {
		if (!this.updateHandler) return;

		await this.updateHandler.handleProgressChange(
			ganttTask,
			progress,
			this.currentGlobalTasks
		);
	}

	/**
	 * 判断是否需要完整刷新
	 */
	private shouldFullRefresh(oldTasks: import('../gantt').GanttChartTask[], newTasks: import('../gantt').GanttChartTask[]): boolean {
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
