import { type JSX } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useCalendarStore } from './store/calendarStore';
import { ToolbarBar } from './components/Toolbar';
import { MobileNavDock } from './components/MobileNavDock';
import { TooltipProvider } from './components/TooltipProvider';
import { ModalProvider } from './components/ModalProvider';
import { YearView } from './views/YearView';
import { MonthView } from './views/MonthView';
import { WeekView } from './views/WeekView';
import { DayView } from './views/DayView';
import { TaskView } from './views/TaskView';
import { GanttView } from './views/GanttView';
import { CalendarSkeleton } from './components/CalendarSkeleton';
import type { CalendarViewType } from '../types';
import { MOTION, easeOutTransition } from './motion';
import { useEffect } from 'react';
import { isPhoneNow } from './utils/platform';

function renderView(viewType: CalendarViewType): JSX.Element {
	switch (viewType) {
		case 'year':
			return <YearView />;
		case 'month':
			return <MonthView />;
		case 'week':
			return <WeekView />;
		case 'day':
			return <DayView />;
		case 'task':
			return <TaskView />;
		case 'gantt':
			return <GanttView />;
	}
}

/**
 * React 应用根组件
 * 结构：.gantt-calendar-app > (.calendar-toolbar + .calendar-content)
 */
export function App(): JSX.Element {
	// 视图形态类手机样式信号（CSS 用 body.gc-is-phone 作用域，桌面窄窗口不触发）
	useEffect(() => {
		document.body.classList.toggle('gc-is-phone', isPhoneNow());
		return () => document.body.classList.remove('gc-is-phone');
	}, []);

	const viewTypeRaw = useCalendarStore((s) => s.viewType);
	const settingsVersion = useCalendarStore((s) => s.settingsVersion);
	const tasksReady = useCalendarStore((s) => s.tasksReady);

	// 手机端形态：工具栏取消（改 MobileNavDock 悬浮菜单），且不提供甘特图
	// （触屏拖拽/列宽操作不可用；若缓存视图为甘特则回退周视图）
	const isPhone = isPhoneNow();
	const viewType: CalendarViewType = isPhone && viewTypeRaw === 'gantt' ? 'week' : viewTypeRaw;

	const isGantt = viewType === 'gantt';
	const isWaterfall = viewType === 'day' || viewType === 'week' || viewType === 'task' || viewType === 'year';

	return (
		<ModalProvider>
			<TooltipProvider>
				<div
					className={`gantt-calendar-app${isGantt ? ' gantt-root' : ''}`}
					style={{ overflow: isWaterfall ? 'auto' : undefined, height: '100%' }}
				>
					{isPhone ? <MobileNavDock /> : <ToolbarBar />}
					<AnimatePresence mode="wait" initial={false}>
						{!isGantt ? (
							<motion.div
								key={`${viewType}-${settingsVersion}`}
								className={`calendar-content${isGantt ? ' gantt-mode' : ''}`}
								style={{ overflow: isWaterfall ? 'visible' : undefined }}
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={easeOutTransition(MOTION.dur.normal)}
							>
								{tasksReady ? renderView(viewType) : <CalendarSkeleton />}
							</motion.div>
						) : (
							<div
								key={`gantt-${settingsVersion}`}
								className="calendar-content gantt-mode"
							>
								{tasksReady ? <GanttView /> : <CalendarSkeleton />}
							</div>
						)}
					</AnimatePresence>
				</div>
			</TooltipProvider>
		</ModalProvider>
	);
}
