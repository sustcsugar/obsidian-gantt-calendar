import type { TaskCardConfig, TaskCardProps, TaskCardRenderResult } from './TaskCardConfig';
import { TaskCardRenderer } from './TaskCardRenderer';
import { TaskCardClasses } from '../../utils/bem';
import type { GCTask } from '../../types';
import { isVirtualTask, getVirtualMetadata } from '../../tasks/virtualTaskGenerator';

/**
 * 任务卡片统一组件
 * 提供可配置的任务卡片渲染，支持不同视图的需求
 */
export class TaskCardComponent {
	private renderer: TaskCardRenderer;
	private props: TaskCardProps;
	private cardElement: HTMLElement | null = null;

	constructor(props: TaskCardProps) {
		this.props = props;
		this.renderer = new TaskCardRenderer(props.app, props.plugin);
	}

	/**
	 * 渲染任务卡片
	 * @returns 渲染结果，包含元素和销毁方法
	 */
	render(): TaskCardRenderResult {
		const { task, container, config } = this.props;

		// 创建卡片元素
		this.cardElement = this.createCardElement();

		// 应用状态修饰符
		this.applyStateModifiers(this.cardElement, task);

		// 渲染子元素
		this.renderChildren(this.cardElement, task, config);

		// 应用交互
		this.attachInteractions(this.cardElement, task);

		// 添加到容器
		container.appendChild(this.cardElement);

		return {
			element: this.cardElement,
			destroy: () => this.destroy()
		};
	}

	/**
	 * 创建卡片元素
	 */
	private createCardElement(): HTMLElement {
		const { config, task } = this.props;
		const card = activeDocument.createElement('div');
		card.className = TaskCardClasses.block;

		// 应用视图修饰符
		const viewModifierClass = `${config.viewModifier}View` as keyof typeof TaskCardClasses.modifiers;
		const modifierClass = TaskCardClasses.modifiers[viewModifierClass];
		if (modifierClass) {
			card.addClass(modifierClass);
		}

		// 应用紧凑模式
		if (config.compact) {
			card.addClass('gc-task-card--compact');
		}

		// 周期任务/虚拟实例修饰符
		if (isVirtualTask(task)) {
			card.addClass(TaskCardClasses.modifiers.virtual);
		} else if (task.repeat) {
			card.addClass(TaskCardClasses.modifiers.recurring);
		}

		return card;
	}

	/**
	 * 应用状态修饰符
	 */
	private applyStateModifiers(card: HTMLElement, task: GCTask): void {
		const statusClass = task.completed
			? TaskCardClasses.modifiers.completed
			: TaskCardClasses.modifiers.pending;
		card.addClass(statusClass);

		// 应用自定义状态颜色
		this.renderer.applyStatusColors(task, card);
	}

	/**
	 * 渲染子元素
	 */
	private renderChildren(card: HTMLElement, task: GCTask, config: TaskCardConfig): void {
		// 复选框
		if (config.showCheckbox) {
			this.renderer.createTaskCheckbox(task, card);
		}

		// 任务描述
		if (config.showDescription) {
			this.renderer.renderDescription(card, task, config);
		}

		// ticktick（%%content%%）
		if (config.showTicktick) {
			this.renderer.renderTicktick(card, task);
			this.renderer.renderMetadataFields(card, task);
		}

		// 周期指示器（虚拟实例和真实周期任务都显示）
		if (task.repeat) {
			this.renderer.renderRepeatIndicator(card);
		}

		// 标签
		if (config.showTags) {
			this.renderer.renderTaskTags(task, card);
		}

		// 优先级
		if (config.showPriority && task.priority) {
			this.renderer.renderPriority(card, task);
		}

		// 时间属性
		if (config.showTimes) {
			this.renderer.renderTimeFields(card, task, config.timeFields);
		}

		// 文件位置
		if (config.showFileLocation) {
			this.renderer.renderFileLocation(card, task);
		}

		// 警告图标
		if (config.showWarning && task.warning) {
			this.renderer.renderWarning(card, task);
		}
	}

	/**
	 * 应用交互功能
	 */
	private attachInteractions(card: HTMLElement, task: GCTask): void {
		const { props } = this;
		const config = props.config;

		if (isVirtualTask(task)) {
			// 虚拟任务：点击打开源任务文件
			card.addEventListener('click', async (e) => {
				e.stopPropagation();
				const meta = getVirtualMetadata(task);
				if (meta) {
					const [filePath, lineStr] = meta.sourceTaskId.split(':');
					const lineNumber = parseInt(lineStr);
					await this.renderer.openTaskFile({
						...task,
						filePath,
						lineNumber,
					});
				}
				props.onClick?.(task);
			});

			// 虚拟任务不启用拖拽
			// 虚拟任务仍然显示悬浮提示
			if (config.enableTooltip) {
				this.renderer.attachTooltip(card, task);
			}
			return;
		}

		// 真实任务的正常交互
		// 点击事件
		if (config.clickable && props.onClick) {
			card.addEventListener('click', async () => {
				await this.renderer.openTaskFile(task);
				props.onClick?.(task);
			});
		}

		// 拖拽功能
		if (config.enableDrag) {
			this.renderer.attachDragBehavior(card, task, props.targetDate);
		}

		// 悬浮提示
		if (config.enableTooltip) {
			this.renderer.attachTooltip(card, task);
		}

		// 右键菜单
		this.renderer.attachContextMenu(card, task, props.onRefresh);
	}

	/**
	 * 销毁组件
	 */
	private destroy(): void {
		if (this.cardElement && this.cardElement.parentNode) {
			this.cardElement.remove();
		}
		this.cardElement = null;
	}

	/**
	 * 获取卡片元素
	 */
	getElement(): HTMLElement | null {
		return this.cardElement;
	}
}
