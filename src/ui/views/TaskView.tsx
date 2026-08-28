import { useCallback, useMemo, type JSX } from 'react';
import { taskKey } from '../utils/taskKey';
import type { GCTask } from '../../types';
import { getTaskDateField } from '../../types';
import { TaskViewConfig } from '../../components/TaskCard';
import { TaskViewClasses, ViewClasses } from '../../utils/bem';
import { usePlugin } from '../pluginContext';
import { useCalendarStore, selectViewFilter } from '../store/calendarStore';
import { applyStatusFilter, applyTagFilter, applySort } from '../utils/taskFilters';
import { TaskCard } from '../components/TaskCard';
import { i18n } from '../../i18n/i18n';
import { generateVirtualInstances } from '../../tasks/virtualTaskGenerator';
import { Logger } from '../../utils/logger';

export function TaskView(): JSX.Element {
	const plugin = usePlugin();
	const tasks = useCalendarStore((s) => s.tasks);
	const filter = useCalendarStore((s) => selectViewFilter(s, 'task'));
	const refreshTasks = useCalendarStore((s) => s.refreshTasks);
	// 稳定回调：TaskCard 已 memo，内联箭头函数会使 memo 失效
	const handleCardRefresh = useCallback(() => refreshTasks(), [refreshTasks]);

	const timeFieldFilter = plugin.settings.taskViewTimeFieldFilter || 'dueDate';
	const dateRangeMode = plugin.settings.taskViewDateRangeMode || 'week';

	const config = useMemo(() => ({
		...TaskViewConfig,
	}), [plugin.settings]);

	const viewData = useMemo(() => {
		try {
			let scoped = applyStatusFilter(tasks, filter.status);
			const ref = new Date();
			let rangeStart: Date;
			let rangeEnd: Date;
			if (dateRangeMode === 'day' || dateRangeMode === 'custom') {
				rangeStart = startOfDay(ref);
				rangeEnd = endOfDay(ref);
			} else if (dateRangeMode === 'week') {
				rangeStart = startOfWeek(ref);
				rangeEnd = endOfWeek(ref);
			} else if (dateRangeMode === 'month') {
				rangeStart = startOfMonth(ref);
				rangeEnd = endOfMonth(ref);
			} else {
				// "all" 模式：范围覆盖从今天到 1 年后
				rangeStart = startOfDay(ref);
				rangeEnd = new Date(ref.getFullYear() + 1, ref.getMonth(), ref.getDate(), 23, 59, 59);
			}
			if (dateRangeMode !== 'all') {
				scoped = scoped.filter((task) => {
					const dateValue = getTaskDateField(task, timeFieldFilter);
					if (!dateValue) return false;
					const taskDate = new Date(dateValue);
					if (isNaN(taskDate.getTime())) return false;
					return taskDate >= rangeStart && taskDate <= rangeEnd;
				});
			}
			scoped = applyTagFilter(scoped, filter.tag);
			scoped = applySort(scoped, filter.sort);

			// 重复任务：按日期范围生成虚拟实例并与真实任务合并
			const recurringLimit = plugin.settings.recurringTaskDisplayLimit ?? 5;
			const dateField = plugin.settings.taskViewTimeFieldFilter || 'dueDate';
			const effectiveRangeStart = rangeStart ?? startOfDay(new Date());
			const effectiveRangeEnd = rangeEnd ?? endOfMonth(new Date());
			const virtuals = generateVirtualInstances(
				scoped,
				effectiveRangeStart,
				effectiveRangeEnd,
				dateField,
				recurringLimit,
			);
			scoped = [...scoped, ...virtuals].sort((a, b) => {
				const da = getTaskDateField(a, dateField);
				const db = getTaskDateField(b, dateField);
				const ta = da ? da.getTime() : 0;
				const tb = db ? db.getTime() : 0;
				return ta - tb;
			});
			return scoped;
		} catch (error) {
			Logger.error('TaskView', 'Error rendering task view', error);
			return null;
		}
	}, [tasks, filter, dateRangeMode, timeFieldFilter]);

	if (viewData === null) {
		return (
			<div className={`${ViewClasses.block} ${ViewClasses.modifiers.task}`}>
				<div className={TaskViewClasses.elements.empty}>{i18n.t('views.taskView.loadError')}</div>
			</div>
		);
	}

	if (viewData.length === 0) {
		return (
			<div className={`${ViewClasses.block} ${ViewClasses.modifiers.task}`}>
				<div className={TaskViewClasses.elements.empty}>{i18n.t('views.taskView.noTasks')}</div>
			</div>
		);
	}

	return (
		<div className={`${ViewClasses.block} ${ViewClasses.modifiers.task}`}>
			{viewData.map((task) => (
				<TaskCard
					key={taskKey(task)}
					task={task}
					config={config}
					onRefresh={handleCardRefresh}
				/>
			))}
		</div>
	);
}


function startOfDay(d: Date): Date {
	const x = new Date(d);
	x.setHours(0, 0, 0, 0);
	return x;
}

function endOfDay(d: Date): Date {
	const x = new Date(d);
	x.setHours(23, 59, 59, 999);
	return x;
}

function startOfWeek(d: Date): Date {
	const x = startOfDay(d);
	const day = x.getDay();
	const diff = (day + 6) % 7;
	x.setDate(x.getDate() - diff);
	return x;
}

function endOfWeek(d: Date): Date {
	const s = startOfWeek(d);
	const e = new Date(s);
	e.setDate(s.getDate() + 6);
	e.setHours(23, 59, 59, 999);
	return e;
}

function startOfMonth(d: Date): Date {
	const x = startOfDay(d);
	x.setDate(1);
	return x;
}

function endOfMonth(d: Date): Date {
	const x = startOfDay(d);
	x.setMonth(x.getMonth() + 1, 0);
	x.setHours(23, 59, 59, 999);
	return x;
}