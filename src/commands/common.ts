import { GC_VIEW_ID, GCMainView } from '../GCMainView';
import { GC_SIDEBAR_VIEW_ID } from '../GCSidebarView';
import { activateSidebarView } from '../managers/ViewManager';
import type GanttCalendarPlugin from '../../main';
import { i18n } from '../i18n/i18n';

/**
 * 注册简单命令（通用功能）
 * @param plugin 插件实例
 */
export function registerCommonCommands(plugin: GanttCalendarPlugin): void {
	// 打开日历视图
	plugin.addCommand({
		id: 'open-calendar-view',
		name: i18n.t('commands.openCalendarView'),
		callback: async () => {
			await plugin.activateView();
			const leaf = plugin.app.workspace.getLeavesOfType(GC_VIEW_ID)[0];
			const view = leaf?.view as unknown as GCMainView | undefined;
			if (view) {
				view.switchView('month');
			}
		}
	});

	// 打开任务视图
	plugin.addCommand({
		id: 'open-task-view',
		name: i18n.t('commands.openTaskView'),
		callback: async () => {
			await plugin.activateView();
			const leaf = plugin.app.workspace.getLeavesOfType(GC_VIEW_ID)[0];
			const view = leaf?.view as unknown as GCMainView | undefined;
			if (view) {
				view.switchView('task');
			}
		}
	});

	// 打开侧边栏视图
	plugin.addCommand({
		id: 'open-sidebar-view',
		name: i18n.t('commands.openSidebarView'),
		callback: async () => {
			await activateSidebarView(plugin.app);
		}
	});

}
