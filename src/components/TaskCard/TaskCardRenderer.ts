import { App } from 'obsidian';
import type { GCTask } from '../../types';
import type { TaskCardConfig, TimeFieldConfig } from './TaskCardConfig';
import { TaskCardClasses, TimeBadgeClasses } from '../../utils/bem';
import { registerTaskContextMenu } from '../../contextMenu/contextMenuIndex';
import { openFileInExistingLeaf } from '../../utils/fileOpener';
import { updateTaskCompletion } from '../../tasks/taskUpdater';
import { getStatusColor, DEFAULT_TASK_STATUSES, getCurrentThemeMode } from '../../tasks/taskStatus';
import { RegularExpressions } from '../../utils/RegularExpressions';
import { formatDate } from '../../dateUtils/dateUtilsIndex';
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
	private plugin: any;

	constructor(app: App, plugin: any) {
		this.app = app;
		this.plugin = plugin;
	}

	/**
	 * 格式化日期显示
	 */
	formatDateForDisplay(date: Date): string {
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

		checkbox.addEventListener('change', async (e) => {
			e.stopPropagation();
			const isNowCompleted = checkbox.checked;
			try {
				await updateTaskCompletion(
					this.app,
					task,
					isNowCompleted,
					this.plugin.settings.enabledTaskFormats
				);
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

		if (config.showCreated && task.createdDate) {
			this.renderTimeBadge(container, '创建', task.createdDate, TimeBadgeClasses.created);
		}
		if (config.showStart && task.startDate) {
			this.renderTimeBadge(container, '开始', task.startDate, TimeBadgeClasses.start);
		}
		if (config.showScheduled && task.scheduledDate) {
			this.renderTimeBadge(container, '计划', task.scheduledDate, TimeBadgeClasses.scheduled);
		}
		if (config.showDue && task.dueDate) {
			const isOverdue = config.showOverdueIndicator && task.dueDate < new Date() && !task.completed;
			this.renderTimeBadge(container, '截止', task.dueDate, TimeBadgeClasses.due, isOverdue);
		}
		if (config.showCancelled && task.cancelledDate) {
			this.renderTimeBadge(container, '取消', task.cancelledDate, TimeBadgeClasses.cancelled);
		}
		if (config.showCompletion && task.completionDate) {
			this.renderTimeBadge(container, '完成', task.completionDate, TimeBadgeClasses.completion);
		}
	}

	private renderTimeBadge(
		container: HTMLElement,
		label: string,
		date: Date,
		className: string,
		isOverdue = false
	): void {
		const badge = container.createEl('span', {
			text: `${label}:${this.formatDateForDisplay(date)}`,
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
			card.setAttribute('data-target-date', targetDate.toISOString().split('T')[0]);
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
