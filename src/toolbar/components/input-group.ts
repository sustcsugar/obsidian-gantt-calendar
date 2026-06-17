/**
 * @fileoverview 输入组组件（标签+输入框组合）
 * @module toolbar/components/input-group
 */

import { ToolbarClasses } from '../../utils/bem';

/**
 * 输入组配置选项
 */
export interface InputGroupOptions {
	/** 标签文本 */
	label: string;
	/** 输入框类型 */
	inputType: 'text' | 'date' | 'number' | 'datetime-local';
	/** 当前值 */
	value: string;
	/** 值变化回调 */
	onChange: (value: string) => void;
	/** 输入框占位符 */
	placeholder?: string;
	/** 输入框是否禁用 */
	disabled?: boolean;
	/** 输入框只读 */
	readonly?: boolean;
	/** 输入框最大长度 */
	maxLength?: number;
	/** 容器样式类 */
	groupClass?: string;
	/** 标签样式类 */
	labelClass?: string;
	/** 输入框样式类 */
	inputClass?: string;
}

/**
 * 渲染输入组（标签+输入框组合）
 *
 * 特性：
 * - 统一的标签和输入框布局
 * - 支持多种输入类型
 * - 支持自定义样式类
 *
 * @param container 容器元素
 * @param options 配置选项
 * @returns 包含输入框元素和清理函数的对象
 */
export function renderInputGroup(
	container: HTMLElement,
	options: InputGroupOptions
): { inputEl: HTMLInputElement; cleanup: () => void } {
	const {
		label,
		inputType,
		value,
		onChange,
		placeholder,
		disabled = false,
		readonly = false,
		maxLength,
		groupClass,
		labelClass,
		inputClass
	} = options;

	// 创建输入组容器
	const group = container.createDiv(ToolbarClasses.components.inputGroup.group);
	if (groupClass) group.addClass(groupClass);

	// 创建标签
	const labelEl = group.createEl('span', { text: label });
	if (labelClass) labelEl.addClass(labelClass);

	// 创建输入框
	const inputEl = group.createEl('input', {
		cls: inputClass || 'calendar-input',
		attr: {
			type: inputType,
			placeholder: placeholder || ''
		}
	});

	inputEl.value = value;
	if (disabled) inputEl.disabled = true;
	if (readonly) inputEl.readOnly = true;
	if (maxLength) inputEl.maxLength = maxLength;

	// 绑定输入事件
	inputEl.addEventListener('change', () => {
		onChange(inputEl.value);
	});

	inputEl.addEventListener('input', () => {
		// 对于某些类型，即时响应输入
		if (inputType === 'text') {
			onChange(inputEl.value);
		}
	});

	// 清理函数
	const cleanup = () => {
		inputEl.remove();
		labelEl.remove();
		group.remove();
	};

	return { inputEl, cleanup };
}

/**
 * 创建带单位的输入组
 */
export interface InputWithUnitOptions extends Omit<InputGroupOptions, 'onChange'> {
	onChange: (value: number) => void;
	unit?: string;
	min?: number;
	max?: number;
	step?: number;
}

export function renderNumberInputGroup(
	container: HTMLElement,
	options: InputWithUnitOptions
): { inputEl: HTMLInputElement; cleanup: () => void } {
	const {
		unit = '',
		min,
		max,
		step = 1,
		...rest
	} = options;

	const result = renderInputGroup(container, {
		...rest,
		inputType: 'number',
		onChange: (value) => {
			const numValue = parseFloat(value);
			if (!isNaN(numValue)) {
				options.onChange(numValue);
			}
		}
	});

	const inputEl = result.inputEl;

	if (min !== undefined) inputEl.min = min.toString();
	if (max !== undefined) inputEl.max = max.toString();
	if (step !== undefined) inputEl.step = step.toString();

	// 如果有单位，添加单位显示
	if (unit) {
		const unitSpan = container.createDiv('calendar-input-unit');
		unitSpan.setText(unit);
	}

	return result;
}
