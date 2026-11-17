import { GC_VIEW_ID, GCMainView } from '../GCMainView';

import { activateSidebarView } from '../managers/ViewManager';
import type GanttCalendarPlugin from '../../main';
import type { CalendarViewType } from '../types';
import { i18n } from '../i18n/i18n';

/** 主视图打开命令的视图类型与 i18n 键映射（注册顺序即命令面板顺序） */
const MAIN_VIEW_COMMANDS: Array<{ view: CalendarViewType; nameKey: string }> = [
	{ view: 'day', nameKey: 'commands.openDayView' },
	{ view: 'week', nameKey: 'commands.openWeekView' },
	{ view: 'month', nameKey: 'commands.openMonthView' },
	{ view: 'year', nameKey: 'commands.openYearView' },
	{ view: 'gantt', nameKey: 'commands.openGanttView' },
	{ view: 'task', nameKey: 'commands.openTaskView' },
];

/**
 * 注册简单命令（通用功能）
 * @param plugin 插件实例
 */
export function registerCommonCommands(plugin: GanttCalendarPlugin): void {
	// 打开主视图并切换到指定视图（日/周/月/年/甘特/任务）
	for (const { view: viewType, nameKey } of MAIN_VIEW_COMMANDS) {
		plugin.addCommand({
			id: `open-${viewType}-view`,
			name: i18n.t(nameKey),
			callback: async () => {
				await plugin.activateView();
				const leaf = plugin.app.workspace.getLeavesOfType(GC_VIEW_ID)[0];
				const view = leaf?.view as unknown as GCMainView | undefined;
				if (view) {
					view.switchView(viewType);
				}
			}
		});
	}

	// 打开侧边栏视图
	plugin.addCommand({
		id: 'open-sidebar-view',
		name: i18n.t('commands.openSidebarView'),
		callback: async () => {
			await activateSidebarView(plugin.app);
		}
	});

}
