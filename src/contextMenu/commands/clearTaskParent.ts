import type { App } from 'obsidian';
import type { GCTask } from '../../types';
import { clearParent, notifyHierarchyError } from '../../tasks/taskHierarchyUpdater';
import { refreshTaskView } from '../../tasks/taskUpdater';
import { taskUndo } from '../../tasks/taskUndo';
import { i18n } from '../../i18n/i18n';

/**
 * 取消父子关系（只删除 parent 字段，保留 tid）
 *
 * @param app Obsidian App 实例
 * @param task 任务对象
 * @param enabledFormats 启用的任务格式
 * @param onRefresh 刷新回调
 */
export async function clearTaskParent(
	app: App,
	task: GCTask,
	enabledFormats: string[],
	onRefresh: () => void
): Promise<void> {
	try {
		const result = await clearParent(app, task, enabledFormats);
		if (!result.changed) return;

		await refreshTaskView(app, task.filePath);

		if (result.metadataFields) {
			taskUndo.registerProperty({
				app,
				oldTask: task,
				updates: { metadataFields: result.metadataFields },
				enabledFormats,
				onRefresh,
			}, i18n.t('taskHierarchy.cleared'));
		}
		onRefresh();
	} catch (error) {
		notifyHierarchyError(error);
	}
}
