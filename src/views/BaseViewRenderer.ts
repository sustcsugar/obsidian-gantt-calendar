import { App, Notice } from 'obsidian';
import type { GCTask } from '../types';
import { DEFAULT_TAG_FILTER_STATE, DEFAULT_STATUS_FILTER_STATE, type TagFilterState, type StatusFilterState } from '../types';
import { formatDate } from '../dateUtils/dateUtilsIndex';
import { openFileInExistingLeaf } from '../utils/fileOpener';
import { getStatusColor, DEFAULT_TASK_STATUSES, getStatusByKey } from '../tasks/taskStatus';
import type { TaskStatus } from '../tasks/taskStatus';
import { RegularExpressions } from '../utils/RegularExpressions';
import { Logger } from '../utils/logger';
import { TooltipClasses } from '../utils/bem';
import { LinkRenderer } from '../utils/linkRenderer';

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

	// 状态筛选状态
	protected statusFilterState: StatusFilterState = DEFAULT_STATUS_FILTER_STATE;

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
	 * 获取状态筛选状态
	 */
	public getStatusFilterState(): StatusFilterState {
		return this.statusFilterState;
	}

	/**
	 * 设置状态筛选状态
	 * 子类可重写此方法以实现持久化
	 */
	public setStatusFilterState(state: StatusFilterState): void {
		this.statusFilterState = state;
	}

	/**
	 * 从插件设置初始化筛选状态
	 * @param settingsPrefix 设置字段前缀（如 'taskView', 'dayView'）
	 */
	protected initializeFilterStates(settingsPrefix: string): void {
		const settings = this.plugin?.settings;
		if (!settings) return;

		// 加载状态筛选
		const savedStatuses = settings[`${settingsPrefix}SelectedStatuses`];
		if (savedStatuses !== undefined) {
			this.statusFilterState = { selectedStatuses: savedStatuses };
		}

		// 加载标签筛选
		const savedTags = settings[`${settingsPrefix}SelectedTags`];
		const savedOperator = settings[`${settingsPrefix}TagOperator`];
		if (savedTags !== undefined || savedOperator !== undefined) {
			this.tagFilterState = {
				selectedTags: savedTags || [],
				operator: savedOperator || 'OR'
			};
		}
	}

	/**
	 * 保存状态筛选到设置
	 */
	protected async saveStatusFilterState(settingsPrefix: string): Promise<void> {
		if (!this.plugin?.settings) return;
		this.plugin.settings[`${settingsPrefix}SelectedStatuses`] =
			this.statusFilterState.selectedStatuses;
		await this.plugin.saveSettings();
	}

	/**
	 * 保存标签筛选到设置
	 */
	protected async saveTagFilterState(settingsPrefix: string): Promise<void> {
		if (!this.plugin?.settings) return;
		this.plugin.settings[`${settingsPrefix}SelectedTags`] =
			this.tagFilterState.selectedTags;
		this.plugin.settings[`${settingsPrefix}TagOperator`] =
			this.tagFilterState.operator;
		await this.plugin.saveSettings();
	}

	/**
	 * 应用状态筛选到任务列表
	 * @param tasks 原始任务列表
	 * @returns 筛选后的任务列表
	 */
	protected applyStatusFilter(tasks: GCTask[]): GCTask[] {
		const { selectedStatuses } = this.statusFilterState;

		// 未选择任何状态，返回所有任务
		if (selectedStatuses.length === 0) return tasks;

		return tasks.filter(task => {
			const taskStatus = task.status || this.getInferredStatus(task);
			return selectedStatuses.includes(taskStatus);
		});
	}

	/**
	 * 推断任务状态（当任务没有明确的 status 字段时）
	 */
	private getInferredStatus(task: GCTask): string {
		if (task.completed) return 'done';
		if (task.cancelled) return 'canceled';
		return 'todo';
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

		// 将选中的标签转换为小写，用于大小写不敏感匹配
		const selectedTagsLower = selectedTags.map(tag => tag.toLowerCase());

		return tasks.filter(task => {
			// 任务没有标签
			if (!task.tags || task.tags.length === 0) {
				if (operator === 'NOT') {
					return true;  // NOT 模式：保留没有标签的任务
				} else {
					return false;  // AND/OR 模式：过滤掉没有标签的任务
				}
			}

			// 将任务标签转换为小写用于匹配
			const taskTagsLower = task.tags.map(tag => tag.toLowerCase());

			// AND 模式：任务必须包含所有选中标签
			if (operator === 'AND') {
				return selectedTagsLower.every(tag => taskTagsLower.includes(tag));
			}

			// OR 模式：任务包含任一选中标签即可
			if (operator === 'OR') {
				return selectedTagsLower.some(tag => taskTagsLower.includes(tag));
			}

			// NOT 模式：排除包含任一选中标签的任务
			if (operator === 'NOT') {
				return !selectedTagsLower.some(tag => taskTagsLower.includes(tag));
			}

			return false;
		});
	}

	/**
	 * 清理悬浮提示
	 */
	protected clearTaskTooltips(): void {
		const tooltips = document.querySelectorAll(`.${TooltipClasses.block}`);
		tooltips.forEach(t => t.remove());
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
		LinkRenderer.renderTaskDescriptionWithLinks(container, text, this.app);
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
