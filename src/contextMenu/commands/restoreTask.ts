import { App, Notice } from 'obsidian';
import type { GanttTask } from '../../types';
import { updateTaskProperties } from '../../tasks/taskUpdater';

/**
 * 恢复已取消的任务
 * 将任务的复选框从 [/] 改为 [ ]，并清除取消日期
 * @param app Obsidian App 实例
 * @param task 要恢复的任务
 * @param enabledFormats 启用的任务格式
 * @param onRefresh 刷新回调
 */
export async function restoreTask(
	app: App,
	task: GanttTask,
	enabledFormats: string[],
	onRefresh: () => void
): Promise<void> {
	try {
		// 如果任务已完成，不能恢复
		if (task.completed) {
			new Notice('恢复任务失败:任务已完成');
			return;
		}

		// 如果任务不是取消状态（已经是正常状态），提示已经恢复
		if (!task.cancelled) {
			new Notice('恢复任务失败:任务已经恢复');
			return;
		}

		// 更新任务状态：取消取消状态，并清除取消日期
		await updateTaskProperties(app, task, {
			status: 'todo',
			cancelled: false,
			cancelledDate: null
		}, enabledFormats);

		new Notice('任务已恢复');
		onRefresh();
	} catch (error) {
		console.error('Failed to restore task:', error);
		new Notice('恢复任务失败');
	}
}
