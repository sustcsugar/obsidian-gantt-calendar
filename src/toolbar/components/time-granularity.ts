/**
 * @fileoverview 时间颗粒度选择按钮组件
 * @module toolbar/components/time-granularity
 */

import { ToolbarClasses } from '../../utils/bem';
import { i18n } from '../../i18n/i18n';

export type TimeGranularity = 'day' | 'week' | 'month';

export interface TimeGranularityOptions {
	current: TimeGranularity;
	onChange: (granularity: TimeGranularity) => void;
}

/**
 * 渲染时间颗粒度选择按钮组（日/周/月）
 *
 * @param container 容器元素
 * @param options 配置选项
 */
export function renderTimeGranularity(
	container: HTMLElement,
	options: TimeGranularityOptions
): void {
	// 创建颗粒度选择容器
	const granularityGroup = container.createDiv(ToolbarClasses.components.navButtons.group);

	const granularities: Array<{ value: TimeGranularity; label: string }> = [
		{ value: 'day', label: i18n.t('toolbar.timeGranularity.day') },
		{ value: 'week', label: i18n.t('toolbar.timeGranularity.week') },
		{ value: 'month', label: i18n.t('toolbar.timeGranularity.month') },
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
