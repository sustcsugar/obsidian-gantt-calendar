import { App, Notice, TFile } from 'obsidian';
import type { GCTask } from '../../types';
import { Logger } from '../../utils/logger';
import { i18n } from '../../i18n/i18n';

/**
 * 删除任务
 * 从文件中删除任务所在行，不保留空行
 * @param app Obsidian App 实例
 * @param task 要删除的任务
 * @param onRefresh 刷新回调
 */
export async function deleteTask(
	app: App,
	task: GCTask,
	onRefresh: () => void
): Promise<void> {
	try {
		const file = app.vault.getAbstractFileByPath(task.filePath);
		if (!(file instanceof TFile)) {
			new Notice(i18n.t('contextMenu.commands.deleteTask.fileNotFound'));
			return;
		}

		const content = await app.vault.read(file);
		const lines = content.split('\n');
		const taskLineIndex = task.lineNumber - 1;

		if (taskLineIndex < 0 || taskLineIndex >= lines.length) {
			new Notice(i18n.t('contextMenu.commands.deleteTask.invalidLineNumber'));
			return;
		}

		// 删除任务所在行
		lines.splice(taskLineIndex, 1);

		// 写回文件
		const newContent = lines.join('\n');
		await app.vault.modify(file, newContent);

		new Notice(i18n.t('contextMenu.commands.deleted'));
		onRefresh();
	} catch (error) {
		Logger.error('deleteTask', 'Failed to delete task:', error);
		new Notice(i18n.t('contextMenu.commands.deleteFailed'));
	}
}
