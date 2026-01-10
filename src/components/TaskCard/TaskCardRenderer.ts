import { App } from 'obsidian';
import type { GCTask } from '../../types';
import type { TaskCardConfig, TimeFieldConfig } from './TaskCardConfig';
import { TaskCardClasses, TimeBadgeClasses, TagClasses } from '../../utils/bem';
import { registerTaskContextMenu } from '../../contextMenu/contextMenuIndex';
import { openFileInExistingLeaf } from '../../utils/fileOpener';
import { updateTaskCompletion } from '../../tasks/taskUpdater';
import { getStatusColor, DEFAULT_TASK_STATUSES } from '../../tasks/taskStatus';
import { RegularExpressions } from '../../utils/RegularExpressions';
import { formatDate } from '../../dateUtils/dateUtilsIndex';
import { TooltipManager } from '../../utils/tooltipManager';

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
		// 简化的颜色获取逻辑
		return getStatusColor(task.status, taskStatuses) || null;
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
		checkbox.addClass('gc-task-card__checkbox');

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
				taskItem.toggleClass('gc-task-card--completed', isNowCompleted);
				taskItem.toggleClass('gc-task-card--pending', !isNowCompleted);
			} catch (error) {
				console.error('Error updating task:', error);
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
		const obsidianLinkRegex = RegularExpressions.Links.obsidianLinkRegex;
		const markdownLinkRegex = RegularExpressions.Links.markdownLinkRegex;
		const urlLinkRegex = RegularExpressions.Links.urlLinkRegex;

		let lastIndex = 0;
		const matches: Array<{ type: 'obsidian' | 'markdown' | 'url'; start: number; end: number; groups: RegExpExecArray }> = [];

		// 收集所有匹配
		let match;
		const textLower = text;

		while ((match = obsidianLinkRegex.exec(textLower)) !== null) {
			matches.push({ type: 'obsidian', start: match.index, end: match.index + match[0].length, groups: match });
		}
		while ((match = markdownLinkRegex.exec(textLower)) !== null) {
			matches.push({ type: 'markdown', start: match.index, end: match.index + match[0].length, groups: match });
		}
		while ((match = urlLinkRegex.exec(textLower)) !== null) {
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
			if (m.start > lastIndex) {
				container.appendText(text.substring(lastIndex, m.start));
			}

			if (m.type === 'obsidian') {
				const notePath = m.groups[1];
				const displayText = m.groups[2] || notePath;
				const link = container.createEl('a', { text: displayText, cls: 'gc-link gc-link--obsidian' });
				link.setAttr('data-href', notePath);
				link.href = 'javascript:void(0)';
				link.addEventListener('click', async (e) => {
					e.preventDefault();
					e.stopPropagation();
					const file = this.app.metadataCache.getFirstLinkpathDest(notePath, '');
					if (file) {
						await openFileInExistingLeaf(this.app, file.path, 0);
					}
				});
			} else if (m.type === 'markdown') {
				const displayText = m.groups[1];
				const url = m.groups[2];
				const link = container.createEl('a', { text: displayText, cls: 'gc-link gc-link--markdown' });
				link.href = url;
				link.setAttr('target', '_blank');
				link.addEventListener('click', (e) => e.stopPropagation());
			} else if (m.type === 'url') {
				const url = m.groups[1];
				const link = container.createEl('a', { text: url, cls: 'gc-link gc-link--url' });
				link.href = url;
				link.setAttr('target', '_blank');
				link.addEventListener('click', (e) => e.stopPropagation());
			}

			lastIndex = m.end;
		}

		if (lastIndex < text.length) {
			container.appendText(text.substring(lastIndex));
		}
	}

	/**
	 * 渲染任务标签
	 */
	renderTaskTags(task: GCTask, container: HTMLElement): void {
		if (!task.tags || task.tags.length === 0) {
			return;
		}

		const tagsContainer = container.createDiv('gc-task-card__tags');

		task.tags.forEach(tag => {
			const tagEl = tagsContainer.createEl('span', {
				text: `#${tag}`,
				cls: 'gc-tag'
			});

			const colorIndex = this.getStringHashCode(tag) % 6;
			tagEl.addClass(`gc-tag--color-${colorIndex}`);
		});
	}

	private getStringHashCode(str: string): number {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			hash = ((hash << 5) - hash) + str.charCodeAt(i);
			hash = hash & hash;
		}
		return Math.abs(hash);
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

		card.addEventListener('dragstart', (e: DragEvent) => {
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('taskId', `${task.filePath}:${task.lineNumber}`);
				card.style.opacity = '0.6';
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
