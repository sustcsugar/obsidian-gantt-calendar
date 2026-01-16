/**
 * 创建任务按钮组件
 *
 * 在工具栏渲染创建任务按钮，点击触发 CreateTaskModal
 * 使用与导航按钮相同的下凹底座样式
 */

import type GanttCalendarPlugin from '../../../main';
import { setIcon } from 'obsidian';
import { CreateTaskModal } from '../../modals/CreateTaskModal';
import { CreateTaskButtonClasses, ToolbarClasses } from '../../utils/bem';

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
	const { plugin, targetDate } = options;

	// 创建下凹底座容器（与导航按钮组样式一致）
	const buttonGroup = container.createDiv(ToolbarClasses.components.navButtons.group);

	// 创建按钮
	const createBtn = buttonGroup.createEl('button', {
		cls: ToolbarClasses.components.navButtons.btn,
		attr: { title: '创建新任务', 'aria-label': '创建新任务' }
	});

	// 添加样式类
	createBtn.addClass(CreateTaskButtonClasses.block);
	createBtn.addClass(CreateTaskButtonClasses.modifiers.toolbar);

	// 使用图标
	setIcon(createBtn, 'plus');

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
		cleanup: () => buttonGroup.remove()
	};
}
