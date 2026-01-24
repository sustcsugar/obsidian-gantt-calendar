import { GC_VIEW_ID } from '../GCMainView';
import type GanttCalendarPlugin from '../../main';

/**
 * 注册简单命令（通用功能）
 * @param plugin 插件实例
 */
export function registerCommonCommands(plugin: GanttCalendarPlugin): void {
	// 打开日历视图
	plugin.addCommand({
		id: 'open-calendar-view',
		name: '打开日历视图',
		callback: async () => {
			await plugin.activateView();
			const leaf = plugin.app.workspace.getLeavesOfType(GC_VIEW_ID)[0];
			const view = leaf?.view as any;
			if (view?.switchView) {
				view.switchView('month');
			}
		}
	});

	// 打开任务视图
	plugin.addCommand({
		id: 'open-task-view',
		name: '打开任务视图',
		callback: async () => {
			await plugin.activateView();
			const leaf = plugin.app.workspace.getLeavesOfType(GC_VIEW_ID)[0];
			const view = leaf?.view as any;
			if (view?.switchView) {
				view.switchView('task');
			}
		}
	});

}
