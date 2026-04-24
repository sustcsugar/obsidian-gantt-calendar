import type { GCTask } from '../types';
import { formatDate } from '../dateUtils/dateUtilsIndex';
import { TagPill } from '../components/tagPill';

interface TooltipConfig {
	showDelay?: number;
	hideDelay?: number;
}

interface TooltipPosition {
	left: number;
	top: number;
}

export interface MousePosition {
	x: number;
	y: number;
}

/**
 * Tooltip 单例管理器
 * 全局共享一个 tooltip 元素，避免频繁创建/销毁 DOM
 *
 * 性能优化：
 * - 只创建一个 tooltip DOM 元素
 * - 复用子元素，只更新内容
 * - 使用估算高度避免 offsetHeight 触发重排
 */
export class TooltipManager {
	private static instance: TooltipManager | null = null;
	private tooltip: HTMLElement | null = null;
	private currentCard: HTMLElement | null = null;
	private currentTask: GCTask | null = null;
	private mousePosition: MousePosition | null = null;  // 鼠标位置（用于跟随鼠标）

	private showTimeout: number | null = null;
	private hideTimeout: number | null = null;

	private readonly config: Required<TooltipConfig>;

	// DOM 元素缓存（避免重复查询和创建）
	private cachedElements: {
		description?: HTMLElement;
		priority?: HTMLElement;
		ticktick?: HTMLElement;
		times?: HTMLElement;
		tags?: HTMLElement;
		file?: HTMLElement;
	} = {};

	private constructor(private plugin: any, config: TooltipConfig = {}) {
		this.config = {
			showDelay: config.showDelay ?? 400,
			hideDelay: config.hideDelay ?? 100
		};
	}

	/**
	 * 获取单例实例
	 */
	static getInstance(plugin: any, config?: TooltipConfig): TooltipManager {
		if (!TooltipManager.instance) {
			TooltipManager.instance = new TooltipManager(plugin, config);
		}
		return TooltipManager.instance;
	}

	/**
	 * 初始化 tooltip（懒加载，首次使用时创建）
	 */
	private ensureTooltip(): HTMLElement {
		// 检查tooltip是否存在且在DOM树中（修复bug: 避免复用已失效的DOM引用）
		if (!this.tooltip || !document.body.contains(this.tooltip)) {
			this.tooltip = document.body.createDiv('gc-task-tooltip');
			this.tooltip.style.opacity = '0';

			// 预创建所有子元素（只创建一次）
			this.cachedElements.description = this.tooltip.createDiv('gc-task-tooltip__description');
			this.cachedElements.priority = this.tooltip.createDiv('gc-task-tooltip__priority');
			this.cachedElements.ticktick = this.tooltip.createDiv('gc-task-tooltip__ticktick');
			this.cachedElements.times = this.tooltip.createDiv('gc-task-tooltip__times');
			this.cachedElements.tags = this.tooltip.createDiv('gc-task-tooltip__tags');
			this.cachedElements.file = this.tooltip.createDiv('gc-task-tooltip__file');

			// 初始隐藏部分元素
			this.cachedElements.priority.style.display = 'none';
			this.cachedElements.ticktick.style.display = 'none';
			this.cachedElements.times.style.display = 'none';
			this.cachedElements.tags.style.display = 'none';

			// 设置初始样式类
			this.tooltip.addClass('gc-task-tooltip--initialized');
		}
		return this.tooltip;
	}

	/**
	 * 显示 tooltip
	 * @param task - 任务数据
	 * @param card - 触发元素
	 * @param mousePosition - 鼠标位置（可选，用于跟随鼠标）
	 */
	show(task: GCTask, card: HTMLElement, mousePosition?: MousePosition): void {
		// 取消隐藏定时器
		if (this.hideTimeout) {
			window.clearTimeout(this.hideTimeout);
			this.hideTimeout = null;
		}

		// 保存鼠标位置
		this.mousePosition = mousePosition || null;

		// 如果是同一个任务，检查tooltip是否已显示
		if (this.currentTask === task && this.currentCard === card) {
			// 检查tooltip是否可见（修复bug: 同一任务重复悬停不显示）
			const isVisible = this.tooltip &&
							 this.tooltip.classList.contains('gc-task-tooltip--visible') &&
							 this.tooltip.style.opacity !== '0';

			if (isVisible) {
				// tooltip已显示，只更新位置
				this.updatePosition(card);
				return;
			}
			// 如果tooltip不可见，继续执行显示逻辑
		}

		// 如果切换到不同的任务/卡片，且当前tooltip已显示，先立即隐藏
		const isDifferentTask = this.currentTask !== task || this.currentCard !== card;
		const isVisible = this.tooltip &&
						 this.tooltip.classList.contains('gc-task-tooltip--visible') &&
						 this.tooltip.style.opacity !== '0';

		if (isDifferentTask && isVisible) {
			// 立即隐藏当前tooltip（不使用延迟）
			if (this.tooltip) {
				this.tooltip.removeClass('gc-task-tooltip--visible');
				this.tooltip.style.opacity = '0';
			}
		}

		// 保存当前状态
		this.currentTask = task;
		this.currentCard = card;

		// 使用显示延迟（可选）
		if (this.config.showDelay > 0) {
			if (this.showTimeout) {
				window.clearTimeout(this.showTimeout);
			}
			this.showTimeout = window.setTimeout(() => {
				this.showInternal(task, card);
			}, this.config.showDelay);
		} else {
			this.showInternal(task, card);
		}
	}

	/**
	 * 内部显示逻辑
	 */
	private showInternal(task: GCTask, card: HTMLElement): void {
		const tooltip = this.ensureTooltip();

		// 更新内容（复用现有元素）
		this.updateContent(task);

		// 更新位置
		this.updatePosition(card);

		// 显示
		tooltip.style.opacity = '1';
		tooltip.addClass('gc-task-tooltip--visible');
	}

	/**
	 * 更新 tooltip 内容
	 */
	private updateContent(task: GCTask): void {
		if (!this.cachedElements.description) return;

		// 更新描述
		const displayText = task.description || '';
		this.cachedElements.description.empty();
		const strongEl = this.cachedElements.description.createEl('strong');
		strongEl.setText(displayText);

		// 更新优先级
		if (task.priority && this.cachedElements.priority) {
			const priorityIcon = this.getPriorityIcon(task.priority);
			this.cachedElements.priority.empty();
			const spanEl = this.cachedElements.priority.createEl('span', { cls: `priority-${task.priority}` });
			spanEl.setText(`${priorityIcon} 优先级: ${task.priority}`);
			this.cachedElements.priority.style.display = '';
		} else if (this.cachedElements.priority) {
			this.cachedElements.priority.style.display = 'none';
		}

		// 更新 ticktick
		if (task.ticktick && this.cachedElements.ticktick) {
			this.cachedElements.ticktick.empty();
			this.cachedElements.ticktick.setText(task.ticktick);
			this.cachedElements.ticktick.style.display = '';
		} else if (this.cachedElements.ticktick) {
			this.cachedElements.ticktick.style.display = 'none';
		}

		// 更新时间属性
		if (this.cachedElements.times) {
			const hasTimeProperties = task.createdDate || task.startDate || task.scheduledDate ||
				task.dueDate || task.cancelledDate || task.completionDate;

			if (hasTimeProperties || task.repeat) {
				this.cachedElements.times.empty();

				if (task.createdDate) {
					this.createTimeItem(this.cachedElements.times, '➕ 创建:', formatDate(task.createdDate, task.datePrecision?.createdDate === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd'));
				}
				if (task.startDate) {
					this.createTimeItem(this.cachedElements.times, '🛫 开始:', formatDate(task.startDate, 'yyyy-MM-dd'));
				}
				if (task.scheduledDate) {
					this.createTimeItem(this.cachedElements.times, '⏳ 计划:', formatDate(task.scheduledDate, task.datePrecision?.scheduledDate === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd'));
				}
				if (task.dueDate) {
					const isOverdue = task.dueDate < new Date() && !task.completed;
					const cls = isOverdue ? 'gc-task-tooltip__time-item gc-task-tooltip__time-item--overdue' : 'gc-task-tooltip__time-item';
					const div = this.cachedElements.times.createDiv(cls);
					div.setText(`📅 截止: ${formatDate(task.dueDate, 'yyyy-MM-dd')}`);
				}
				if (task.cancelledDate) {
					this.createTimeItem(this.cachedElements.times, '❌ 取消:', formatDate(task.cancelledDate, task.datePrecision?.cancelledDate === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd'));
				}
				if (task.completionDate) {
					this.createTimeItem(this.cachedElements.times, '✅ 完成:', formatDate(task.completionDate, task.datePrecision?.completionDate === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd'));
				}

				// 周期任务显示
				if (task.repeat) {
					const div = this.cachedElements.times.createDiv('gc-task-tooltip__time-item gc-task-tooltip__repeat');
					div.setText(`🔁 重复: ${task.repeat}`);
				}

				this.cachedElements.times.style.display = '';
			} else {
				this.cachedElements.times.style.display = 'none';
			}
		}

		// 更新标签
		if (this.cachedElements.tags) {
			if (task.tags && task.tags.length > 0) {
				this.cachedElements.tags.empty();
				const labelEl = this.cachedElements.tags.createEl('span', { cls: 'gc-task-tooltip__label' });
				labelEl.setText('标签：');

				// 使用 TagPill 组件创建标签元素
				const tagsContainer = this.cachedElements.tags.createDiv();
				tagsContainer.style.display = 'flex';
				tagsContainer.style.flexDirection = 'row';
				tagsContainer.style.alignItems = 'center';
				tagsContainer.style.gap = '6px';
				tagsContainer.style.flexWrap = 'wrap';

				TagPill.createMultiple(task.tags, tagsContainer, {
					showHash: true,
				});

				this.cachedElements.tags.style.display = '';
			} else {
				this.cachedElements.tags.style.display = 'none';
			}
		}

		// 更新文件位置
		if (this.cachedElements.file) {
			this.cachedElements.file.empty();
			const locationEl = this.cachedElements.file.createEl('span', { cls: 'gc-task-tooltip__file-location' });
			locationEl.setText(`📄 ${task.fileName}:${task.lineNumber}`);
		}
	}

	/**
	 * 创建时间项
	 */
	private createTimeItem(container: HTMLElement, label: string, value: string): void {
		const div = container.createDiv('gc-task-tooltip__time-item');
		div.setText(`${label} ${value}`);
	}

	/**
	 * 更新 tooltip 位置
	 */
	private updatePosition(card: HTMLElement): void {
		if (!this.tooltip) return;

		const tooltipWidth = 300;
		const tooltipHeight = this.estimateTooltipHeight();

		let left: number;
		let top: number;

		// 如果有鼠标位置，使用鼠标位置；否则使用元素位置
		if (this.mousePosition) {
			// 跟随鼠标：显示在鼠标右下方，间距 15px
			left = this.mousePosition.x + 15;
			top = this.mousePosition.y + 15;
		} else {
			// 默认：显示在元素右侧
			const rect = card.getBoundingClientRect();
			left = rect.right + 10;
			top = rect.top;
		}

		// 边界检测
		if (left + tooltipWidth > window.innerWidth) {
			// 右侧空间不够，显示在卡片左侧
			if (this.mousePosition) {
				left = this.mousePosition.x - tooltipWidth - 15;
			} else {
				// tooltip右边缘对齐卡片左边缘，留10px间距
				const rect = card.getBoundingClientRect();
				left = rect.left - tooltipWidth - 10;
			}
		}
		if (left < 10) {
			left = 10;
		}
		if (top + tooltipHeight > window.innerHeight) {
			// 下方空间不够，向上调整
			if (this.mousePosition) {
				top = this.mousePosition.y - tooltipHeight - 15;
			} else {
				top = window.innerHeight - tooltipHeight - 10;
			}
		}
		if (top < 10) {
			top = 10;
		}

		this.tooltip.style.left = `${left}px`;
		this.tooltip.style.top = `${top}px`;
	}

	/**
	 * 估算 tooltip 高度（避免读取 offsetHeight）
	 */
	private estimateTooltipHeight(): number {
		if (!this.currentTask) return 150;

		// 基于内容估算高度
		let height = 60; // 基础高度（描述 + 文件）

		if (this.currentTask.priority) height += 30;
		if (this.currentTask.ticktick) height += 25;
		if (this.currentTask.createdDate) height += 20;
		if (this.currentTask.startDate) height += 20;
		if (this.currentTask.scheduledDate) height += 20;
		if (this.currentTask.dueDate) height += 20;
		if (this.currentTask.cancelledDate) height += 20;
		if (this.currentTask.completionDate) height += 20;
		if (this.currentTask.repeat) height += 20;
		if (this.currentTask.tags && this.currentTask.tags.length > 0) height += 30;

		return Math.min(height, 400); // 最大高度限制
	}

	/**
	 * 取消悬浮窗显示（用于拖动等操作）
	 * - 取消显示定时器
	 * - 取消隐藏定时器
	 * - 立即隐藏已显示的悬浮窗
	 */
	cancel(): void {
		// 取消显示定时器
		if (this.showTimeout) {
			window.clearTimeout(this.showTimeout);
			this.showTimeout = null;
		}

		// 取消隐藏定时器
		if (this.hideTimeout) {
			window.clearTimeout(this.hideTimeout);
			this.hideTimeout = null;
		}

		// 立即隐藏悬浮窗
		if (this.tooltip) {
			this.tooltip.removeClass('gc-task-tooltip--visible');
			this.tooltip.style.opacity = '0';
		}
	}

	/**
	 * 隐藏 tooltip
	 */
	hide(): void {
		// 取消显示定时器
		if (this.showTimeout) {
			window.clearTimeout(this.showTimeout);
			this.showTimeout = null;
		}

		// 延迟隐藏
		this.hideTimeout = window.setTimeout(() => {
			if (this.tooltip) {
				this.tooltip.removeClass('gc-task-tooltip--visible');
				this.tooltip.style.opacity = '0';
			}
		}, this.config.hideDelay);
	}

	/**
	 * 销毁 tooltip
	 */
	destroy(): void {
		if (this.showTimeout) {
			window.clearTimeout(this.showTimeout);
			this.showTimeout = null;
		}
		if (this.hideTimeout) {
			window.clearTimeout(this.hideTimeout);
			this.hideTimeout = null;
		}
		if (this.tooltip) {
			this.tooltip.remove();
			this.tooltip = null;
		}
		this.cachedElements = {};
		this.currentTask = null;
		this.currentCard = null;
	}

	/**
	 * 获取优先级图标
	 */
	private getPriorityIcon(priority?: string): string {
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
	 * HTML 转义
	 */
	private escapeHtml(text: string): string {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	/**
	 * 重置单例（用于测试或重置）
	 */
	static reset(): void {
		if (TooltipManager.instance) {
			TooltipManager.instance.destroy();
			TooltipManager.instance = null;
		}
	}
}
