import { useCallback, useMemo, type JSX } from 'react';
import { getWeekOfDate } from '../../dateUtils/dateUtilsIndex';
import { WeekViewConfig } from '../../components/TaskCard';
import { WeekViewClasses } from '../../utils/bem';
import { usePlugin } from '../pluginContext';
import { useCalendarStore, selectViewFilter } from '../store/calendarStore';
import { applyStatusFilter, applyTagFilter, applySort } from '../utils/taskFilters';
import { sortTasks } from '../../tasks/taskSorter';
import { generateVirtualInstances } from '../../tasks/virtualTaskGenerator';
import { i18n } from '../../i18n/i18n';
import { buildWeekTimelineModel } from './week/timelineModel';
import { WeekTimelineGrid } from './week/WeekTimelineGrid';

/**
 * React 周视图（常驻时间线模式）
 * 数据编排：周数据 + 筛选/排序 + 虚拟周期实例 → 连续画布模型，渲染交给 WeekTimelineGrid
 */
export function WeekView(): JSX.Element {
	const plugin = usePlugin();
	const currentDate = useCalendarStore((s) => s.currentDate);
	const tasks = useCalendarStore((s) => s.tasks);
	const filter = useCalendarStore((s) => selectViewFilter(s, 'week'));
	const updateSeq = useCalendarStore((s) => s.updateSeq);
	const refreshTasks = useCalendarStore((s) => s.refreshTasks);

	const startOnMonday = !!plugin.settings.startOnMonday;
	const dateField = plugin.settings.dateFilterField || 'dueDate';
	const ganttStartField = plugin.settings.ganttStartField || 'startDate';
	const ganttEndField = plugin.settings.ganttEndField || 'dueDate';
	const showLunar = !!plugin.settings.showLunar;
	const recurringLimit = plugin.settings.recurringTaskDisplayLimit ?? 5;

	const config = useMemo(() => ({
		...WeekViewConfig,
		enableDrag: true,
		showCheckbox: plugin.settings.weekViewShowCheckbox,
		showTags: plugin.settings.weekViewShowTags,
		showPriority: plugin.settings.weekViewShowPriority,
		showTicktick: plugin.settings.weekViewShowTicktick,
	}), [plugin.settings]);
	// 时间块使用紧凑变体，高度由块容器按时长撑开
	const timelineConfig = useMemo(() => ({ ...config, variant: 'timeline' as const }), [config]);

	const weekData = useMemo(() => (
		getWeekOfDate(currentDate, currentDate.getFullYear(), startOnMonday)
	), [currentDate, startOnMonday]);

	const weekStart = useMemo(() => {
		const d = new Date(weekData.days[0].date);
		d.setHours(0, 0, 0, 0);
		return d;
	}, [weekData]);

	const weekEnd = useMemo(() => {
		const d = new Date(weekData.days[6].date);
		d.setHours(0, 0, 0, 0);
		return d;
	}, [weekData]);

	// 全局筛选 + 排序
	const scoped = useMemo(() => (
		applySort(applyTagFilter(applyStatusFilter(tasks, filter.status), filter.tag), filter.sort)
	), [tasks, filter]);

	// 预生成整周的虚拟周期实例
	const virtualInstances = useMemo(() => (
		generateVirtualInstances(scoped, weekStart, weekEnd, dateField, recurringLimit)
	), [scoped, weekStart, weekEnd, dateField, recurringLimit]);

	// 本周任务全集（真实 + 虚拟，已排序）
	const combined = useMemo(() => (
		sortTasks([...scoped, ...virtualInstances], filter.sort)
	), [scoped, virtualInstances, filter.sort]);

	// 连续画布模型：时间块分段 + lane 布局 + 全天横跨条
	const model = useMemo(() => (
		buildWeekTimelineModel(combined, weekStart, ganttStartField, ganttEndField, dateField)
	), [combined, weekStart, ganttStartField, ganttEndField, dateField]);

	const handleRefresh = useCallback(() => refreshTasks(), [refreshTasks]);

	const dayNames = i18n.t('views.weekView.weekdays') as unknown as string[];

	return (
		<div className="gc-view gc-view--week">
			<div className={WeekViewClasses.elements.grid}>
				<WeekTimelineGrid
					days={weekData.days}
					dayNames={dayNames}
					weekStart={weekStart}
					model={model}
					tasks={combined}
					config={timelineConfig}
					showLunar={showLunar}
					refreshTasks={handleRefresh}
					updateSeq={updateSeq}
				/>
			</div>
		</div>
	);
}
