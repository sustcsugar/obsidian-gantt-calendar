import { useState, type JSX } from 'react';
import { SidebarClasses, withModifiers } from '../../utils/bem';
import { i18n } from '../../i18n/i18n';
import { Icon } from '../components/Icon';
import { TaskListPanel } from './TaskListPanel';
import { DailyTimelinePanel } from './DailyTimelinePanel';
import { CalendarSkeleton } from '../components/CalendarSkeleton';
import { useCalendarStore } from '../store/calendarStore';

type SidebarTab = 'taskList' | 'dailyTimeline';

/**
 * 侧边栏 React 外壳：Tab 切换 + 内容区
 * 两个面板同时挂载，通过 display 显隐切换（保留各面板内部状态）
 */
export function SidebarApp(): JSX.Element {
	const [tab, setTab] = useState<SidebarTab>('dailyTimeline');
	const tasksReady = useCalendarStore((s) => s.tasksReady);

	const switchTab = (next: SidebarTab) => {
		if (tab === next) return;
		setTab(next);
	};

	return (
		<div className={SidebarClasses.block}>
			<div className={SidebarClasses.elements.tabBar}>
				<div
					className={withModifiers(
						SidebarClasses.elements.tabBtn,
						tab === 'taskList' ? SidebarClasses.elements.tabBtnActive : undefined
					)}
					onClick={() => switchTab('taskList')}
				>
					<Icon icon="list" />
					<span> {i18n.t('sidebar.tabTitles.taskList')}</span>
				</div>
				<div
					className={withModifiers(
						SidebarClasses.elements.tabBtn,
						tab === 'dailyTimeline' ? SidebarClasses.elements.tabBtnActive : undefined
					)}
					onClick={() => switchTab('dailyTimeline')}
				>
					<Icon icon="clock" />
					<span> {i18n.t('sidebar.tabTitles.dailyTimeline')}</span>
				</div>
			</div>
			<div className={SidebarClasses.elements.content}>
				{tasksReady ? (
					<>
						<div style={{ display: tab === 'taskList' ? undefined : 'none' }}>
							<TaskListPanel />
						</div>
						<div style={{ display: tab === 'dailyTimeline' ? undefined : 'none' }}>
							<DailyTimelinePanel />
						</div>
					</>
				) : (
					<CalendarSkeleton />
				)}
			</div>
		</div>
	);
}
