/**
 * @fileoverview 模式切换按钮组组件（单选按钮组）
 * @module toolbar/components/mode-toggle-group
 */

import { ToolbarClasses } from '../../utils/bem';

/**
 * 单个模式选项配置
 */
export interface ModeOption {
	/** 选项值 */
	value: string;
	/** 显示标签 */
	label: string;
	/** 图标（可选） */
	icon?: string;
	/** 提示文本 */
	title?: string;
}

/**
 * 模式切换组配置选项
 */
export interface ModeToggleGroupOptions {
	/** 所有可选模式 */
	options: ModeOption[];
	/** 当前选中的值 */
	currentValue: string;
	/** 值变化回调 */
	onChange: (value: string) => void;
	/** 按钮基础样式类 */
	buttonClass?: string;
	/** 容器样式类 */
	groupClass?: string;
	/** 是否紧凑模式 */
	compact?: boolean;
}

/**
 * 渲染模式切换按钮组（单选按钮组）
 *
 * 特性：
 * - 单选互斥选择（同时只能选中一个）
 * - 当前选中项高亮显示
 * - 支持图标+文本组合
 * - 支持紧凑模式
 *
 * @param container 容器元素
 * @param options 配置选项
 * @returns 包含更新函数和清理函数的对象
 */
export function renderModeToggleGroup(
	container: HTMLElement,
	options: ModeToggleGroupOptions
): { updateActive: (value: string) => void; cleanup: () => void } {
	const {
		options: modeOptions,
		currentValue,
		onChange,
		buttonClass,
		groupClass,
		compact = false
	} = options;

	// 创建按钮组容器
	const group = container.createDiv(ToolbarClasses.components.modeToggle.group);
	if (groupClass) group.addClass(groupClass);
	if (compact) group.addClass('compact');

	// 存储按钮元素以便更新
	const buttonElements: Map<string, HTMLElement> = new Map();

	// 创建各个模式按钮
	modeOptions.forEach((mode) => {
		const btn = group.createEl('button', {
			cls: buttonClass || ToolbarClasses.components.navButtons.btn,
			attr: {
				'data-value': mode.value,
				title: mode.title || mode.label
			}
		});

		// 设置初始激活状态
		if (mode.value === currentValue) {
			btn.addClass('active');
		}

		// 添加图标
		if (mode.icon) {
			const iconSpan = btn.createSpan(ToolbarClasses.components.modeToggle.icon);
			iconSpan.setText(mode.icon);
		}

		// 添加文本
		const textSpan = btn.createSpan(ToolbarClasses.components.modeToggle.label);
		textSpan.setText(mode.label);

		// 绑定点击事件
		btn.addEventListener('click', () => {
			// 更新所有按钮的激活状态
			buttonElements.forEach((el) => el.removeClass('active'));
			btn.addClass('active');

			// 触发变化回调
			onChange(mode.value);
		});

		// 存储按钮引用
		buttonElements.set(mode.value, btn);
	});

	/**
	 * 更新当前激活的模式
	 */
	const updateActive = (value: string) => {
		buttonElements.forEach((el, val) => {
			if (val === value) {
				el.addClass('active');
			} else {
				el.removeClass('active');
			}
		});
	};

	// 清理函数
	const cleanup = () => {
		buttonElements.clear();
		group.remove();
	};

	return { updateActive, cleanup };
}

/**
 * 创建简单的视图切换器（日/周/月/年）
 */
export interface ViewSwitcherOptions {
	currentView: 'day' | 'week' | 'month' | 'year';
	onViewChange: (view: 'day' | 'week' | 'month' | 'year') => void;
	buttonClass?: string;
	groupClass?: string;
	showFullLabel?: boolean; // true显示完整标签，false显示单字
}

const VIEW_LABELS: Record<string, { short: string; full: string }> = {
	'day': { short: '日', full: '日视图' },
	'week': { short: '周', full: '周视图' },
	'month': { short: '月', full: '月视图' },
	'year': { short: '年', full: '年视图' }
};

export function renderViewSwitcher(
	container: HTMLElement,
	options: ViewSwitcherOptions
): { updateActive: (view: string) => void; cleanup: () => void } {
	const {
		currentView,
		onViewChange,
		buttonClass,
		groupClass
	} = options;

	const modeOptions: ModeOption[] = ['day', 'week', 'month', 'year'].map(view => ({
		value: view,
		label: VIEW_LABELS[view].short,
		title: VIEW_LABELS[view].full
	}));

	return renderModeToggleGroup(container, {
		options: modeOptions,
		currentValue: currentView,
		onChange: (value) => onViewChange(value as any),
		buttonClass,
		groupClass
	});
}
