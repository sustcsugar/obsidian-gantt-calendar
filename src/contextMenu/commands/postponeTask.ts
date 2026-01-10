import { App, Notice } from 'obsidian';
import type { GCTask } from '../../types';
import { updateTaskProperties } from '../../tasks/taskUpdater';
import { Logger } from '../../utils/logger';

/**
 * 任务延期（增加天数或设置截止日期）
 * @param app Obsidian App 实例
 * @param task 任务对象
 * @param days 延期天数
 * @param enabledFormats 启用的任务格式
 * @param onRefresh 刷新回调
 * @param fromNow 是否从当前日期计算（true=忽略现有截止日期，false=基于现有截止日期延期）
 */
export async function postponeTask(
	app: App,
	task: GCTask,
	days: number,
	enabledFormats: string[],
	onRefresh: () => void,
	fromNow = false
): Promise<void> {
	try {
		const updates: any = {};
		let newDate: Date;

		if (fromNow) {
			// 始终基于当前日期设置
			newDate = new Date();
			newDate.setDate(newDate.getDate() + days);
		} else {
			// 基于截止日期延期，没有截止日期则基于当前日期
			if (task.dueDate) {
				newDate = new Date(task.dueDate);
				newDate.setDate(newDate.getDate() + days);
			} else {
				newDate = new Date();
				newDate.setDate(newDate.getDate() + days);
			}
		}

		updates.dueDate = newDate;

		await updateTaskProperties(app, task, updates, enabledFormats);
		onRefresh();

		const dateStr = newDate.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
		new Notice(fromNow ? `截止日期已设置为 ${dateStr}` : `任务已延期 ${days} 天，到期 ${dateStr}`);
	} catch (err) {
		Logger.error('postponeTask', 'Failed to postpone task', err);
		new Notice('延期失败');
	}
}
