/**
 * 时间颗粒度选择按钮组件
 * 用于甘特图视图，提供日/周/月三种时间颗粒度选择
 */

import { ToolbarClasses } from '../../utils/bem';

export type TimeGranularity = 'day' | 'week' | 'month';

export interface TimeGranularityOptions {
	current: TimeGranularity;
	onChange: (granularity: TimeGranularity) => void;
}

/**
 * 渲染时间颗粒度选择按钮组
 * 将"今"按钮和颗粒度选择按钮分为两个独立的下凹按钮组
 */
export function renderTimeGranularity(
	container: HTMLElement,
	options: TimeGranularityOptions,
	onToday?: () => void
): void {
	// 1. "今"按钮独立容器（使用下凹样式）
	const todayGroup = container.createDiv(ToolbarClasses.components.navButtons.group);
	const todayBtn = todayGroup.createEl('button', {
		cls: ToolbarClasses.components.navButtons.btn,
		text: '今',
	});
	todayBtn.addEventListener('click', () => {
		onToday?.();
	});

	// 2. 颗粒度选择容器（日周月，使用下凹样式）
	const granularityGroup = container.createDiv(ToolbarClasses.components.navButtons.group);

	const granularities: Array<{ value: TimeGranularity; label: string }> = [
		{ value: 'day', label: '日' },
		{ value: 'week', label: '周' },
		{ value: 'month', label: '月' },
	];

	granularities.forEach(({ value, label }) => {
		const btn = granularityGroup.createEl('button', {
			cls: ToolbarClasses.components.navButtons.btn,
			text: label,
		});

		if (value === options.current) {
			btn.classList.add('active');
		}

		btn.addEventListener('click', () => {
			// 移除所有按钮的 active 状态
			granularityGroup.querySelectorAll('.gc-toolbar__btn').forEach((b) => {
				b.classList.remove('active');
			});
			// 添加当前按钮的 active 状态
			btn.classList.add('active');
			// 触发回调
			options.onChange(value);
		});
	});
}
