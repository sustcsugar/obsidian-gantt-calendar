/**
 * 创建任务按钮组件
 *
 * 在工具栏渲染创建任务按钮，点击触发 CreateTaskModal
 */

import type GanttCalendarPlugin from '../../../main';
import { CreateTaskModal } from '../../modals/CreateTaskModal';
import { CreateTaskButtonClasses } from '../../utils/bem';

/**
 * 创建任务按钮选项
 */
export interface CreateTaskButtonOptions {
	plugin: GanttCalendarPlugin;
	targetDate?: Date;
	buttonClass?: string;
}

/**
 * 渲染创建任务按钮
 *
 * @param container 容器元素
 * @param options 按钮选项
 * @returns 清理函数
 */
export function renderCreateTaskButton(
	container: HTMLElement,
	options: CreateTaskButtonOptions
): { cleanup: () => void } {
	const { plugin, targetDate, buttonClass = 'calendar-nav-compact-btn' } = options;

	// 创建按钮
	const createBtn = container.createEl('button', {
		text: '➕',
		attr: { title: '创建新任务' }
	});

	// 添加样式类
	createBtn.addClass(buttonClass);
	createBtn.addClass(CreateTaskButtonClasses.block);
	createBtn.addClass(CreateTaskButtonClasses.modifiers.toolbar);

	// 点击事件
	createBtn.addEventListener('click', () => {
		const modal = new CreateTaskModal({
			app: plugin.app,
			plugin: plugin,
			targetDate: targetDate || new Date(),
			onSuccess: async () => {
				// 刷新任务缓存（重新初始化）
				await plugin.taskCache.initialize(plugin.settings.globalTaskFilter, plugin.settings.enabledTaskFormats);
				// 刷新所有视图
				plugin.refreshCalendarViews();
			}
		});
		modal.open();
	});

	return {
		cleanup: () => createBtn.remove()
	};
}
