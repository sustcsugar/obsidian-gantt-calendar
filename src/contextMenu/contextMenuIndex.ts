/**
 * @fileoverview 右键菜单注册
 * @module contextMenu/contextMenuIndex
 */

import { App, Menu, setIcon } from 'obsidian';
import type { GCTask } from '../types';
import { createNoteFromTask } from './commands/createNoteFromTask';
import { createNoteFromTaskAlias } from './commands/createNoteFromTaskAlias';
import { openEditTaskModal } from './commands/editTask';
import { deleteTask } from './commands/deleteTask';
import { cancelTask } from './commands/cancelTask';
import { restoreTask } from './commands/restoreTask';
import { setTaskPriority } from './commands/setPriority';
import { postponeTask } from './commands/postponeTask';

/**
 * 注册任务右键菜单
 * @param taskElement 任务元素
 * @param task 任务对象
 * @param app Obsidian App 实例
 * @param enabledFormats 启用的任务格式
 * @param defaultNotePath 默认笔记路径
 * @param onRefresh 刷新回调
 */
export function registerTaskContextMenu(
	taskElement: HTMLElement,
	task: GCTask,
	app: App,
	enabledFormats: string[],
	defaultNotePath: string,
	onRefresh: () => void
): void {
	taskElement.addEventListener('contextmenu', (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		const menu = new Menu();

		// 编辑任务（统一模态框）
		menu.addItem((item) => {
			item
				.setTitle('编辑任务')
				.setIcon('pencil')
				   .onClick(() => {
					   openEditTaskModal(app, task, enabledFormats, () => {
						   onRefresh();
					   }, true);
				   });
		});



		// 分隔线
		menu.addSeparator();

		// 创建任务笔记:同名
		menu.addItem((item) => {
			item
				.setTitle('创建任务笔记:同名')
				.setIcon('file-plus')
				.onClick(() => {
					createNoteFromTask(app, task, defaultNotePath, enabledFormats);
				});
		});

		// 创建任务笔记:别名
		menu.addItem((item) => {
			item
				.setTitle('创建任务笔记:别名')
				.setIcon('file-plus')
				.onClick(() => {
					createNoteFromTaskAlias(app, task, defaultNotePath, enabledFormats);
				});
		});

		// 分隔线
		menu.addSeparator();

		// 第一组：设置优先级（6个选项直接显示）
		const priorities: Array<{ value: 'highest' | 'high' | 'medium' | 'low' | 'lowest' | 'normal', label: string, icon: string }> = [
			{ value: 'highest', label: '最高', icon: '🔺' },
			{ value: 'high', label: '高', icon: '⏫' },
			{ value: 'medium', label: '中', icon: '🔼' },
			{ value: 'normal', label: '普通', icon: '◽' },
			{ value: 'low', label: '低', icon: '🔽' },
			{ value: 'lowest', label: '最低', icon: '⏬' },
		];

		priorities.forEach(p => {
			menu.addItem((item) => {
				item.setTitle(`${p.icon} ${p.label}`).onClick(() => {
					setTaskPriority(app, task, p.value, enabledFormats, onRefresh);
				});
			});
		});

		// 分隔线
		menu.addSeparator();

		// 第二组：任务延期（1天、3天、7天）
		const postponeOptions = [
			{ days: 1, label: '延期 1 天' },
			{ days: 3, label: '延期 3 天' },
			{ days: 7, label: '延期 7 天' },
		];

		postponeOptions.forEach(option => {
			menu.addItem((item) => {
				item.setTitle(option.label).setIcon('calendar-clock').onClick(() => {
					postponeTask(app, task, option.days, enabledFormats, onRefresh);
				});
			});
		});

		// 分隔线
		menu.addSeparator();

		// 取消任务/恢复任务 - 根据任务状态动态显示
		const isCancelled = task.cancelled === true;
		menu.addItem((item) => {
			item
				.setTitle(isCancelled ? '恢复任务' : '取消任务')
				.setIcon(isCancelled ? 'rotate-ccw' : 'x')
				.onClick(() => {
					if (isCancelled) {
						restoreTask(app, task, enabledFormats, onRefresh);
					} else {
						cancelTask(app, task, enabledFormats, onRefresh);
					}
				});
		});

		// 删除任务
		menu.addItem((item) => {
			item
				.setTitle('删除任务')
				.setIcon('trash')
				.onClick(() => {
					deleteTask(app, task, onRefresh);
				});
		});

		menu.showAtMouseEvent(e);
	});
}
