import type { CalendarViewType } from '../types';
import { ToolbarClasses } from '../utils/bem';

/**
 * 工具栏左侧区域 - 视图选择器
 * 负责渲染 Tasks/Calendar 切换按钮
 */
export class ToolbarLeft {
	/**
	 * 渲染左侧区域
	 * @param container 左侧容器元素（类名已在 toolbar.ts 中设置）
	 * @param currentViewType 当前视图类型
	 * @param lastCalendarViewType 上一次的日历视图类型
	 * @param onViewSwitch 视图切换回调
	 */
	render(
		container: HTMLElement,
		currentViewType: CalendarViewType,
		lastCalendarViewType: CalendarViewType,
		onViewSwitch: (type: CalendarViewType) => void
	): void {
		container.empty();

		const isTaskView = currentViewType === 'task';
		const isGanttView = currentViewType === 'gantt';

		// 创建切换按钮组
		const toggleGroup = container.createDiv(ToolbarClasses.components.viewToggle.group);

		// Tasks 按钮
		const taskToggle = toggleGroup.createEl('button', { text: 'Tasks' });
		taskToggle.addClass(ToolbarClasses.components.viewToggle.btn);
		if (isTaskView) taskToggle.addClass(ToolbarClasses.components.viewToggle.btnActive);
		taskToggle.onclick = () => onViewSwitch('task');

		// Calendar 按钮
		const calendarToggle = toggleGroup.createEl('button', { text: 'Calendar' });
		calendarToggle.addClass(ToolbarClasses.components.viewToggle.btn);
		if (!isTaskView && !isGanttView) calendarToggle.addClass(ToolbarClasses.components.viewToggle.btnActive);
		calendarToggle.onclick = () => {
			// 切换回日历视图时，使用上一次的日历视图类型（默认为 month）
			const target = lastCalendarViewType || 'month';
			onViewSwitch(target);
		};

		// Gantt 按钮
		const ganttToggle = toggleGroup.createEl('button', { text: 'Gantt' });
		ganttToggle.addClass(ToolbarClasses.components.viewToggle.btn);
		if (isGanttView) ganttToggle.addClass(ToolbarClasses.components.viewToggle.btnActive);
		ganttToggle.onclick = () => onViewSwitch('gantt');
	}
}
