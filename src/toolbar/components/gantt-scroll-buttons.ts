/**
 * @fileoverview 甘特图滚动按钮组件（左置顶/今天/右置顶）
 * @module toolbar/components/gantt-scroll-buttons
 */

import { setIcon } from 'obsidian';
import { ToolbarClasses } from '../../utils/bem';
import { i18n } from '../../i18n/i18n';

/**
 * 甘特图滚动按钮组配置选项
 */
export interface GanttScrollButtonsOptions {
	/** 滚动到最左边回调 */
	onScrollToLeft: () => void;
	/** 滚动到今天回调 */
	onScrollToToday: () => void;
	/** 滚动到最右边回调 */
	onScrollToRight: () => void;
}

/**
 * 渲染甘特图滚动按钮组（左置顶/今天/右置顶）
 *
 * 特性：
 * - 左置顶：滚动到甘特图最左边
 * - 今天：滚动到今天所在位置
 * - 右置顶：滚动到甘特图最右边
 *
 * @param container 容器元素
 * @param options 配置选项
 * @returns 清理函数对象
 */
export function renderGanttScrollButtons(
	container: HTMLElement,
	options: GanttScrollButtonsOptions
): { cleanup: () => void } {
	const {
		onScrollToLeft,
		onScrollToToday,
		onScrollToRight
	} = options;

	// 创建滚动按钮组容器
	const scrollButtonsGroup = container.createDiv(ToolbarClasses.components.navButtons.group);

	// 左置顶按钮
	const scrollToLeftBtn = scrollButtonsGroup.createEl('button', {
		attr: { 'aria-label': i18n.t('toolbar.ganttScroll.scrollLeft') }
	});
	setIcon(scrollToLeftBtn, 'chevrons-left');
	scrollToLeftBtn.addClass(ToolbarClasses.components.navButtons.btn);
	scrollToLeftBtn.onclick = onScrollToLeft;

	// 今天按钮
	const todayBtn = scrollButtonsGroup.createEl('button', {
		text: i18n.t('toolbar.nav.today'),
		attr: { 'aria-label': i18n.t('toolbar.ganttScroll.goToday') }
	});
	todayBtn.addClass(ToolbarClasses.components.navButtons.btn);
	todayBtn.onclick = onScrollToToday;

	// 右置顶按钮
	const scrollToRightBtn = scrollButtonsGroup.createEl('button', {
		attr: { 'aria-label': i18n.t('toolbar.ganttScroll.scrollRight') }
	});
	setIcon(scrollToRightBtn, 'chevrons-right');
	scrollToRightBtn.addClass(ToolbarClasses.components.navButtons.btn);
	scrollToRightBtn.onclick = onScrollToRight;

	// 清理函数
	const cleanup = () => {
		scrollToLeftBtn.remove();
		todayBtn.remove();
		scrollToRightBtn.remove();
		scrollButtonsGroup.remove();
	};

	return { cleanup };
}
