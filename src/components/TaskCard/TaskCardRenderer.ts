import { App } from 'obsidian';
import type { GCTask, IPluginContext } from '../../types';
import type { TaskCardConfig, TimeFieldConfig } from './TaskCardConfig';
import { TaskCardClasses, TimeBadgeClasses } from '../../utils/bem';
import { registerTaskContextMenu } from '../../contextMenu/contextMenuIndex';
import { i18n } from '../../i18n/i18n';
import { openFileInExistingLeaf } from '../../utils/fileOpener';
import { updateTaskCompletion } from '../../tasks/taskUpdater';
import { completeRecurringTask } from '../../tasks/recurringTaskCompleter';
import { isVirtualTask, getVirtualMetadata } from '../../tasks/virtualTaskGenerator';
import { getStatusColor, DEFAULT_TASK_STATUSES, getCurrentThemeMode } from '../../tasks/taskStatus';
import { RegularExpressions } from '../../utils/RegularExpressions';
import { formatDate } from '../../dateUtils/dateUtilsIndex';
import { toISOStringLocal } from '../../dateUtils/timezone';
import { TooltipManager } from '../../utils/tooltipManager';
import { Logger } from '../../utils/logger';
import { TagPill } from '../tagPill';
import { LinkRenderer } from '../../utils/linkRenderer';

/**
 * 任务卡片渲染器
 * 负责任务卡片各个子元素的渲染逻辑
 */
export class TaskCardRenderer {
	private app: App;
	private plugin: IPluginContext;

	constructor(app: App, plugin: IPluginContext) {
		this.app = app;
		this.plugin = plugin;
	}

	/**
	 * 格式化日期显示
	 */
	formatDateForDisplay(date: Date, precision?: 'day' | 'time'): string {
		if (precision === 'time') {
			return formatDate(date, 'yyyy-MM-dd HH:mm');
		}
		return formatDate(date, 'yyyy-MM-dd');
	}

	/**
	 * 获取优先级图标
	 */
	getPriorityIcon(priority?: string): string {
		switch (priority) {
			case 'highest': return '🔺';
			case 'high': return '⏫';
			case 'medium': return '🔼';
			case 'low': return '🔽';
			case 'lowest': return '⏬';
			default: return '';
		}
	}

	/**
	 * 获取优先级CSS类名
	 */
	getPriorityClass(priority?: string): string {
		switch (priority) {
			case 'highest': return 'priority-highest';
			case 'high': return 'priority-high';
			case 'medium': return 'priority-medium';
			case 'low': return 'priority-low';
			case 'lowest': return 'priority-lowest';
			default: return '';
		}
	}

	/**
	 * 获取任务状态颜色配置
	 */
	getStatusColors(task: GCTask): { bg: string; text: string } | null {
		if (!task.status) return null;
		const taskStatuses = this.plugin?.settings?.taskStatuses || DEFAULT_TASK_STATUSES;
		// 根据当前主题获取对应的颜色配置
		const themeMode = getCurrentThemeMode();
		return getStatusColor(task.status, taskStatuses, themeMode) || null;
	}

	/**
	 * 应用状态颜色到任务元素
	 */
	applyStatusColors(task: GCTask, element: HTMLElement): void {
		const colors = this.getStatusColors(task);
		if (colors) {
			element.style.setProperty('--task-bg-color', colors.bg);
			element.style.setProperty('--task-text-color', colors.text);
			element.addClass('task-with-status');
		}
	}

	/**
	 * 创建任务复选框
	 */
	createTaskCheckbox(task: GCTask, taskItem: HTMLElement): HTMLInputElement {
		const checkbox = taskItem.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
		checkbox.checked = task.completed;
		checkbox.disabled = false;
		checkbox.addClass(TaskCardClasses.elements.checkbox);

		// 虚拟任务的 checkbox：点击跳转到源任务
		if (isVirtualTask(task)) {
			checkbox.addEventListener('click', async (e) => {
				e.stopPropagation();
				e.preventDefault();
				// 导航到源任务文件
				const meta = getVirtualMetadata(task);
				if (meta) {
					const [filePath, lineStr] = meta.sourceTaskId.split(':');
					const lineNumber = parseInt(lineStr);
					await openFileInExistingLeaf(this.app, filePath, lineNumber);
				}
				checkbox.checked = false; // 还原 checkbox
			});
			return checkbox;
		}

		// 周期性真实任务的 checkbox：完成时创建下一个周期任务
		checkbox.addEventListener('change', async (e) => {
			e.stopPropagation();
			const isNowCompleted = checkbox.checked;
			try {
				if (isNowCompleted && task.repeat) {
					// 周期任务完成流程
					const dateField = this.plugin.settings.dateFilterField || 'dueDate';
					await completeRecurringTask(
						this.app,
						task,
						this.plugin.settings.enabledTaskFormats,
						dateField
					);
				} else {
					// 普通完成流程
					await updateTaskCompletion(
						this.app,
						task,
						isNowCompleted,
						this.plugin.settings.enabledTaskFormats
					);
				}
				taskItem.toggleClass(TaskCardClasses.modifiers.completed, isNowCompleted);
				taskItem.toggleClass(TaskCardClasses.modifiers.pending, !isNowCompleted);
			} catch (error) {
				Logger.error('TaskCardRenderer', 'Error updating task:', error);
				checkbox.checked = task.completed;
			}
		});

		checkbox.addEventListener('click', (e) => {
			e.stopPropagation();
		});

		return checkbox;
	}

	/**
	 * 渲染任务描述
	 */
	renderDescription(card: HTMLElement, task: GCTask, config: TaskCardConfig): void {
		if (!config.showDescription) return;

		const cleaned = task.description;
		const gf = (this.plugin?.settings?.globalTaskFilter || '').trim();

		const taskTextEl = card.createDiv(TaskCardClasses.elements.text);

		// 应用最大行数限制
		if (config.maxLines) {
			taskTextEl.style.setProperty('--max-lines', String(config.maxLines));
			taskTextEl.addClass('gc-task-card__text--limited');
		}

		// 使用用户设置 showGlobalFilterInTaskText 控制是否显示全局过滤词
		if (this.plugin?.settings?.showGlobalFilterInTaskText && gf) {
			taskTextEl.appendText(gf + ' ');
		}

		this.renderTaskDescriptionWithLinks(taskTextEl, cleaned);
	}

	/**
	 * 渲染任务 ticktick（%%content%%）
	 */
	renderTicktick(card: HTMLElement, task: GCTask): void {
		if (!task.ticktick) return;

		const ticktickEl = card.createDiv(TaskCardClasses.elements.ticktick);
		ticktickEl.setText(task.ticktick);
	}

	/**
	 * 渲染结构化元数据字段（%%[key::value]%%）
	 */
	renderMetadataFields(card: HTMLElement, task: GCTask): void {
		if (!task.metadataFields || task.metadataFields.length === 0) return;

		const container = card.createDiv('gc-task-card__metadata');
		for (const field of task.metadataFields) {
			const itemEl = container.createDiv('gc-task-card__metadata-item');
			const keyEl = itemEl.createEl('span', { cls: 'gc-task-card__metadata-key' });
			keyEl.setText(`${field.key}:`);
			const valueEl = itemEl.createEl('span', { cls: 'gc-task-card__metadata-value' });
			valueEl.setText(field.value || '(空)');
		}
	}

	/**
	 * 渲染周期指示器（🔁 小图标）
	 */
	renderRepeatIndicator(card: HTMLElement): void {
		const indicator = card.createEl('span', {
			cls: TaskCardClasses.elements.repeatIndicator,
		});
		indicator.setText('🔁');
	}

	/**
	 * 渲染任务描述为富文本（包含可点击的链接）
	 */
	private renderTaskDescriptionWithLinks(container: HTMLElement, text: string): void {
		LinkRenderer.renderTaskDescriptionWithLinks(container, text, this.app);
	}

	/**
	 * 渲染任务标签
	 */
	renderTaskTags(task: GCTask, container: HTMLElement): void {
		if (!task.tags || task.tags.length === 0) {
			return;
		}

		const tagsContainer = container.createDiv('gc-task-card__tags');

		// 使用 TagPill 组件创建标签
		TagPill.createMultiple(task.tags, tagsContainer, {
			showHash: true,
		});
	}

	/**
	 * 渲染优先级
	 */
	renderPriority(card: HTMLElement, task: GCTask): void {
		if (!task.priority) return;

		const priorityIcon = this.getPriorityIcon(task.priority);
		const priorityEl = card.createDiv(TaskCardClasses.elements.priority);
		const priorityClass = this.getPriorityClass(task.priority);
		priorityEl.createEl('span', {
			text: priorityIcon,
			cls: `${TaskCardClasses.elements.priorityBadge} ${priorityClass}`
		});
	}

	/**
	 * 渲染时间字段
	 */
	renderTimeFields(card: HTMLElement, task: GCTask, config?: TimeFieldConfig): void {
		if (!config) return;

		const container = card.createDiv(TaskCardClasses.elements.times);

		const dp = task.datePrecision || {};
		if (config.showCreated && task.createdDate) {
			this.renderTimeBadge(container, i18n.t('taskCard.created'), task.createdDate, TimeBadgeClasses.created, false, dp.createdDate);
		}
		if (config.showStart && task.startDate) {
			this.renderTimeBadge(container, i18n.t('taskCard.start'), task.startDate, TimeBadgeClasses.start, false, dp.startDate);
		}
		if (config.showScheduled && task.scheduledDate) {
			this.renderTimeBadge(container, i18n.t('taskCard.scheduled'), task.scheduledDate, TimeBadgeClasses.scheduled, false, dp.scheduledDate);
		}
		if (config.showDue && task.dueDate) {
			const isOverdue = config.showOverdueIndicator && task.dueDate < new Date() && !task.completed;
			this.renderTimeBadge(container, i18n.t('taskCard.due'), task.dueDate, TimeBadgeClasses.due, isOverdue, dp.dueDate);
		}
		if (config.showCancelled && task.cancelledDate) {
			this.renderTimeBadge(container, i18n.t('taskCard.cancelled'), task.cancelledDate, TimeBadgeClasses.cancelled, false, dp.cancelledDate);
		}
		if (config.showCompletion && task.completionDate) {
			this.renderTimeBadge(container, i18n.t('taskCard.done'), task.completionDate, TimeBadgeClasses.completion, false, dp.completionDate);
		}
	}

	private renderTimeBadge(
		container: HTMLElement,
		label: string,
		date: Date,
		className: string,
		isOverdue = false,
		precision?: 'day' | 'time'
	): void {
		const badge = container.createEl('span', {
			text: `${label}:${this.formatDateForDisplay(date, precision)}`,
			cls: `${TaskCardClasses.elements.timeBadge} ${className}`
		});
		if (isOverdue) {
			badge.addClass(TimeBadgeClasses.overdue);
		}
		container.appendChild(badge);
	}

	/**
	 * 渲染文件位置
	 */
	renderFileLocation(card: HTMLElement, task: GCTask): void {
		card.createEl('span', {
			text: `${task.fileName}:${task.lineNumber}`,
			cls: TaskCardClasses.elements.file
		});
	}

	/**
	 * 渲染警告图标
	 */
	renderWarning(card: HTMLElement, task: GCTask): void {
		if (!task.warning) return;

		card.createEl('span', {
			text: '⚠️',
			cls: TaskCardClasses.elements.warning,
			attr: { title: task.warning }
		});
	}

	/**
	 * 打开任务所在文件
	 */
	async openTaskFile(task: GCTask): Promise<void> {
		await openFileInExistingLeaf(this.app, task.filePath, task.lineNumber);
	}

	/**
	 * 附加悬浮提示（使用 TooltipManager 单例复用）
	 */
	attachTooltip(card: HTMLElement, task: GCTask): void {
		// 获取 TooltipManager 单例
		const tooltipManager = TooltipManager.getInstance(this.plugin);

		card.addEventListener('mouseenter', () => {
			tooltipManager.show(task, card);
		});

		card.addEventListener('mouseleave', () => {
			tooltipManager.hide();
		});
	}

	/**
	 * 附加拖拽行为
	 */
	attachDragBehavior(card: HTMLElement, task: GCTask, targetDate?: Date): void {
		card.draggable = true;
		card.setAttribute('data-task-id', `${task.filePath}:${task.lineNumber}`);

		if (targetDate) {
			card.setAttribute('data-target-date', toISOStringLocal(targetDate));
		}

		// 获取 TooltipManager 单例
		const tooltipManager = TooltipManager.getInstance(this.plugin);

		card.addEventListener('dragstart', (e: DragEvent) => {
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('taskId', `${task.filePath}:${task.lineNumber}`);
				card.style.opacity = '0.6';

				// 拖动时取消悬浮窗
				tooltipManager.cancel();
			}
		});

		card.addEventListener('dragend', () => {
			card.style.opacity = '1';
		});
	}

	/**
	 * 附加右键菜单
	 */
	attachContextMenu(
		card: HTMLElement,
		task: GCTask,
		onRefresh?: () => void
	): void {
		const enabledFormats = this.plugin.settings.enabledTaskFormats || ['tasks'];
		const taskNotePath = this.plugin.settings.taskNotePath || 'Tasks';

		// 获取 TooltipManager 单例
		const tooltipManager = TooltipManager.getInstance(this.plugin);

		// 右键菜单打开时隐藏悬浮窗
		card.addEventListener('contextmenu', () => {
			tooltipManager.cancel();
		});

		registerTaskContextMenu(
			card,
			task,
			this.app,
			enabledFormats,
			taskNotePath,
			onRefresh || (() => {})
		);
	}
}
