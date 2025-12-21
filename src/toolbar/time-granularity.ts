/**
 * 时间颗粒度选择按钮组件
 * 用于甘特图视图，提供日/周/月三种时间颗粒度选择
 */

export type TimeGranularity = 'day' | 'week' | 'month';

export interface TimeGranularityOptions {
  current: TimeGranularity;
  onChange: (granularity: TimeGranularity) => void;
}

/**
 * 渲染时间颗粒度选择按钮组
 */
export function renderTimeGranularity(
  container: HTMLElement,
  options: TimeGranularityOptions,
  onToday?: () => void
): void {
  const group = container.createDiv('toolbar-time-granularity-group');

  // 今天按钮
  const todayBtn = group.createEl('button', {
    cls: 'time-today-btn',
    text: '今',
  });
  todayBtn.addEventListener('click', () => {
    onToday?.();
  });

  const granularities: Array<{ value: TimeGranularity; label: string }> = [
    { value: 'day', label: '日' },
    { value: 'week', label: '周' },
    { value: 'month', label: '月' },
  ];

  granularities.forEach(({ value, label }) => {
    const btn = group.createEl('button', {
      cls: 'time-granularity-btn',
      text: label,
    });

    if (value === options.current) {
      btn.addClass('active');
    }

    btn.addEventListener('click', () => {
      // 移除所有按钮的 active 状态
      group.querySelectorAll('.time-granularity-btn').forEach((b) => {
        b.removeClass('active');
      });
      // 添加当前按钮的 active 状态
      btn.addClass('active');
      // 触发回调
      options.onChange(value);
    });
  });
}
