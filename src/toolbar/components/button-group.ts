/**
 * @fileoverview 通用按钮组容器组件
 * @module toolbar/components/button-group
 */

import { setIcon } from 'obsidian';
import { ToolbarClasses } from '../../utils/bem';
import { i18n } from '../../i18n/i18n';

/**
 * 单个按钮配置
 */
export interface ButtonConfig {
	/** 按钮文本 */
	text: string;
	/** 按钮图标（lucide图标名） */
	icon?: string;
	/** 按钮提示文本 */
	title?: string;
	/** 点击事件处理函数 */
	onClick: () => void;
	/** 是否为激活状态 */
	active?: boolean;
	/** 自定义按钮样式类 */
	buttonClass?: string;
	/** 按钮是否禁用 */
	disabled?: boolean;
}

/**
 * 按钮组配置选项
 */
export interface ButtonGroupOptions {
	/** 按钮配置数组 */
	buttons: ButtonConfig[];
	/** 布局方向 */
	orientation?: 'horizontal' | 'vertical';
	/** 按钮组容器样式类 */
	groupClass?: string;
	/** 按钮统一样式类 */
	buttonBaseClass?: string;
}

/**
 * 渲染按钮组容器
 *
 * 特性：
 * - 支持水平/垂直布局
 * - 统一按钮样式和间距
 * - 支持图标+文本组合
 * - 支持激活状态高亮
 *
 * @param container 容器元素
 * @param options 配置选项
 * @returns 清理函数对象
 */
export function renderButtonGroup(
	container: HTMLElement,
	options: ButtonGroupOptions
): { cleanup: () => void } {
	const { buttons, orientation = 'horizontal', groupClass, buttonBaseClass } = options;

	// 创建按钮组容器
	const group = container.createDiv(ToolbarClasses.components.buttonGroup.group);
	if (groupClass) group.addClass(groupClass);

	// 设置布局方向
	group.addClass(orientation === 'vertical' ? ToolbarClasses.components.buttonGroup.vertical : ToolbarClasses.components.buttonGroup.horizontal);

	// 清理函数数组
	const cleanupFunctions: (() => void)[] = [];

	// 创建各个按钮
	buttons.forEach((config) => {
		const btn = group.createEl('button', {
			cls: buttonBaseClass || ToolbarClasses.components.navButtons.btn,
			attr: { title: config.title || config.text }
		});

		if (config.buttonClass) btn.addClass(config.buttonClass);
		if (config.active) btn.addClass('active');
		if (config.disabled) btn.addClass('disabled');

		// 添加图标
		if (config.icon) {
			setIcon(btn, config.icon);
		}

		// 添加文本（如果没有图标或需要同时显示图标和文本）
		if (config.text) {
			const textSpan = btn.createSpan();
			textSpan.setText(config.text);
		}

		// 绑定点击事件
		if (!config.disabled && config.onClick) {
			btn.addEventListener('click', config.onClick);
		}
	});

	// 清理函数
	const cleanup = () => {
		cleanupFunctions.forEach(fn => fn());
		group.remove();
	};

	return { cleanup };
}

/**
 * 创建简单的导航按钮组（上一页/下一页等）
 */
export interface NavButtonGroupOptions extends Omit<ButtonGroupOptions, 'buttons'> {
	onPrevious?: () => void;
	onNext?: () => void;
	onToday?: () => void;
	onFirst?: () => void;
	onLast?: () => void;
	prevText?: string;
	nextText?: string;
	todayText?: string;
}

export function renderNavButtonGroup(
	container: HTMLElement,
	options: NavButtonGroupOptions
): { cleanup: () => void } {
	const {
		onPrevious,
		onNext,
		onToday,
		onFirst,
		onLast,
		prevText = '◀',
		nextText = '▶',
		todayText = i18n.t('toolbar.buttonGroup.todayText'),
		...rest
	} = options;

	const buttons: ButtonConfig[] = [];

	if (onFirst) {
		buttons.push({ text: '«', title: i18n.t('toolbar.buttonGroup.firstTitle'), onClick: onFirst });
	}
	if (onPrevious) {
		buttons.push({ text: prevText, title: i18n.t('toolbar.buttonGroup.prevTitle'), onClick: onPrevious });
	}
	if (onToday) {
		buttons.push({ text: todayText, title: i18n.t('toolbar.buttonGroup.todayTitle'), onClick: onToday });
	}
	if (onNext) {
		buttons.push({ text: nextText, title: i18n.t('toolbar.buttonGroup.nextTitle'), onClick: onNext });
	}
	if (onLast) {
		buttons.push({ text: '»', title: i18n.t('toolbar.buttonGroup.lastTitle'), onClick: onLast });
	}

	return renderButtonGroup(container, { buttons, ...rest });
}
