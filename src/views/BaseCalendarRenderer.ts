import { App, Notice } from 'obsidian';
import type { GanttTask } from '../types';
import { formatDate } from '../dateUtils/dateUtilsIndex';
import { openFileInExistingLeaf } from '../utils/fileOpener';
import { updateTaskCompletion } from '../tasks/taskUpdater';
import { getStatusColor, DEFAULT_TASK_STATUSES } from '../tasks/taskStatus';

/**
 * 日历渲染器基类
 * 提供子视图共享的工具方法和状态管理
 */
export abstract class BaseCalendarRenderer {
	protected app: App;
	protected plugin: any;
	protected domCleanups: Array<() => void> = [];

	constructor(app: App, plugin: any) {
		this.app = app;
		this.plugin = plugin;
	}

	/**
	 * 渲染视图内容 - 子类必须实现
	 */
	abstract render(container: HTMLElement, currentDate: Date): void;

	/**
	 * 清理任务描述中的元数据标记
	 */
	protected cleanTaskDescription(raw: string): string {
		let text = raw;
		// 移除 Tasks emoji 优先级标记
		text = text.replace(/\s*(🔺|⏫|🔼|🔽|⏬)\s*/g, ' ');
		// 移除 Tasks emoji 日期属性
		text = text.replace(/\s*(➕|🛫|⏳|📅|❌|✅)\s*\d{4}-\d{2}-\d{2}\s*/g, ' ');
		// 移除 Dataview [field:: value] 块
		text = text.replace(/\s*\[(priority|created|start|scheduled|due|cancelled|completion)::[^\]]+\]\s*/g, ' ');
		// 折叠多余空格
		text = text.replace(/\s{2,}/g, ' ').trim();
		return text;
	}

	/**
	 * 获取优先级图标
	 */
	protected getPriorityIcon(priority?: string): string {
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
	 * 获取任务状态颜色配置
	 * 从插件设置中读取状态颜色，如果未配置则使用默认值
	 */
	protected getStatusColors(task: GanttTask): { bg: string; text: string } | null {
		if (!task.status) return null;

		const taskStatuses = this.plugin?.settings?.taskStatuses || DEFAULT_TASK_STATUSES;
		return getStatusColor(task.status, taskStatuses) || null;
	}

	/**
	 * 应用状态颜色到任务元素
	 */
	protected applyStatusColors(task: GanttTask, element: HTMLElement): void {
		const colors = this.getStatusColors(task);
		if (colors) {
			element.style.setProperty('--task-bg-color', colors.bg);
			element.style.setProperty('--task-text-color', colors.text);
			element.addClass('task-with-status');
		}
	}

	/**
	 * 格式化日期显示
	 */
	protected formatDateForDisplay(date: Date): string {
		return formatDate(date, 'yyyy-MM-dd');
	}

	/**
	 * 注册 DOM 清理回调
	 */
	protected registerDomCleanup(fn: () => void): void {
		this.domCleanups.push(fn);
	}

	/**
	 * 执行所有 DOM 清理回调
	 */
	public runDomCleanups(): void {
		if (this.domCleanups.length === 0) return;
		for (const fn of this.domCleanups) {
			try {
				fn();
			} catch (err) {
				console.error('[BaseCalendarRenderer] Error during DOM cleanup', err);
			}
		}
		this.domCleanups = [];
	}

	/**
	 * 清理悬浮提示
	 */
	protected clearTaskTooltips(): void {
		const tooltips = document.querySelectorAll('.calendar-week-task-tooltip');
		tooltips.forEach(t => t.remove());
	}

	/**
	 * 渲染任务复选框（复用逻辑）
	 */
	protected createTaskCheckbox(task: GanttTask, taskItem: HTMLElement): HTMLInputElement {
		const checkbox = taskItem.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
		checkbox.checked = task.completed;
		checkbox.disabled = false;
		checkbox.addClass('gantt-task-checkbox');

		checkbox.addEventListener('change', async (e) => {
			e.stopPropagation();
			this.clearTaskTooltips();
			const isNowCompleted = checkbox.checked;
			try {
				await updateTaskCompletion(
					this.app,
					task,
					isNowCompleted,
					this.plugin.settings.enabledTaskFormats
				);
				taskItem.toggleClass('completed', isNowCompleted);
				taskItem.toggleClass('pending', !isNowCompleted);
			} catch (error) {
				console.error('Error updating task:', error);
				new Notice('更新任务失败');
				checkbox.checked = task.completed;
			}
		});

		checkbox.addEventListener('click', (e) => {
			e.stopPropagation();
		});

		return checkbox;
	}

	/**
	 * 创建任务悬浮提示
	 */
	protected createTaskTooltip(
		task: GanttTask,
		taskItem: HTMLElement,
		cleaned: string
	): void {
		let tooltip: HTMLElement | null = null;
		let hideTimeout: number | null = null;

		const showTooltip = (e: MouseEvent) => {
			if (hideTimeout) {
				window.clearTimeout(hideTimeout);
				hideTimeout = null;
			}

			if (tooltip) {
				tooltip.remove();
			}

			tooltip = document.body.createDiv('calendar-week-task-tooltip');
			tooltip.style.opacity = '0';

			// 任务描述
			const gf = (this.plugin?.settings?.globalTaskFilter || '').trim();
			const displayText = this.plugin?.settings?.showGlobalFilterInTaskText && gf ? `${gf} ${cleaned}` : cleaned;
			const descDiv = tooltip.createDiv('tooltip-description');
			descDiv.createEl('strong', { text: displayText });

			// 优先级
			if (task.priority) {
				const priorityDiv = tooltip.createDiv('tooltip-priority');
				const priorityIcon = this.getPriorityIcon(task.priority);
				priorityDiv.createEl('span', { text: `${priorityIcon} 优先级: ${task.priority}`, cls: `priority-${task.priority}` });
			}

			// 时间属性
			const hasTimeProperties = task.createdDate || task.startDate || task.scheduledDate ||
				task.dueDate || task.cancelledDate || task.completionDate;

			if (hasTimeProperties) {
				const timeDiv = tooltip.createDiv('tooltip-time-properties');

				if (task.createdDate) {
					timeDiv.createEl('div', { text: `➕ 创建: ${this.formatDateForDisplay(task.createdDate)}`, cls: 'tooltip-time-item' });
				}

				if (task.startDate) {
					timeDiv.createEl('div', { text: `🛫 开始: ${this.formatDateForDisplay(task.startDate)}`, cls: 'tooltip-time-item' });
				}

				if (task.scheduledDate) {
					timeDiv.createEl('div', { text: `⏳ 计划: ${this.formatDateForDisplay(task.scheduledDate)}`, cls: 'tooltip-time-item' });
				}

				if (task.dueDate) {
					const dueText = `📅 截止: ${this.formatDateForDisplay(task.dueDate)}`;
					const dueEl = timeDiv.createEl('div', { text: dueText, cls: 'tooltip-time-item' });
					if (task.dueDate < new Date() && !task.completed) {
						dueEl.addClass('tooltip-overdue');
					}
				}

				if (task.cancelledDate) {
					timeDiv.createEl('div', { text: `❌ 取消: ${this.formatDateForDisplay(task.cancelledDate)}`, cls: 'tooltip-time-item' });
				}

				if (task.completionDate) {
					timeDiv.createEl('div', { text: `✅ 完成: ${this.formatDateForDisplay(task.completionDate)}`, cls: 'tooltip-time-item' });
				}
			}

			// 文件位置
			const fileDiv = tooltip.createDiv('tooltip-file');
			fileDiv.createEl('span', { text: `📄 ${task.fileName}:${task.lineNumber}`, cls: 'tooltip-file-location' });

			// 定位悬浮提示
			const rect = taskItem.getBoundingClientRect();
			const tooltipWidth = 300;
			const tooltipHeight = tooltip.offsetHeight;

			let left = rect.right + 10;
			let top = rect.top;

			if (left + tooltipWidth > window.innerWidth) {
				left = rect.left - tooltipWidth - 10;
			}

			if (left < 0) {
				left = (window.innerWidth - tooltipWidth) / 2;
			}

			if (top + tooltipHeight > window.innerHeight) {
				top = window.innerHeight - tooltipHeight - 10;
			}
			if (top < 0) {
				top = 10;
			}

			tooltip.style.left = `${left}px`;
			tooltip.style.top = `${top}px`;

			setTimeout(() => {
				if (tooltip) {
					tooltip.style.opacity = '1';
					tooltip.addClass('tooltip-show');
				}
			}, 10);
		};

		const hideTooltip = () => {
			hideTimeout = window.setTimeout(() => {
				if (tooltip) {
					tooltip.removeClass('tooltip-show');
					tooltip.style.opacity = '0';

					setTimeout(() => {
						if (tooltip) {
							tooltip.remove();
							tooltip = null;
						}
					}, 200);
				}
			}, 100);
		};

		this.registerDomCleanup(() => {
			if (tooltip) {
				tooltip.remove();
				tooltip = null;
			}
			if (hideTimeout) {
				window.clearTimeout(hideTimeout);
				hideTimeout = null;
			}
		});

		taskItem.addEventListener('mouseenter', showTooltip);
		taskItem.addEventListener('mouseleave', hideTooltip);
	}

	/**
	 * 打开任务所在文件
	 */
	protected async openTaskFile(task: GanttTask): Promise<void> {
		await openFileInExistingLeaf(this.app, task.filePath, task.lineNumber);
	}

	/**
	 * 渲染任务描述为富文本（包含可点击的链接）
	 * 支持：
	 * - Obsidian 双向链接：[[note]] 或 [[note|alias]]
	 * - Markdown 链接：[text](url)
	 * - 网址链接：http://example.com 或 https://example.com
	 */
	protected renderTaskDescriptionWithLinks(container: HTMLElement, text: string): void {
		// 正则表达式模式
		const obsidianLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g; // [[note]] 或 [[note|alias]]
		const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;           // [text](url)
		const urlRegex = /(https?:\/\/[^\s<>"\)]+)/g;                    // http/https URL

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
				const notePath = m.groups[1]; // [[note]] 中的 note
				const displayText = m.groups[2] || notePath; // 优先使用别名
				const link = container.createEl('a', { text: displayText, cls: 'gantt-task-link obsidian-link' });
				link.setAttr('data-href', notePath);
				link.setAttr('title', `打开：${notePath}`);
				link.href = 'javascript:void(0)';
				link.addEventListener('click', async (e) => {
					e.preventDefault();
					e.stopPropagation();
					const file = this.app.metadataCache.getFirstLinkpathDest(notePath, '');
					if (file) {
						await openFileInExistingLeaf(this.app, file.path, 0);
					} else {
						new Notice(`文件未找到：${notePath}`);
					}
				});
			} else if (m.type === 'markdown') {
				const displayText = m.groups[1]; // [text]
				const url = m.groups[2]; // (url)
				const link = container.createEl('a', { text: displayText, cls: 'gantt-task-link markdown-link' });
				link.href = url;
				link.setAttr('target', '_blank');
				link.setAttr('rel', 'noopener noreferrer');
				link.setAttr('title', url);
				link.addEventListener('click', (e) => {
					e.stopPropagation();
				});
			} else if (m.type === 'url') {
				const url = m.groups[1]; // 完整URL
				const link = container.createEl('a', { text: url, cls: 'gantt-task-link url-link' });
				link.href = url;
				link.setAttr('target', '_blank');
				link.setAttr('rel', 'noopener noreferrer');
				link.setAttr('title', url);
				link.addEventListener('click', (e) => {
					e.stopPropagation();
				});
			}

			lastIndex = m.end;
		}

		// 添加剩余的普通文本
		if (lastIndex < text.length) {
			container.appendText(text.substring(lastIndex));
		}
	}
}
