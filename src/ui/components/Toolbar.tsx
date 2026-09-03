import { useMemo, type JSX, type MouseEvent as ReactMouseEvent } from 'react';
import type { CalendarViewType, SortField } from '../../types';
import { ToolbarClasses, CreateTaskButtonClasses } from '../../utils/bem';
import { usePlugin } from '../pluginContext';
import { useCalendarStore, type ViewScope } from '../store/calendarStore';
import { i18n } from '../../i18n/i18n';
import { formatDate, getWeekOfDate } from '../../dateUtils/dateUtilsIndex';
import { openCreateTaskModal } from '../modals/TaskFormModal';
import { syncFeishuTasks } from '../../commands/feishuCommands';
import type GanttCalendarPlugin from '../../../main';
import type { TaskStatus } from '../../tasks/taskStatus';
import { DEFAULT_TASK_STATUSES } from '../../tasks/taskStatus';
import { Icon } from './Icon';
import { TagTreeFilter } from './TagTreeFilter';
import { DropdownMenu, type MenuItemDef, type DropdownMenuSection } from './DropdownMenu';
import type { DateFieldType, GanttCalendarSettings } from '../../settings/types';
import { buildTagHierarchy } from '../../tasks/tags/TagHierarchyBuilder';
import type { TagNode } from '../../tasks/tags/TagHierarchy';

const VIEW_BUTTONS: Array<{ type: CalendarViewType; icon: string }> = [
	{ type: 'day', icon: 'sun' },
	{ type: 'week', icon: 'layout' },
	{ type: 'month', icon: 'grid' },
	{ type: 'year', icon: 'map' },
	{ type: 'task', icon: 'list-checks' },
	{ type: 'gantt', icon: 'chart-gantt' },
];

// 月缩写走 i18n（模块级常量会在语言切换后固化旧语言）
const MONTH_ABBR = () => i18n.t('common.monthsAbbr') as unknown as string[];

/**
 * React 工具栏
 * 左侧 6 视图切换 | 中间标题 | 右侧：筛选 / 排序 / 导航 / 创建任务 / 设置 / 同步 / 刷新
 */
export function ToolbarBar(): JSX.Element {
	const plugin = usePlugin();
	const viewType = useCalendarStore((s) => s.viewType);
	const currentDate = useCalendarStore((s) => s.currentDate);
	const scope = viewType as ViewScope;
	const filter = useCalendarStore((s) => s.viewFilters[scope]);
	const setViewType = useCalendarStore((s) => s.setViewType);
	const setCurrentDate = useCalendarStore((s) => s.setCurrentDate);
	const setStatusFilter = useCalendarStore((s) => s.setStatusFilter);
	const setTagFilter = useCalendarStore((s) => s.setTagFilter);
	const setSort = useCalendarStore((s) => s.setSort);
	const setTasks = useCalendarStore((s) => s.setTasks);

	const showButtonText = plugin.settings.showViewNavButtonText ?? true;
	const startOnMonday = !!plugin.settings.startOnMonday;
	// 订阅设置版本号：设置变更（refreshSettings）时重新读取 plugin.settings
	useCalendarStore((s) => s.settingsVersion);

	// ===== 标题 =====
	const titleText = useMemo(() => {
		switch (viewType) {
			case 'year': return String(currentDate.getFullYear());
			case 'month': return MONTH_ABBR()[currentDate.getMonth()];
			case 'week': {
				const week = getWeekOfDate(currentDate, undefined, startOnMonday);
				return `W${week.weekNumber}(${formatDate(week.startDate, 'MM/dd')}-${formatDate(week.endDate, 'MM/dd')})`;
			}
			case 'day': return formatDate(currentDate, 'MM/dd');
			case 'task': return i18n.t('views.taskView.title');
			case 'gantt': return i18n.t('views.ganttView.title');
		}
	}, [viewType, currentDate, startOnMonday]);

	// ===== 导航 =====
	const navigate = (dir: -1 | 1) => {
		const d = new Date(currentDate);
		switch (viewType) {
			case 'year': d.setFullYear(d.getFullYear() + dir); break;
			case 'month': d.setMonth(d.getMonth() + dir); break;
			case 'week': d.setDate(d.getDate() + 7 * dir); break;
			case 'day': d.setDate(d.getDate() + dir); break;
			default: return;
		}
		setCurrentDate(d);
	};

	const goToday = () => {
		if (viewType === 'task' || viewType === 'gantt') return;
		setCurrentDate(new Date());
	};

	// ===== 刷新 =====
	const handleRefresh = async () => {
		await plugin.taskCache.initialize(
			plugin.settings.globalTaskFilter,
			plugin.settings.enabledTaskFormats
		);
		setTasks(plugin.taskCache.getAllTasks());
	};

	// ===== 创建任务 / 设置 / 同步 =====
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

	// ===== 下拉菜单（声明式） =====
	const statusMenuSections = (): DropdownMenuSection[] => {
		const statuses: TaskStatus[] = plugin.settings.taskStatuses || DEFAULT_TASK_STATUSES;
		const selected = filter?.status.selectedStatuses || [];
		const items: MenuItemDef[] = statuses.map((st) => ({
			key: st.key,
			title: st.name,
			checked: selected.includes(st.key),
			keepOpen: true,
			onClick: () => {
				const next = selected.includes(st.key)
					? selected.filter((k) => k !== st.key)
					: [...selected, st.key];
				setStatusFilter(scope, { selectedStatuses: next });
			},
		}));
		if (items.length === 0) {
			items.push({ key: '__empty__', title: i18n.t('toolbar.statusFilter.empty'), disabled: true });
		}
		return [{ items }];
	};

	const sortMenuSections = (): DropdownMenuSection[] => {
		const fields: Array<{ key: SortField; label: string }> = [
			{ key: 'dueDate', label: i18n.t('toolbar.sort.options.dueDate') },
			{ key: 'priority', label: i18n.t('toolbar.sort.options.priority') },
			{ key: 'description', label: i18n.t('toolbar.sort.options.description') },
			{ key: 'createdDate', label: i18n.t('toolbar.sort.options.createdDate') },
			{ key: 'startDate', label: i18n.t('toolbar.sort.options.startDate') },
			{ key: 'scheduledDate', label: i18n.t('toolbar.sort.options.scheduledDate') },
			{ key: 'completionDate', label: i18n.t('toolbar.sort.options.completionDate') },
		];
		const items: MenuItemDef[] = fields.map((f) => ({
			key: f.key,
			title: f.label,
			checked: filter?.sort.field === f.key,
			onClick: () => {
				const order = filter?.sort.order === 'desc' ? 'asc' : 'desc';
				setSort(scope, { field: f.key, order });
			},
		}));
		return [{ items }];
	};


	// ===== 任务视图：时间字段选择 =====
	const fieldMenuSections = (): DropdownMenuSection[] => {
		const fields: Array<{ key: DateFieldType; label: string }> = [
			{ key: 'createdDate', label: i18n.t('toolbar.fieldSelector.createdDate') },
			{ key: 'startDate', label: i18n.t('toolbar.fieldSelector.startDate') },
			{ key: 'scheduledDate', label: i18n.t('toolbar.fieldSelector.scheduledDate') },
			{ key: 'dueDate', label: i18n.t('toolbar.fieldSelector.dueDate') },
			{ key: 'completionDate', label: i18n.t('toolbar.fieldSelector.completionDate') },
			{ key: 'cancelledDate', label: i18n.t('toolbar.fieldSelector.cancelledDate') },
		];
		const current = plugin.settings.taskViewTimeFieldFilter || 'dueDate';
		return [{
			items: fields.map((f) => ({
				key: f.key,
				title: f.label,
				checked: current === f.key,
				onClick: () => void updateTaskViewSettings({ taskViewTimeFieldFilter: f.key }),
			})),
		}];
	};

	// ===== 任务视图：日期范围筛选 =====
	const dateRangeMenuSections = (): DropdownMenuSection[] => {
		const modes: Array<{ key: 'all' | 'day' | 'week' | 'month'; label: string }> = [
			{ key: 'all', label: i18n.t('toolbar.dateFilter.all') },
			{ key: 'day', label: i18n.t('toolbar.dateFilter.day') },
			{ key: 'week', label: i18n.t('toolbar.dateFilter.week') },
			{ key: 'month', label: i18n.t('toolbar.dateFilter.month') },
		];
		const current = plugin.settings.taskViewDateRangeMode || 'week';
		return [{
			items: modes.map((m) => ({
				key: m.key,
				title: m.label,
				checked: current === m.key,
				onClick: () => void updateTaskViewSettings({ taskViewDateRangeMode: m.key }),
			})),
		}];
	};

	// ===== 任务视图：写回设置并触发重挂载 =====
	const updateTaskViewSettings = async (patch: Partial<GanttCalendarSettings>): Promise<void> => {
		Object.assign(plugin.settings, patch);
		await plugin.saveSettings();
		useCalendarStore.getState().bumpSettings();
	};

	// ===== 渲染 =====
	const isCalendar = viewType === 'year' || viewType === 'month' || viewType === 'week' || viewType === 'day';
	const showStatusSort = viewType === 'month' || viewType === 'week' || viewType === 'day';
	const requestGanttScroll = useCalendarStore((s) => s.requestGanttScroll);

	return (
		<div className={ToolbarClasses.block}>
			<div className={ToolbarClasses.elements.left}>
				<div className={`${ToolbarClasses.components.viewSelectorGroup.group}${showButtonText ? '' : ` ${ToolbarClasses.components.viewSelectorGroup.iconOnly}`}`}>
					{VIEW_BUTTONS.map((btn) => (
						<button
							key={btn.type}
							className={`${ToolbarClasses.components.viewSelectorGroup.btn}${viewType === btn.type ? ` ${ToolbarClasses.components.viewSelectorGroup.btnActive}` : ''}`}
							aria-label={i18n.t(`toolbar.leftButtons.${btn.type}.ariaLabel`)}
							onClick={() => setViewType(btn.type)}
						>
							<Icon icon={btn.icon} className={ToolbarClasses.components.viewSelectorGroup.icon} />
							{showButtonText ? (
								<span className={ToolbarClasses.components.viewSelectorGroup.label}>
									{i18n.t(`toolbar.leftButtons.${btn.type}.label`)}
								</span>
							) : null}
						</button>
					))}
				</div>
			</div>

			<div className={ToolbarClasses.elements.center}>
				<span className={ToolbarClasses.components.titleDisplay}>{titleText}</span>
			</div>

			<div className={ToolbarClasses.elements.right}>
				{viewType === 'task' && (
					<>
						<div className={ToolbarClasses.components.navButtons.group}>
							<DropdownMenu sections={statusMenuSections()}>
								{({ onClick, 'aria-expanded': expanded }) => (
									<ToolbarBtn icon="filter" label={i18n.t('toolbar.statusFilter.ariaLabel')} ariaExpanded={expanded} onClick={onClick} />
								)}
							</DropdownMenu>
						</div>
						<div className={ToolbarClasses.components.navButtons.group}>
							<DropdownMenu sections={fieldMenuSections()}>
								{({ onClick, 'aria-expanded': expanded }) => (
									<ToolbarBtn icon="calendar-clock" label={i18n.t('toolbar.fieldFilter.label')} ariaExpanded={expanded} onClick={onClick} />
								)}
							</DropdownMenu>
						</div>
						<div className={ToolbarClasses.components.navButtons.group}>
							<DropdownMenu sections={dateRangeMenuSections()}>
								{({ onClick, 'aria-expanded': expanded }) => (
									<ToolbarBtn icon="calendar-range" label={i18n.t('toolbar.dateFilterLabel')} ariaExpanded={expanded} onClick={onClick} />
								)}
							</DropdownMenu>
						</div>
						<div className={ToolbarClasses.components.navButtons.group}>
							<DropdownMenu sections={sortMenuSections()}>
								{({ onClick, 'aria-expanded': expanded }) => (
									<ToolbarBtn icon="arrow-down-up" label={i18n.t('toolbar.sort.ariaLabel')} ariaExpanded={expanded} onClick={onClick} />
								)}
							</DropdownMenu>
						</div>
						<div className={ToolbarClasses.components.navButtons.group}>
							<DropdownMenu
								content={() => (
									<TagTreeFilter
										allTags={(() => {
											const set = new Set<string>();
											for (const t of plugin.taskCache.getAllTasks()) {
												for (const tag of t.tags || []) set.add(tag);
											}
											return Array.from(set).sort();
										})()}
										selectedTags={filter?.tag.selectedTags || []}
										onToggle={(fp) => {
											const selected = filter?.tag.selectedTags || [];
											const next = selected.includes(fp)
												? selected.filter(t => t !== fp)
												: [...selected, fp];
											setTagFilter(scope, { selectedTags: next, operator: filter?.tag.operator || 'OR' });
										}}
										operator={filter?.tag.operator || 'OR'}
										onOperatorChange={(op) => setTagFilter(scope, { selectedTags: filter?.tag.selectedTags || [], operator: op })}
									/>
								)}
								align="right"
							>
								{({ onClick, 'aria-expanded': expanded }) => (
									<ToolbarBtn icon="tag" label={i18n.t('toolbar.tagFilter.ariaLabel')} ariaExpanded={expanded} onClick={onClick} />
								)}
							</DropdownMenu>
						</div>
					</>
				)}
				{isCalendar && (
					<>
						{showStatusSort && (
							<div className={ToolbarClasses.components.navButtons.group}>
								<DropdownMenu sections={statusMenuSections()}>
									{({ onClick, 'aria-expanded': expanded }) => (
										<ToolbarBtn icon="filter" label={i18n.t('toolbar.statusFilter.ariaLabel')} ariaExpanded={expanded} onClick={onClick} />
									)}
								</DropdownMenu>
							</div>
						)}
						{showStatusSort && (
							<div className={ToolbarClasses.components.navButtons.group}>
								<DropdownMenu sections={sortMenuSections()}>
									{({ onClick, 'aria-expanded': expanded }) => (
										<ToolbarBtn icon="arrow-down-up" label={i18n.t('toolbar.sort.ariaLabel')} ariaExpanded={expanded} onClick={onClick} />
									)}
								</DropdownMenu>
							</div>
						)}
						<div className={ToolbarClasses.components.navButtons.group}>
							<DropdownMenu
								content={() => (
									<TagTreeFilter
										allTags={(() => {
											const set = new Set<string>();
											for (const t of plugin.taskCache.getAllTasks()) {
												for (const tag of t.tags || []) set.add(tag);
											}
											return Array.from(set).sort();
										})()}
										selectedTags={filter?.tag.selectedTags || []}
										onToggle={(fp) => {
											const selected = filter?.tag.selectedTags || [];
											const next = selected.includes(fp)
												? selected.filter(t => t !== fp)
												: [...selected, fp];
											setTagFilter(scope, { selectedTags: next, operator: filter?.tag.operator || 'OR' });
										}}
										operator={filter?.tag.operator || 'OR'}
										onOperatorChange={(op) => setTagFilter(scope, { selectedTags: filter?.tag.selectedTags || [], operator: op })}
									/>
								)}
								align="right"
							>
								{({ onClick, 'aria-expanded': expanded }) => (
									<ToolbarBtn icon="tag" label={i18n.t('toolbar.tagFilter.ariaLabel')} ariaExpanded={expanded} onClick={onClick} />
								)}
							</DropdownMenu>
						</div>

						<div className={ToolbarClasses.components.navButtons.group}>
							<ToolbarBtn
								icon="chevron-left"
								label={i18n.t('toolbar.nav.previous')}
								onClick={(e) => navigate(-1)}
							/>
							<ToolbarBtn
								text={i18n.t('toolbar.nav.today')}
								label={i18n.t('toolbar.nav.goToday')}
								onClick={goToday}
							/>
							<ToolbarBtn
								icon="chevron-right"
								label={i18n.t('toolbar.nav.next')}
								onClick={() => navigate(1)}
							/>
						</div>
					</>
				)}

				{viewType === 'gantt' && (
					<>
						<div className={ToolbarClasses.components.navButtons.group}>
							<ToolbarBtn
								icon="chevrons-left"
								label={i18n.t('toolbar.ganttScroll.scrollLeft')}
								onClick={() => requestGanttScroll('left')}
							/>
							<ToolbarBtn
								text={i18n.t('toolbar.nav.today')}
								label={i18n.t('toolbar.ganttScroll.goToday')}
								onClick={() => requestGanttScroll('today')}
							/>
							<ToolbarBtn
								icon="chevrons-right"
								label={i18n.t('toolbar.ganttScroll.scrollRight')}
								onClick={() => requestGanttScroll('right')}
							/>
						</div>
						<div className={ToolbarClasses.components.navButtons.group}>
							<DropdownMenu sections={statusMenuSections()}>
								{({ onClick, 'aria-expanded': expanded }) => (
									<ToolbarBtn icon="filter" label={i18n.t('toolbar.statusFilter.ariaLabel')} ariaExpanded={expanded} onClick={onClick} />
								)}
							</DropdownMenu>
						</div>
						<div className={ToolbarClasses.components.navButtons.group}>
							<DropdownMenu sections={sortMenuSections()}>
								{({ onClick, 'aria-expanded': expanded }) => (
									<ToolbarBtn icon="arrow-down-up" label={i18n.t('toolbar.sort.ariaLabel')} ariaExpanded={expanded} onClick={onClick} />
								)}
							</DropdownMenu>
						</div>
						<div className={ToolbarClasses.components.navButtons.group}>
							<DropdownMenu
								content={() => (
									<TagTreeFilter
										allTags={(() => {
											const set = new Set<string>();
											for (const t of plugin.taskCache.getAllTasks()) {
												for (const tag of t.tags || []) set.add(tag);
											}
											return Array.from(set).sort();
										})()}
										selectedTags={filter?.tag.selectedTags || []}
										onToggle={(fp) => {
											const selected = filter?.tag.selectedTags || [];
											const next = selected.includes(fp)
												? selected.filter(t => t !== fp)
												: [...selected, fp];
											setTagFilter(scope, { selectedTags: next, operator: filter?.tag.operator || 'OR' });
										}}
										operator={filter?.tag.operator || 'OR'}
										onOperatorChange={(op) => setTagFilter(scope, { selectedTags: filter?.tag.selectedTags || [], operator: op })}
									/>
								)}
								align="right"
							>
								{({ onClick, 'aria-expanded': expanded }) => (
									<ToolbarBtn icon="tag" label={i18n.t('toolbar.tagFilter.ariaLabel')} ariaExpanded={expanded} onClick={onClick} />
								)}
							</DropdownMenu>
						</div>
					</>
				)}

				<div className={ToolbarClasses.priority.priority3}>
					<div className={ToolbarClasses.components.navButtons.group}>
						<ToolbarBtn
							icon="plus"
							label={i18n.t('toolbar.createTask.ariaLabel')}
							onClick={openCreateTask}
							extra={`${CreateTaskButtonClasses.block} ${CreateTaskButtonClasses.modifiers.toolbar}`}
						/>
					</div>
				</div>

				<div className={ToolbarClasses.components.navButtons.group}>
					<ToolbarBtn
						icon="settings"
						label={i18n.t('toolbar.settingsButton.ariaLabel')}
						onClick={openSettings}
					/>
				</div>

				<div className={ToolbarClasses.components.navButtons.group}>
					<ToolbarBtn
						icon="cloud-download"
						label={i18n.t('toolbar.syncButton.defaultTitle')}
						onClick={() => {
							void syncFeishuTasks(plugin as GanttCalendarPlugin);
						}}
					/>
				</div>

				<div className={ToolbarClasses.components.navButtons.group}>
					<ToolbarBtn
						icon="refresh-cw"
						label={i18n.t('toolbar.refresh.refreshTask')}
						onClick={() => void handleRefresh()}
					/>
				</div>
			</div>
		</div>
	);
}

interface ToolbarBtnProps {
	icon?: string;
	text?: string;
	label: string;
	ariaExpanded?: boolean;
	onClick: (e: ReactMouseEvent, anchor: HTMLElement) => void;
	extra?: string;
}

function ToolbarBtn({ icon, text, label, ariaExpanded, onClick, extra }: ToolbarBtnProps): JSX.Element {
	return (
		<button
			className={`${ToolbarClasses.components.navButtons.btn}${extra ? ` ${extra}` : ''}`}
			aria-label={label}
			aria-expanded={ariaExpanded}
			onClick={(e) => onClick(e, e.currentTarget)}
		>
			{icon ? <Icon icon={icon} /> : text}
		</button>
	);
}