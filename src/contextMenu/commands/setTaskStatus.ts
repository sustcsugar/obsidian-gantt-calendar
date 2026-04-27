import { App, Notice } from 'obsidian';
import type { GCTask } from '../../types';
import type { TaskStatusType } from '../../tasks/taskStatus';
import { updateTaskProperties } from '../../tasks/taskUpdater';
import { getStatusByKey } from '../../tasks/taskStatus';
import { Logger } from '../../utils/logger';

/**
 * 设置任务状态
 * @param app Obsidian App 实例
 * @param task 任务对象
 * @param status 目标状态 key
 * @param enabledFormats 启用的任务格式
 * @param onRefresh 刷新回调
 */
export async function setTaskStatus(
	app: App,
	task: GCTask,
	status: TaskStatusType,
	enabledFormats: string[],
	onRefresh: () => void
): Promise<void> {
	try {
		await updateTaskProperties(app, task, { status }, enabledFormats);

		const statusInfo = getStatusByKey(status);
		const label = statusInfo ? statusInfo.name : status;
		new Notice(`任务状态已更新为：${label}`);
		onRefresh();
	} catch (err) {
		Logger.error('setTaskStatus', 'Failed to update task status', err);
		new Notice('更新任务状态失败');
	}
}
