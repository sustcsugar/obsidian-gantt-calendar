/**
 * TagPill 组件 - 统一的标签胶囊组件
 *
 * 用于在插件中统一显示任务标签的样式和交互
 */

import { TagPillOptions, TagPillState } from './types';
import { TagClasses } from '../../utils/bem';

/**
 * TagPill 组件类
 */
export class TagPill {
	private static readonly COLOR_COUNT = 6;

	/**
	 * 创建单个 TagPill 元素
	 */
	static create(options: TagPillOptions): HTMLElement {
		const {
			label,
			showHash = true,
			colorIndex,
			selectable = false,
			selected = false,
			onClick,
			onContextMenu,
			suffix,
			dataAttrs,
			ariaAttrs,
		} = options;

		// 计算颜色索引
		const finalColorIndex = colorIndex ?? this.getColorIndex(label);

		// 创建容器元素
		const pillEl = activeDocument.createElement('span');
		pillEl.addClass(TagClasses.block);
		pillEl.addClass(TagClasses.colors[finalColorIndex]);

		// 添加状态类
		if (selectable) {
			pillEl.addClass(TagClasses.states.selectable);
		}
		if (selected) {
			pillEl.addClass(TagClasses.states.selected);
		}

		// 存储标签名称到 dataset
		pillEl.dataset.tag = label;
		pillEl.dataset.selected = String(selected);

		// 添加自定义数据属性（data-*）
		if (dataAttrs) {
			Object.entries(dataAttrs).forEach(([key, value]) => {
				pillEl.dataset[key] = value;
			});
		}

		// 添加 ARIA 属性（aria-*）
		if (ariaAttrs) {
			Object.entries(ariaAttrs).forEach(([key, value]) => {
				pillEl.setAttribute(key, value);
			});
		}

		// 创建标签文本元素
		const labelEl = activeDocument.createElement('span');
		labelEl.addClass(TagClasses.elements.label);
		labelEl.textContent = showHash ? `#${label}` : label;
		pillEl.appendChild(labelEl);

		// 添加后缀（如数量徽章）
		if (suffix) {
			const suffixEl = activeDocument.createElement('span');
			suffixEl.addClass(TagClasses.elements.suffix);
			suffixEl.textContent = suffix;
			pillEl.appendChild(suffixEl);
		}

		// 绑定点击事件
		if (onClick && selectable) {
			pillEl.addEventListener('click', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				const newSelected = !this.isSelected(pillEl);
				this.setSelected(pillEl, newSelected);
				onClick(e, label, newSelected);
			});
		}

		// 绑定右键菜单事件
		if (onContextMenu) {
			pillEl.addEventListener('contextmenu', (e: MouseEvent) => {
				e.preventDefault();
				onContextMenu(e, label);
			});
		}

		return pillEl;
	}

	/**
	 * 批量创建 TagPill 元素
	 * @param tags 标签数组
	 * @param container 容器元素（可选）
	 * @param options 通用配置选项（不含 label）
	 * @returns TagPill 元素数组
	 */
	static createMultiple(
		tags: string[],
		container?: HTMLElement,
		options?: Omit<TagPillOptions, 'label'>
	): HTMLElement[] {
		const pills: HTMLElement[] = [];

		for (const tag of tags) {
			const pillEl = this.create({ ...options, label: tag });
			pills.push(pillEl);

			if (container) {
				container.appendChild(pillEl);
			}
		}

		return pills;
	}

	/**
	 * 计算标签颜色索引（基于 hash）
	 * 确保同一个标签始终显示相同的颜色
	 */
	static getColorIndex(tag: string): number {
		let hash = 0;
		for (let i = 0; i < tag.length; i++) {
			hash = ((hash << 5) - hash) + tag.charCodeAt(i);
			hash = hash & hash; // Convert to 32bit integer
		}
		return Math.abs(hash) % this.COLOR_COUNT;
	}

	/**
	 * 检查元素是否处于选中状态
	 */
	static isSelected(element: HTMLElement): boolean {
		return element.dataset.selected === 'true';
	}

	/**
	 * 切换选中状态
	 */
	static toggleSelected(element: HTMLElement): boolean {
		const newSelected = !this.isSelected(element);
		this.setSelected(element, newSelected);
		return newSelected;
	}

	/**
	 * 更新选中状态
	 */
	static setSelected(element: HTMLElement, selected: boolean): void {
		element.dataset.selected = String(selected);
		if (selected) {
			element.addClass(TagClasses.states.selected);
		} else {
			element.removeClass(TagClasses.states.selected);
		}
	}

	/**
	 * 格式化标签显示文本
	 */
	static formatLabel(label: string, showHash: boolean): string {
		return showHash ? `#${label}` : label;
	}
}
