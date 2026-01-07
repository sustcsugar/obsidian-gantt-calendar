import { App, Notice } from 'obsidian';
import type { GCTask } from '../../types';
import { updateTaskProperties } from '../../tasks/taskUpdater';

/**
 * 设置任务优先级
 * @param app Obsidian App 实例
 * @param task 任务对象
 * @param priority 优先级值
 * @param enabledFormats 启用的任务格式
 * @param onRefresh 刷新回调
 */
export async function setTaskPriority(
	app: App,
	task: GCTask,
	priority: 'highest' | 'high' | 'medium' | 'low' | 'lowest' | 'normal',
	enabledFormats: string[],
	onRefresh: () => void
): Promise<void> {
	try {
		const updates = {
			priority: priority
		};

		await updateTaskProperties(app, task, updates, enabledFormats);
		onRefresh();
		new Notice('优先级已更新');
	} catch (err) {
		console.error('Failed to update task priority', err);
		new Notice('更新优先级失败');
	}
}
