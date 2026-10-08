import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import type { CalendarViewType } from '../../types';
import { ContextMenuClasses } from '../../utils/bem';
import { usePlugin } from '../pluginContext';
import { useCalendarStore } from '../store/calendarStore';
import { i18n } from '../../i18n/i18n';
import { formatDate, getWeekOfDate } from '../../dateUtils/dateUtilsIndex';
import { openCreateTaskModal } from '../modals/TaskFormModal';
import { syncFeishuTasks } from '../../commands/feishuCommands';
import type GanttCalendarPlugin from '../../../main';
import { Icon } from './Icon';
import { MOTION, easeOutTransition } from '../motion';

/**
 * 手机端悬浮导航（MobileNavDock）
 *
 * 手机端不渲染顶部工具栏，改为右下角悬浮汉堡按钮；点击自底部弹出操作面板：
 * 视图切换（手机不提供甘特图）/ 日期导航 / 新建任务 / 同步·刷新·设置。
 * 面板复用 ContextMenu 的底部 sheet 样式（grabber + 46px 菜单项 + safe-area）。
 */

// 手机端视图清单：不含 gantt（触屏拖拽/列宽操作在手机上不可用，信息密度也不适合窄屏）
const PHONE_VIEWS: Array<{ type: CalendarViewType; icon: string }> = [
	{ type: 'day', icon: 'sun' },
	{ type: 'week', icon: 'layout' },
	{ type: 'month', icon: 'grid' },
	{ type: 'year', icon: 'map' },
	{ type: 'task', icon: 'list-checks' },
];

export function MobileNavDock(): JSX.Element {
	const plugin = usePlugin();
	const viewType = useCalendarStore((s) => s.viewType);
	const currentDate = useCalendarStore((s) => s.currentDate);
	const startOnMonday = !!plugin.settings.startOnMonday;
	useCalendarStore((s) => s.settingsVersion);

	const [open, setOpen] = useState(false);
	const fabRef = useRef<HTMLButtonElement | null>(null);
	const sheetRef = useRef<HTMLDivElement | null>(null);

	const close = useCallback(() => setOpen(false), []);

	// 面板打开时：点击面板与 FAB 之外关闭（FAB 自身交给 onClick 切换，避免关了又开）
	useEffect(() => {
		if (!open) return;
		const onPointerDown = (e: PointerEvent) => {
			const target = e.target as Node;
			if (sheetRef.current?.contains(target) || fabRef.current?.contains(target)) return;
			setOpen(false);
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false);
		};
		document.addEventListener('pointerdown', onPointerDown, true);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown, true);
			document.removeEventListener('keydown', onKeyDown);
		};
	}, [open]);

	// ===== 标题（与桌面工具栏同源，给面板顶部提供当前日期上下文） =====
	const titleText = useMemo(() => {
		switch (viewType) {
			case 'year': return String(currentDate.getFullYear());
			case 'month': return (i18n.t('common.monthsAbbr') as unknown as string[])[currentDate.getMonth()];
			case 'week': {
				const week = getWeekOfDate(currentDate, undefined, startOnMonday);
				return `W${week.weekNumber}(${formatDate(week.startDate, 'MM/dd')}-${formatDate(week.endDate, 'MM/dd')})`;
			}
			case 'day': return formatDate(currentDate, 'MM/dd');
			case 'task': return i18n.t('views.taskView.title');
			default: return '';
		}
	}, [viewType, currentDate, startOnMonday]);

	// ===== 日期导航（task 视图无日期概念，隐藏导航段） =====
	const isCalendar = viewType === 'year' || viewType === 'month' || viewType === 'week' || viewType === 'day';

	const navigate = (dir: -1 | 1) => {
		const d = new Date(currentDate);
		switch (viewType) {
			case 'year': d.setFullYear(d.getFullYear() + dir); break;
			case 'month': d.setMonth(d.getMonth() + dir); break;
			case 'week': d.setDate(d.getDate() + 7 * dir); break;
			case 'day': d.setDate(d.getDate() + dir); break;
			default: return;
		}
		useCalendarStore.getState().setCurrentDate(d);
	};

	const goToday = () => {
		useCalendarStore.getState().setCurrentDate(new Date());
	};

	// ===== 动作 =====
	const openCreateTask = () => {
		openCreateTaskModal({
			app: plugin.app,
			plugin,
			targetDate: currentDate,
			onSuccess: () => {},
		});
	};

	const openSettings = () => {
		const a = plugin.app as unknown as { setting?: { open(): void; openTabById(id: string): void } };
		a.setting?.open();
		a.setting?.openTabById('gantt-calendar');
	};

	const handleRefresh = async () => {
		await plugin.taskCache.initialize(
			plugin.settings.globalTaskFilter,
			plugin.settings.enabledTaskFormats
		);
		useCalendarStore.getState().setTasks(plugin.taskCache.getAllTasks());
	};

	const renderItem = (key: string, icon: string, label: string, onClick: () => void) => (
		<button
			key={key}
			className={ContextMenuClasses.item}
			onClick={() => {
				close();
				onClick();
			}}
		>
			<Icon icon={icon} className={ContextMenuClasses.itemIcon} />
			<span className={ContextMenuClasses.itemLabel}>{label}</span>
		</button>
	);

	const handleFabClick = useCallback((e: ReactMouseEvent) => {
		e.stopPropagation();
		setOpen((o) => !o);
	}, []);

	return (
		<>
			<button
				ref={fabRef}
				className="gc-nav-dock__fab"
				aria-label={i18n.t('toolbar.navDock.ariaLabel')}
				aria-expanded={open}
				onClick={handleFabClick}
			>
				<Icon icon="menu" />
			</button>

			{createPortal(
				<AnimatePresence>
					{open ? (
						<>
							<motion.div
								className={ContextMenuClasses.sheetOverlay}
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={easeOutTransition(MOTION.dur.fast)}
								onClick={close}
							/>
							<motion.div
								ref={sheetRef}
								className={`${ContextMenuClasses.container} ${ContextMenuClasses.sheet} gc-nav-dock__sheet`}
								initial={{ y: '100%' }}
								animate={{ y: 0 }}
								exit={{ y: '100%' }}
								transition={easeOutTransition(MOTION.dur.normal)}
							>
								<div className={ContextMenuClasses.sheetGrabber} />
								<div className="gc-nav-dock__sheet-header">{titleText}</div>

								<div className={ContextMenuClasses.section}>
									{PHONE_VIEWS.map((btn) =>
										renderItem(
											btn.type,
											viewType === btn.type ? 'check' : btn.icon,
											i18n.t(`toolbar.leftButtons.${btn.type}.label`),
											() => useCalendarStore.getState().setViewType(btn.type),
										)
									)}
								</div>

								{isCalendar ? (
									<div className={ContextMenuClasses.section}>
										{renderItem('nav-prev', 'chevron-left', i18n.t('toolbar.nav.previous'), () => navigate(-1))}
										{renderItem('nav-today', 'calendar-days', i18n.t('toolbar.nav.goToday'), goToday)}
										{renderItem('nav-next', 'chevron-right', i18n.t('toolbar.nav.next'), () => navigate(1))}
									</div>
								) : null}

								<div className={ContextMenuClasses.section}>
									{renderItem('act-create', 'plus', i18n.t('toolbar.createTask.ariaLabel'), openCreateTask)}
									{renderItem('act-sync', 'cloud-download', i18n.t('toolbar.syncButton.defaultTitle'), () => void syncFeishuTasks(plugin as GanttCalendarPlugin))}
									{renderItem('act-refresh', 'refresh-cw', i18n.t('toolbar.refresh.refreshTask'), () => void handleRefresh())}
									{renderItem('act-settings', 'settings', i18n.t('toolbar.settingsButton.ariaLabel'), openSettings)}
								</div>
							</motion.div>
						</>
					) : null}
				</AnimatePresence>,
				document.body
			)}
		</>
	);
}
