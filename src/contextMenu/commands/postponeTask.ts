import { App, Notice } from 'obsidian';
import type { GCTask } from '../../types';
import { updateTaskProperties } from '../../tasks/taskUpdater';

/**
 * 任务延期（增加天数）
 * 只延期截止日期，如果没有截止日期，则以当前日期为起点添加延期后的日期
 * @param app Obsidian App 实例
 * @param task 任务对象
 * @param days 延期天数
 * @param enabledFormats 启用的任务格式
 * @param onRefresh 刷新回调
 */
export async function postponeTask(
	app: App,
	task: GCTask,
	days: number,
	enabledFormats: string[],
	onRefresh: () => void
): Promise<void> {
	try {
		const updates: any = {};

		// 如果有截止日期，基于截止日期延期
		if (task.dueDate) {
			const newDate = new Date(task.dueDate);
			newDate.setDate(newDate.getDate() + days);
			updates.dueDate = newDate;
		} else {
			// 如果没有截止日期，以当前日期为起点添加截止日期
			const newDate = new Date();
			newDate.setDate(newDate.getDate() + days);
			updates.dueDate = newDate;
		}

		await updateTaskProperties(app, task, updates, enabledFormats);
		onRefresh();
		new Notice(`任务已延期 ${days} 天`);
	} catch (err) {
		console.error('Failed to postpone task', err);
		new Notice('延期失败');
	}
}
