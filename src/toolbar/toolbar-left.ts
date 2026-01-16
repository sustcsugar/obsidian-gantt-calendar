import type { CalendarViewType } from '../types';
import { ToolbarClasses } from '../utils/bem';
import { setIcon } from 'obsidian';

/**
 * 视图按钮配置
 */
interface ViewButtonConfig {
	type: CalendarViewType;
	label: string;
	icon: string;
	ariaLabel: string;
}

/** 6个视图按钮的配置 - 使用线框风格图标 */
const VIEW_BUTTONS: ViewButtonConfig[] = [
	{ type: 'day', label: '日', icon: 'sun', ariaLabel: '日视图' },
	{ type: 'week', label: '周', icon: 'layout', ariaLabel: '周视图' },
	{ type: 'month', label: '月', icon: 'grid', ariaLabel: '月视图' },
	{ type: 'year', label: '年', icon: 'map', ariaLabel: '年视图' },
	{ type: 'task', label: '任务', icon: 'list-checks', ariaLabel: '任务视图' },
	{ type: 'gantt', label: '甘特图', icon: 'chart-gantt', ariaLabel: '甘特图视图' },
];

/**
 * 工具栏左侧区域 - 6视图选择器
 * 负责渲染 日|周|月|年|任务|甘特图 6个平级按钮
 */
export class ToolbarLeft {
	/**
	 * 渲染左侧区域
	 * @param container 左侧容器元素
	 * @param currentViewType 当前视图类型
	 * @param onViewSwitch 视图切换回调
	 * @param showButtonText 是否显示按钮文本（默认为 true）
	 */
	render(
		container: HTMLElement,
		currentViewType: CalendarViewType,
		onViewSwitch: (type: CalendarViewType) => void,
		showButtonText: boolean = true
	): void {
		container.empty();

		// 创建按钮组容器
		const buttonGroup = container.createDiv(ToolbarClasses.components.viewSelectorGroup.group);

		// 根据是否显示文本添加 modifier class
		if (!showButtonText) {
			buttonGroup.addClass(ToolbarClasses.components.viewSelectorGroup.iconOnly);
		}

		// 渲染6个视图按钮
		VIEW_BUTTONS.forEach((config) => {
			const btn = buttonGroup.createEl('button', {
				attr: {
					'data-view-type': config.type,
					'aria-label': config.ariaLabel,
				},
			});

			// 基础类名
			btn.addClass(ToolbarClasses.components.viewSelectorGroup.btn);

			// 激活状态
			if (config.type === currentViewType) {
				btn.addClass(ToolbarClasses.components.viewSelectorGroup.btnActive);
			}

			// 创建按钮内容容器（图标+文字）
			const contentContainer = btn.createDiv('view-selector-btn-content');

			// 添加图标
			const iconEl = contentContainer.createSpan();
			iconEl.addClass(ToolbarClasses.components.viewSelectorGroup.icon);
			setIcon(iconEl, config.icon);

			// 添加文字标签（仅在 showButtonText 为 true 时显示）
			if (showButtonText) {
				const labelEl = contentContainer.createSpan();
				labelEl.addClass(ToolbarClasses.components.viewSelectorGroup.label);
				labelEl.setText(config.label);
			}

			// 绑定点击事件
			btn.onclick = () => onViewSwitch(config.type);
		});
	}
}
