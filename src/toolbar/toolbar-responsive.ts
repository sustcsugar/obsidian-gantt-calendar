/**
 * @fileoverview 工具栏响应式管理器
 * @module toolbar/toolbar-responsive
 *
 * 使用 ResizeObserver 监听工具栏各区域宽度变化，动态调整响应式状态
 *
 * 响应式逻辑（使用滞后机制避免循环触发）：
 * 1. 检测中间区域宽度，使用硬编码阈值判断是否隐藏左侧按钮文字
 * 2. 隐藏和显示使用不同的阈值（HIDE_LABEL < SHOW_LABEL）
 * 3. 中间区域宽度为0后，按优先级隐藏右侧按钮
 */

import { ToolbarClasses } from '../utils/bem';
import { Logger } from '../utils/logger';

/**
 * 滞后阈值配置（硬编码版本）
 * 隐藏阈值 < 显示阈值，避免在临界点附近循环切换
 */
const THRESHOLDS = {
	/** 隐藏文字的阈值：中间区域宽度小于此值时隐藏文字 */
	HIDE_LABEL: 100,
	/** 显示文字的阈值：中间区域宽度大于此值时显示文字（必须大于 HIDE_LABEL） */
	SHOW_LABEL: 300,
};

/**
 * 工具栏响应式管理器
 *
 * 负责监听工具栏容器宽度变化，并根据实际宽度动态添加/移除响应式类
 */
export class ToolbarResponsiveManager {
	private resizeObserver: ResizeObserver | null = null;
	private toolbarEl: HTMLElement | null = null;
	private centerEl: HTMLElement | null = null;
	private rightEl: HTMLElement | null = null;
	/** 当前是否处于紧凑模式 */
	private isCompact: boolean = false;

	/**
	 * 绑定工具栏元素并开始监听
	 *
	 * @param toolbarEl 工具栏容器元素
	 * @param centerEl 中间区域元素（标题显示区）
	 * @param rightEl 右侧区域元素（功能区）
	 */
	observe(
		toolbarEl: HTMLElement,
		centerEl: HTMLElement,
		rightEl: HTMLElement
	): void {
		this.toolbarEl = toolbarEl;
		this.centerEl = centerEl;
		this.rightEl = rightEl;

		// 立即执行一次状态更新
		this.updateResponsiveState();

		// 使用 ResizeObserver 监听容器宽度变化
		try {
			this.resizeObserver = new ResizeObserver(() => {
				this.updateResponsiveState();
			});
			this.resizeObserver.observe(toolbarEl);
		} catch (e) {
			Logger.warn('ToolbarResponsive', 'ResizeObserver not supported, responsive toolbar disabled', e);
		}
	}

	/**
	 * 停止监听并清理资源
	 */
	disconnect(): void {
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
		this.toolbarEl = null;
		this.centerEl = null;
		this.rightEl = null;
	}

	/**
	 * 根据容器宽度更新响应式状态
	 *
	 * 逻辑流程：
	 * 1. 先检测中间区域宽度，决定是否隐藏左侧文字（使用滞后机制）
	 * 2. 检测右侧区域是否溢出（仅在中间区域为0时）
	 */
	private updateResponsiveState(): void {
		if (!this.toolbarEl || !this.centerEl || !this.rightEl) return;

		// 1. 更新紧凑模式（隐藏左侧按钮文字）
		this.updateCompactMode();

		// 2. 隐藏右侧按钮（仅在中间区域宽度为0时）
		this.hideButtonsByOverflow();
	}

	/**
	 * 更新紧凑模式状态（使用滞后机制避免循环触发）
	 *
	 * 判断逻辑：
	 * - 当前宽度 < HIDE_LABEL 时，隐藏文字
	 * - 当前宽度 > SHOW_LABEL 时，显示文字
	 * - 中间区域保持当前状态（避免循环）
	 */
	private updateCompactMode(): void {
		if (!this.toolbarEl || !this.centerEl) return;

		const centerWidth = this.centerEl.offsetWidth;

		if (this.isCompact) {
			// 当前是紧凑模式，只有宽度足够大时才退出
			if (centerWidth > THRESHOLDS.SHOW_LABEL) {
				this.isCompact = false;
				this.toolbarEl.classList.remove(ToolbarClasses.modifiers.compact);
			}
		} else {
			// 当前不是紧凑模式，宽度不够时进入
			if (centerWidth < THRESHOLDS.HIDE_LABEL) {
				this.isCompact = true;
				this.toolbarEl.classList.add(ToolbarClasses.modifiers.compact);
			}
		}
	}

	/**
	 * 根据右侧区域溢出情况，按优先级隐藏按钮
	 *
	 * 只在中间区域宽度为0时才隐藏右侧按钮
	 *
	 * 优先级顺序：
	 * - Priority 1: 排序按钮、状态筛选
	 * - Priority 2: 标签筛选
	 * - Priority 3: 创建任务按钮
	 * - 保留: 导航按钮、刷新按钮
	 */
	private hideButtonsByOverflow(): void {
		if (!this.rightEl || !this.centerEl) return;

		// 只有在中间区域宽度为0时，才隐藏右侧按钮
		if (this.centerEl.offsetWidth > 0) {
			// 中间区域仍有宽度，重置所有隐藏状态
			this.rightEl.querySelectorAll(`.${ToolbarClasses.priority.hidden}`)
				.forEach(el => el.classList.remove(ToolbarClasses.priority.hidden));
			return;
		}

		// 先重置所有隐藏状态
		this.rightEl.querySelectorAll(`.${ToolbarClasses.priority.hidden}`)
			.forEach(el => el.classList.remove(ToolbarClasses.priority.hidden));

		// 逐个检测并隐藏按钮，直到不再溢出或没有更多按钮可隐藏
		let priority = 1;
		while (priority <= 3 && this.isRightOverflowing()) {
			const selector = this.getPrioritySelector(priority);
			const items = this.rightEl.querySelectorAll(selector);
			if (items.length > 0) {
				items.forEach(item => item.classList.add(ToolbarClasses.priority.hidden));
			}
			priority++;
		}
	}

	/**
	 * 检测右侧区域是否溢出
	 */
	private isRightOverflowing(): boolean {
		if (!this.rightEl) return false;
		// 使用 scrollWidth > clientWidth 判断是否有溢出
		return this.rightEl.scrollWidth > this.rightEl.clientWidth;
	}

	/**
	 * 获取指定优先级的选择器
	 */
	private getPrioritySelector(priority: number): string {
		switch (priority) {
			case 1:
				return `.${ToolbarClasses.priority.priority1}`;
			case 2:
				return `.${ToolbarClasses.priority.priority2}`;
			case 3:
				return `.${ToolbarClasses.priority.priority3}`;
			default:
				return '';
		}
	}
}
