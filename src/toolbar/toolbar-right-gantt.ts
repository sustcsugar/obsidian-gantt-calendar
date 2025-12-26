import type { GanttViewRenderer } from '../views/GanttView';
import { renderStatusFilter } from './status-filter';
import { renderRefreshButton } from './refresh-button';
import { renderTimeGranularity } from './time-granularity';
import { renderSortButton } from './sort-button';

/**
 * 工具栏右侧区域 - 甘特视图功能区
 */
export class ToolbarRightGantt {
  render(
    container: HTMLElement,
    ganttRenderer: GanttViewRenderer,
    onRefresh: () => Promise<void>
  ): void {
    container.empty();
    container.addClass('toolbar-right-gantt');

    // 时间颗粒度选择按钮
    renderTimeGranularity(
      container,
      {
        current: ganttRenderer.getTimeGranularity(),
        onChange: (granularity) => {
          ganttRenderer.setTimeGranularity(granularity);
          onRefresh(); // 切换颗粒度后刷新视图
        },
      },
      () => {
        ganttRenderer.jumpToToday();
      }
    );

    // 时间字段选择
    const fields: Array<{ key: any; label: string }> = [
      { key: 'createdDate', label: '➕ 创建' },
      { key: 'startDate', label: '🛫 开始' },
      { key: 'scheduledDate', label: '⏳ 计划' },
      { key: 'dueDate', label: '📅 截止' },
      { key: 'completionDate', label: '✅ 完成' },
      { key: 'cancelledDate', label: '❌ 取消' },
    ];

    const fieldGroup = container.createDiv('toolbar-gantt-field-group');
    fieldGroup.createEl('span', { text: '开始时间', cls: 'toolbar-gantt-field-label' });
    const startSelect = fieldGroup.createEl('select', { cls: 'toolbar-gantt-field-select' });
    for (const f of fields) {
      const opt = document.createElement('option');
      opt.value = f.key;
      opt.textContent = f.label;
      startSelect.appendChild(opt);
    }
    startSelect.value = ganttRenderer.getStartField() as string;
    startSelect.addEventListener('change', (e) => {
      ganttRenderer.setStartField((e.target as HTMLSelectElement).value);
      // 不立即刷新，由用户按刷新按钮触发；也可在此直接刷新
    });

    const endGroup = container.createDiv('toolbar-gantt-field-group');
    endGroup.createEl('span', { text: '结束时间', cls: 'toolbar-gantt-field-label' });
    const endSelect = endGroup.createEl('select', { cls: 'toolbar-gantt-field-select' });
    for (const f of fields) {
      const opt = document.createElement('option');
      opt.value = f.key;
      opt.textContent = f.label;
      endSelect.appendChild(opt);
    }
    endSelect.value = ganttRenderer.getEndField() as string;
    endSelect.addEventListener('change', (e) => {
      ganttRenderer.setEndField((e.target as HTMLSelectElement).value);
    });

    // 状态筛选（复用模块）
    renderStatusFilter(container, ganttRenderer.getStatusFilter(), async (v) => {
      ganttRenderer.setStatusFilter(v);
      await onRefresh();
    });

    // 排序按钮
    renderSortButton(container, {
      getCurrentState: () => ganttRenderer.getSortState(),
      onSortChange: async (newState) => {
        ganttRenderer.setSortState(newState);
        await onRefresh();
      }
    });

    // 刷新按钮（共享）
    renderRefreshButton(container, onRefresh, '刷新甘特图');
  }
}
