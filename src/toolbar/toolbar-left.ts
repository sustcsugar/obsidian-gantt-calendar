import type { CalendarViewType } from '../types';
import { ToolbarClasses } from '../utils/bem';
import { setIcon } from 'obsidian';
import { i18n } from '../i18n/i18n';

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
function getViewButtons(): ViewButtonConfig[] {
	return [
		{ type: 'day', label: i18n.t('toolbar.leftButtons.day.label'), icon: 'sun', ariaLabel: i18n.t('toolbar.leftButtons.day.ariaLabel') },
		{ type: 'week', label: i18n.t('toolbar.leftButtons.week.label'), icon: 'layout', ariaLabel: i18n.t('toolbar.leftButtons.week.ariaLabel') },
		{ type: 'month', label: i18n.t('toolbar.leftButtons.month.label'), icon: 'grid', ariaLabel: i18n.t('toolbar.leftButtons.month.ariaLabel') },
		{ type: 'year', label: i18n.t('toolbar.leftButtons.year.label'), icon: 'map', ariaLabel: i18n.t('toolbar.leftButtons.year.ariaLabel') },
		{ type: 'task', label: i18n.t('toolbar.leftButtons.task.label'), icon: 'list-checks', ariaLabel: i18n.t('toolbar.leftButtons.task.ariaLabel') },
		{ type: 'gantt', label: i18n.t('toolbar.leftButtons.gantt.label'), icon: 'chart-gantt', ariaLabel: i18n.t('toolbar.leftButtons.gantt.ariaLabel') },
	];
}

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
		getViewButtons().forEach((config) => {
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
