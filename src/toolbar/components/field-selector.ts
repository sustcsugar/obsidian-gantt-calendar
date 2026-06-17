/**
 * @fileoverview 字段选择器组件（时间字段类型选择）
 * @module toolbar/components/field-selector
 */

import { ToolbarClasses } from '../../utils/bem';
import { i18n } from '../../i18n/i18n';

/**
 * 时间字段类型
 */
export type DateFieldType =
	| 'createdDate'
	| 'startDate'
	| 'scheduledDate'
	| 'dueDate'
	| 'completionDate'
	| 'cancelledDate';

/**
 * 时间字段选项配置
 */
export interface DateFieldOption {
	/** 字段值 */
	value: DateFieldType;
	/** 显示标签 */
	label: string;
	/** 显示图标 */
	icon: string;
}

/**
 * 默认时间字段选项（标签在每次访问时通过 i18n 解析）
 */
export const DEFAULT_DATE_FIELD_OPTIONS: DateFieldOption[] = [
	{ value: 'createdDate', get label() { return i18n.t('toolbar.fieldSelector.createdDate'); }, icon: '➕' },
	{ value: 'startDate', get label() { return i18n.t('toolbar.fieldSelector.startDate'); }, icon: '🛫' },
	{ value: 'scheduledDate', get label() { return i18n.t('toolbar.fieldSelector.scheduledDate'); }, icon: '⏳' },
	{ value: 'dueDate', get label() { return i18n.t('toolbar.fieldSelector.dueDate'); }, icon: '📅' },
	{ value: 'completionDate', get label() { return i18n.t('toolbar.fieldSelector.completionDate'); }, icon: '✅' },
	{ value: 'cancelledDate', get label() { return i18n.t('toolbar.fieldSelector.cancelledDate'); }, icon: '❌' }
];

/**
 * 字段选择器配置选项
 */
export interface FieldSelectorOptions {
	/** 当前选中的字段 */
	currentField: DateFieldType;
	/** 字段变化回调 */
	onFieldChange: (field: DateFieldType) => void;
	/** 标签文本 */
	label?: string;
	/** 要排除的字段选项 */
	excludeFields?: DateFieldType[];
	/** 自定义字段选项 */
	customOptions?: DateFieldOption[];
	/** 容器样式类 */
	containerClass?: string;
}

/**
 * 渲染字段选择器（下拉选择时间字段类型）
 *
 * 特性：
 * - 下拉选择时间字段
 * - 支持自定义标签
 * - 支持排除某些字段选项
 * - 支持自定义字段选项列表
 *
 * @param container 容器元素
 * @param options 配置选项
 * @returns 包含更新函数和清理函数的对象
 */
export function renderFieldSelector(
	container: HTMLElement,
	options: FieldSelectorOptions
): { updateValue: (field: DateFieldType) => void; cleanup: () => void } {
	const {
		currentField,
		onFieldChange,
		label = i18n.t('toolbar.fieldSelector.defaultLabel'),
		excludeFields = [],
		customOptions,
		containerClass
	} = options;
	const classes = ToolbarClasses.components.fieldSelector;

	// 创建字段筛选组
	const fieldFilterGroup = container.createDiv(classes.group);
	if (containerClass) fieldFilterGroup.addClass(containerClass);

	// 创建标签
	const fieldLabel = fieldFilterGroup.createEl('span', {
		text: label,
		cls: classes.label
	});

	// 创建选择器
	const fieldSelect = fieldFilterGroup.createEl('select', {
		cls: classes.select
	});

	// 获取字段选项
	const fieldOptions = customOptions || DEFAULT_DATE_FIELD_OPTIONS;

	// 添加选项
	fieldOptions.forEach((option) => {
		if (excludeFields.includes(option.value)) return;

		const opt = activeDocument.createElement('option');
		opt.value = option.value;
		opt.textContent = `${option.icon} ${option.label}`;
		fieldSelect.appendChild(opt);
	});

	// 设置当前值
	fieldSelect.value = currentField;

	// 绑定变化事件
	fieldSelect.addEventListener('change', (e) => {
		const value = (e.target as HTMLSelectElement).value as DateFieldType;
		onFieldChange(value);
	});

	/**
	 * 更新当前选中的字段
	 */
	const updateValue = (field: DateFieldType) => {
		fieldSelect.value = field;
	};

	// 清理函数
	const cleanup = () => {
		fieldSelect.remove();
		fieldLabel.remove();
		fieldFilterGroup.remove();
	};

	return { updateValue, cleanup };
}

/**
 * 创建双字段选择器（开始时间+结束时间）
 */
export interface DualFieldSelectorOptions {
	startField: DateFieldType;
	endField: DateFieldType;
	onStartFieldChange: (field: DateFieldType) => void;
	onEndFieldChange: (field: DateFieldType) => void;
	containerClass?: string;
	excludeFields?: DateFieldType[];
}

export function renderDualFieldSelector(
	container: HTMLElement,
	options: DualFieldSelectorOptions
): { updateStart: (field: DateFieldType) => void; updateEnd: (field: DateFieldType) => void; cleanup: () => void } {
	const {
		startField,
		endField,
		onStartFieldChange,
		onEndFieldChange,
		containerClass,
		excludeFields = []
	} = options;
	const classes = ToolbarClasses.components.fieldSelector;

	const wrapper = container.createDiv(classes.dualWrapperGantt);
	if (containerClass) wrapper.addClass(containerClass);

	// 开始时间选择器
	const startResult = renderFieldSelector(wrapper, {
		currentField: startField,
		onFieldChange: onStartFieldChange,
		label: i18n.t('toolbar.fieldSelector.startTime'),
		excludeFields
	});

	// 结束时间选择器
	const endResult = renderFieldSelector(wrapper, {
		currentField: endField,
		onFieldChange: onEndFieldChange,
		label: i18n.t('toolbar.fieldSelector.endTime'),
		excludeFields
	});

	// 清理函数
	const cleanup = () => {
		startResult.cleanup();
		endResult.cleanup();
		wrapper.remove();
	};

	return {
		updateStart: startResult.updateValue,
		updateEnd: endResult.updateValue,
		cleanup
	};
}

/**
 * 创建简化版字段选择器（甘特图专用）
 */
export interface GanttFieldSelectorOptions extends Omit<FieldSelectorOptions, 'label'> {
	/** 选择器类型：start 或 end */
	selectorType: 'start' | 'end';
}

export function renderGanttFieldSelector(
	container: HTMLElement,
	options: GanttFieldSelectorOptions
): { updateValue: (field: DateFieldType) => void; cleanup: () => void } {
	const { selectorType, ...rest } = options;

	return renderFieldSelector(container, {
		...rest,
		label: selectorType === 'start' ? i18n.t('toolbar.fieldSelector.startTime') : i18n.t('toolbar.fieldSelector.endTime')
	});
}
