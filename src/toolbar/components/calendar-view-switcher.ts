/**
 * @fileoverview 日历视图切换器组件（日/周/月/年）
 * @module toolbar/components/calendar-view-switcher
 */

import { ToolbarClasses } from '../../utils/bem';
import { i18n } from '../../i18n/i18n';

/**
 * 日历视图切换器配置选项
 */
export interface CalendarViewSwitcherOptions {
	/** 当前视图类型 */
	currentView: 'year' | 'month' | 'week' | 'day';
	/** 视图切换回调 */
	onViewChange: (view: 'year' | 'month' | 'week' | 'day') => void;
	/** 容器样式类 */
	containerClass?: string;
	/** 按钮样式类 */
	buttonClass?: string;
	/** 是否显示完整标签 */
	fullLabel?: boolean;
}

/**
 * 获取视图类型对应的显示文本
 */
function getViewLabel(type: string) {
	return {
		short: i18n.t('toolbar.viewSwitcher.' + type),
		full: i18n.t('toolbar.viewSwitcher.' + type + 'Full')
	};
}

/**
 * 渲染日历视图切换器（日/周/月/年）
 *
 * 特性：
 * - 四个视图按钮：日/周/月/年
 * - 当前视图高亮显示
 * - 点击切换视图
 *
 * @param container 容器元素
 * @param options 配置选项
 * @returns 包含更新函数和清理函数的对象
 */
export function renderCalendarViewSwitcher(
	container: HTMLElement,
	options: CalendarViewSwitcherOptions
): { updateActive: (view: string) => void; cleanup: () => void } {
	const {
		currentView,
		onViewChange,
		containerClass,
		buttonClass = ToolbarClasses.components.navButtons.btn,
		fullLabel = false
	} = options;

	// 创建视图选择器容器
	const viewContainer = container.createDiv(ToolbarClasses.components.viewSelector.group);
	if (containerClass) viewContainer.addClass(containerClass);

	// 存储按钮元素以便更新
	const buttonElements: Map<string, HTMLElement> = new Map();

	// 视图类型顺序：日 -> 周 -> 月 -> 年
	const viewTypes: Array<'day' | 'week' | 'month' | 'year'> = ['day', 'week', 'month', 'year'];

	viewTypes.forEach((type) => {
		const labels = getViewLabel(type);
		const btn = viewContainer.createEl('button', {
			text: fullLabel ? labels.full : labels.short,
			attr: {
				'data-view': type,
				title: labels.full
			}
		});

		btn.addClass(buttonClass);

		// 设置当前视图为激活状态
		if (type === currentView) {
			btn.addClass('active');
		}

		// 绑定点击事件
		btn.onclick = () => onViewChange(type);

		// 存储按钮引用
		buttonElements.set(type, btn);
	});

	/**
	 * 更新当前激活的视图
	 */
	const updateActive = (view: string) => {
		buttonElements.forEach((el, viewType) => {
			if (viewType === view) {
				el.addClass('active');
			} else {
				el.removeClass('active');
			}
		});
	};

	// 清理函数
	const cleanup = () => {
		buttonElements.clear();
		viewContainer.remove();
	};

	return { updateActive, cleanup };
}

/**
 * 创建简化版视图切换器（只显示周/月）
 */
export interface SimpleViewSwitcherOptions {
	currentView: 'week' | 'month';
	onViewChange: (view: 'week' | 'month') => void;
	containerClass?: string;
	buttonClass?: string;
}

export function renderSimpleViewSwitcher(
	container: HTMLElement,
	options: SimpleViewSwitcherOptions
): { updateActive: (view: string) => void; cleanup: () => void } {
	const {
		currentView,
		onViewChange,
		containerClass,
		buttonClass = ToolbarClasses.components.navButtons.btn
	} = options;

	const viewContainer = container.createDiv(ToolbarClasses.components.viewSelector.group);
	if (containerClass) viewContainer.addClass(containerClass);

	const buttonElements: Map<string, HTMLElement> = new Map();

	const viewTypes: Array<'week' | 'month'> = ['week', 'month'];
	const labels: Record<string, string> = {
			'week': i18n.t('toolbar.viewSwitcher.week'),
			'month': i18n.t('toolbar.viewSwitcher.month')
		};

	viewTypes.forEach((type) => {
		const btn = viewContainer.createEl('button', {
			text: labels[type],
			attr: { 'data-view': type, title: i18n.t('toolbar.viewSwitcher.' + type + 'Full') }
		});

		btn.addClass(buttonClass);

		if (type === currentView) {
			btn.addClass('active');
		}

		btn.onclick = () => onViewChange(type);

		buttonElements.set(type, btn);
	});

	const updateActive = (view: string) => {
		buttonElements.forEach((el, viewType) => {
			if (viewType === view) {
				el.addClass('active');
			} else {
				el.removeClass('active');
			}
		});
	};

	const cleanup = () => {
		buttonElements.clear();
		viewContainer.remove();
	};

	return { updateActive, cleanup };
}
