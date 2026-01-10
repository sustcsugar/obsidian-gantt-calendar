import { App, Notice } from 'obsidian';
import type { GCTask } from '../types';
import { DEFAULT_TAG_FILTER_STATE, type TagFilterState } from '../types';
import { formatDate } from '../dateUtils/dateUtilsIndex';
import { openFileInExistingLeaf } from '../utils/fileOpener';
import { updateTaskCompletion } from '../tasks/taskUpdater';
import { getStatusColor, DEFAULT_TASK_STATUSES, getStatusByKey } from '../tasks/taskStatus';
import type { TaskStatus } from '../tasks/taskStatus';
import { RegularExpressions } from '../utils/RegularExpressions';
import { Logger } from '../utils/logger';

/**
 * 日历渲染器基类
 * 提供子视图共享的工具方法和状态管理
 */
export abstract class BaseViewRenderer {
	protected app: App;
	protected plugin: any;
	protected domCleanups: Array<() => void> = [];

	// 标签筛选状态
	protected tagFilterState: TagFilterState = DEFAULT_TAG_FILTER_STATE;

	constructor(app: App, plugin: any) {
		this.app = app;
		this.plugin = plugin;
	}

	/**
	 * 渲染视图内容 - 子类必须实现
	 */
	abstract render(container: HTMLElement, currentDate: Date): void;

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
	 * 获取优先级CSS类名
	 */
	protected getPriorityClass(priority?: string): string {
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
	 * 从插件设置中读取状态颜色，如果未配置则使用默认值
	 */
	protected getStatusColors(task: GCTask): { bg: string; text: string } | null {
		if (!task.status) return null;

		const taskStatuses = this.plugin?.settings?.taskStatuses || DEFAULT_TASK_STATUSES;
		return getStatusColor(task.status, taskStatuses) || null;
	}

	/**
	 * 应用状态颜色到任务元素
	 */
	protected applyStatusColors(task: GCTask, element: HTMLElement): void {
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
				Logger.error('BaseViewRenderer', 'Error during DOM cleanup', err);
			}
		}
		this.domCleanups = [];
	}

	/**
	 * 获取标签筛选状态
	 */
	public getTagFilterState(): TagFilterState {
		return this.tagFilterState;
	}

	/**
	 * 设置标签筛选状态
	 */
	public setTagFilterState(state: TagFilterState): void {
		this.tagFilterState = state;
	}

	/**
	 * 应用标签筛选到任务列表
	 * @param tasks 原始任务列表
	 * @returns 筛选后的任务列表
	 */
	protected applyTagFilter(tasks: GCTask[]): GCTask[] {
		const { selectedTags, operator } = this.tagFilterState;

		// 无筛选条件，返回全部
		if (selectedTags.length === 0) {
			return tasks;
		}

		return tasks.filter(task => {
			// 任务没有标签
			if (!task.tags || task.tags.length === 0) {
				return false;
			}

			// AND 模式：任务必须包含所有选中标签
			if (operator === 'AND') {
				return selectedTags.every(tag => task.tags!.includes(tag));
			}

			// OR 模式：任务包含任一选中标签即可
			if (operator === 'OR') {
				return selectedTags.some(tag => task.tags!.includes(tag));
			}

			return false;
		});
	}

	/**
	 * 清理悬浮提示
	 */
	protected clearTaskTooltips(): void {
		const tooltips = document.querySelectorAll('.calendar-week-task-tooltip, .gc-task-tooltip');
		tooltips.forEach(t => t.remove());
	}

	/**
	 * 渲染任务复选框（复用逻辑）
	 */
	protected createTaskCheckbox(task: GCTask, taskItem: HTMLElement): HTMLInputElement {
		const checkbox = taskItem.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
		checkbox.checked = task.completed;
		checkbox.disabled = false;
		checkbox.addClass('gc-task-card__checkbox');

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
				Logger.error('BaseViewRenderer', 'Error updating task:', error);
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
	 * 打开任务所在文件
	 */
	protected async openTaskFile(task: GCTask): Promise<void> {
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
		// 从统一正则入口获取链接正则表达式
		const obsidianLinkRegex = RegularExpressions.Links.obsidianLinkRegex;
		const markdownLinkRegex = RegularExpressions.Links.markdownLinkRegex;
		const urlRegex = RegularExpressions.Links.urlLinkRegex;

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
				const link = container.createEl('a', { text: displayText, cls: 'gc-link gc-link--obsidian' });
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
				const link = container.createEl('a', { text: displayText, cls: 'gc-link gc-link--markdown' });
				link.href = url;
				link.setAttr('target', '_blank');
				link.setAttr('rel', 'noopener noreferrer');
				link.setAttr('title', url);
				link.addEventListener('click', (e) => {
					e.stopPropagation();
				});
			} else if (m.type === 'url') {
				const url = m.groups[1]; // 完整URL
				const link = container.createEl('a', { text: url, cls: 'gc-link gc-link--url' });
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

	/**
	 * 渲染任务标签
	 * 创建独立的标签卡片元素
	 * @param task - 任务对象
	 * @param container - 容器元素
	 */
	protected renderTaskTags(task: GCTask, container: HTMLElement): void {
		if (!task.tags || task.tags.length === 0) {
			return;
		}

		const tagsContainer = container.createDiv('gc-task-card__tags');

		task.tags.forEach(tag => {
			const tagEl = tagsContainer.createEl('span', {
				text: `#${tag}`,
				cls: 'gc-tag'
			});

			// 为不同标签分配不同颜色（基于hash）
			const colorIndex = this.getStringHashCode(tag) % 6;
			tagEl.addClass(`gc-tag--color-${colorIndex}`);
		});
	}

	/**
	 * 计算字符串的哈希值（用于标签颜色分配）
	 * @param str - 输入字符串
	 * @returns 哈希值（绝对值）
	 */
	private getStringHashCode(str: string): number {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			hash = ((hash << 5) - hash) + str.charCodeAt(i);
			hash = hash & hash; // Convert to 32bit integer
		}
		return Math.abs(hash);
	}
}
