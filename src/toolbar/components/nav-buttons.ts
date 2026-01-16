/**
 * @fileoverview 导航按钮组组件（上一期/今天/下一期）
 * @module toolbar/components/nav-buttons
 */

import { setIcon } from 'obsidian';
import { ToolbarClasses } from '../../utils/bem';

/**
 * 导航按钮组配置选项
 */
export interface NavButtonsOptions {
	/** 上一期回调 */
	onPrevious: () => void;
	/** 今天回调 */
	onToday: () => void;
	/** 下一期回调 */
	onNext: () => void;
	/** 按钮组容器样式类 */
	containerClass?: string;
	/** 按钮样式类 */
	buttonClass?: string;
	/** 自定义"今天"按钮文本 */
	todayText?: string;
	/** 自定义"上一期"按钮文本 */
	prevText?: string;
	/** 自定义"下一期"按钮文本 */
	nextText?: string;
	/** 是否显示完整文本（false则用箭头） */
	fullText?: boolean;
}

/**
 * 渲染导航按钮组（上一期/今天/下一期）
 *
 * 特性：
 * - 标准的日期导航按钮
 * - 支持自定义按钮文本
 * - 默认使用箭头图标简洁显示
 *
 * @param container 容器元素
 * @param options 配置选项
 * @returns 清理函数对象
 */
export function renderNavButtons(
	container: HTMLElement,
	options: NavButtonsOptions
): { cleanup: () => void } {
	const {
		onPrevious,
		onToday,
		onNext,
		containerClass,
		buttonClass = ToolbarClasses.components.navButtons.btn,
		todayText = '今',
		prevText = '',
		nextText = '',
		fullText = false
	} = options;

	// 创建导航按钮组容器
	const navButtons = container.createDiv(ToolbarClasses.components.navButtons.group);
	if (containerClass) navButtons.addClass(containerClass);

	// 上一期按钮
	const prevBtn = navButtons.createEl('button', {
		attr: { title: '上一个', 'aria-label': '上一个' }
	});
	setIcon(prevBtn, 'chevron-left');
	prevBtn.addClass(buttonClass);
	prevBtn.onclick = onPrevious;

	// 今天按钮
	const todayBtn = navButtons.createEl('button', {
		text: todayText,
		attr: { title: '回到今天' }
	});
	todayBtn.addClass(buttonClass);
	todayBtn.onclick = onToday;

	// 下一期按钮
	const nextBtn = navButtons.createEl('button', {
		attr: { title: '下一个', 'aria-label': '下一个' }
	});
	setIcon(nextBtn, 'chevron-right');
	nextBtn.addClass(buttonClass);
	nextBtn.onclick = onNext;

	// 清理函数
	const cleanup = () => {
		prevBtn.remove();
		todayBtn.remove();
		nextBtn.remove();
		navButtons.remove();
	};

	return { cleanup };
}

/**
 * 创建完整版的导航按钮组（带首尾按钮）
 */
export interface NavButtonsFullOptions extends Omit<NavButtonsOptions, 'prevText' | 'nextText'> {
	onFirst?: () => void;
	onLast?: () => void;
	firstText?: string;
	lastText?: string;
}

export function renderNavButtonsFull(
	container: HTMLElement,
	options: NavButtonsFullOptions
): { cleanup: () => void } {
	const {
		onFirst,
		onLast,
		firstText = '«',
		lastText = '»',
		...baseOptions
	} = options;

	const navButtons = container.createDiv(ToolbarClasses.components.navButtons.group);
	if (baseOptions.containerClass) navButtons.addClass(baseOptions.containerClass);

	const buttonClass = baseOptions.buttonClass || ToolbarClasses.components.navButtons.btn;
	const buttons: HTMLButtonElement[] = [];

	// 首页按钮
	if (onFirst) {
		const firstBtn = navButtons.createEl('button', {
			text: firstText,
			attr: { title: '第一个' }
		});
		firstBtn.addClass(buttonClass);
		firstBtn.onclick = onFirst;
		buttons.push(firstBtn);
	}

	// 上一期按钮
	const prevBtn = navButtons.createEl('button', {
		attr: { title: '上一个', 'aria-label': '上一个' }
	});
	setIcon(prevBtn, 'chevron-left');
	prevBtn.addClass(buttonClass);
	prevBtn.onclick = baseOptions.onPrevious;
	buttons.push(prevBtn);

	// 今天按钮
	const todayBtn = navButtons.createEl('button', {
		text: baseOptions.todayText || '今',
		attr: { title: '回到今天' }
	});
	todayBtn.addClass(buttonClass);
	todayBtn.onclick = baseOptions.onToday;
	buttons.push(todayBtn);

	// 下一期按钮
	const nextBtn = navButtons.createEl('button', {
		attr: { title: '下一个', 'aria-label': '下一个' }
	});
	setIcon(nextBtn, 'chevron-right');
	nextBtn.addClass(buttonClass);
	nextBtn.onclick = baseOptions.onNext;
	buttons.push(nextBtn);

	// 末页按钮
	if (onLast) {
		const lastBtn = navButtons.createEl('button', {
			text: lastText,
			attr: { title: '最后一个' }
		});
		lastBtn.addClass(buttonClass);
		lastBtn.onclick = onLast;
		buttons.push(lastBtn);
	}

	// 清理函数
	const cleanup = () => {
		buttons.forEach(btn => btn.remove());
		navButtons.remove();
	};

	return { cleanup };
}
