import { create } from 'zustand';
import type {
	CalendarViewType,
	GCTask,
	SortState,
	TagFilterState,
	StatusFilterState,
} from '../../types';
import {
	DEFAULT_SORT_STATE,
	DEFAULT_TAG_FILTER_STATE,
	DEFAULT_STATUS_FILTER_STATE,
} from '../../types';

export type ViewScope = 'year' | 'month' | 'week' | 'day' | 'task' | 'gantt' | 'sidebar';

export type GanttScrollAction = 'left' | 'today' | 'right';

export interface ViewFilterState {
	status: StatusFilterState;
	tag: TagFilterState;
	sort: SortState;
}

interface CalendarStoreState {
	viewType: CalendarViewType;
	currentDate: Date;
	tasks: GCTask[];
	changedFilePath?: string;
	updateSeq: number;
	/** 设置变更版本号：刷新设置时自增，用于触发 React 视图整体重挂载 */
	settingsVersion: number;

	/** 每个视图作用域独立的筛选/排序状态（视图切换时保留） */
	viewFilters: Record<ViewScope, ViewFilterState>;

	/** 甘特图滚动请求（工具栏按钮 → GanttView 引擎） */
	ganttScroll: { seq: number; action: GanttScrollAction } | null;

	setViewType: (type: CalendarViewType) => void;
	setCurrentDate: (date: Date) => void;
	/** 数据层 TaskStore 通知时调用（防抖已由 TaskStore 处理） */
	notifyTasksUpdated: (tasks: GCTask[], filePath?: string) => void;
	setTasks: (tasks: GCTask[]) => void;
	/** 设置/视图全量刷新：自增 settingsVersion，触发整体重挂载 */
	bumpSettings: () => void;
	/** 请求甘特图滚动（每次调用自增 seq，GanttView 订阅执行） */
	requestGanttScroll: (action: GanttScrollAction) => void;

	setStatusFilter: (scope: ViewScope, state: StatusFilterState) => void;
	setTagFilter: (scope: ViewScope, tag: TagFilterState) => void;
	setSort: (scope: ViewScope, sort: SortState) => void;
	applyFilter: (scope: ViewScope, status: StatusFilterState, tag: TagFilterState, sort: SortState) => void;
	/** 任务写回后触发一次顺带重渲染（数据最终由事件总线回流） */
	refreshTasks: () => void;
}

const defaultFilter = (): ViewFilterState => ({
	status: { selectedStatuses: [...DEFAULT_STATUS_FILTER_STATE.selectedStatuses] },
	tag: { selectedTags: [], operator: DEFAULT_TAG_FILTER_STATE.operator },
	sort: { ...DEFAULT_SORT_STATE },
});

const buildInitialFilters = (): Record<ViewScope, ViewFilterState> => {
	const scopes: ViewScope[] = ['year', 'month', 'week', 'day', 'task', 'gantt', 'sidebar'];
	return scopes.reduce((acc, scope) => {
		acc[scope] = defaultFilter();
		return acc;
	}, {} as Record<ViewScope, ViewFilterState>);
};

const VIEW_FILTERS_KEY = 'gantt-calendar-view-filters';

/** 从 localStorage 恢复上次会话的筛选条件 */
function loadPersistedFilters(): Record<ViewScope, ViewFilterState> {
	try {
		const raw = localStorage.getItem(VIEW_FILTERS_KEY);
		if (!raw) return buildInitialFilters();
		const parsed = JSON.parse(raw) as Partial<Record<ViewScope, ViewFilterState>>;
		// 合并：只覆盖有效 scope，缺失的 scope 用默认值
		const base = buildInitialFilters();
		for (const scope of Object.keys(base) as ViewScope[]) {
			if (parsed[scope]) base[scope] = { ...base[scope], ...parsed[scope] };
		}
		return base;
	} catch {
		return buildInitialFilters();
	}
}

/** 保存筛选条件到 localStorage */
function persistFilters(filters: Record<ViewScope, ViewFilterState>): void {
	try {
		localStorage.setItem(VIEW_FILTERS_KEY, JSON.stringify(filters));
	} catch { /* quota exceeded 等静默忽略 */ }
}

export const useCalendarStore = create<CalendarStoreState>((set) => ({
	viewType: 'year',
	currentDate: new Date(),
	tasks: [],
	changedFilePath: undefined,
	updateSeq: 0,
	viewFilters: loadPersistedFilters(),
	settingsVersion: 0,
	ganttScroll: null,

	setViewType: (type) => set({ viewType: type }),
	setCurrentDate: (date) => set({ currentDate: new Date(date) }),
	notifyTasksUpdated: (tasks, filePath) =>
		set((s) => {
			// 同一次 TaskStore 防抖冲刷会被主视图和侧栏两个订阅者各转发一次，
			// 第二次传入的数组引用相同（L1 缓存）——直接跳过，
			// 避免 updateSeq 重复自增引发二次重渲染
			if (tasks === s.tasks && filePath === s.changedFilePath) return s;
			return { tasks, changedFilePath: filePath, updateSeq: s.updateSeq + 1 };
		}),
	setTasks: (tasks) => set({ tasks }),
	bumpSettings: () => set((s) => ({ settingsVersion: s.settingsVersion + 1 })),
	requestGanttScroll: (action) =>
		set((s) => ({ ganttScroll: { seq: (s.ganttScroll?.seq ?? 0) + 1, action } })),
	/** 任务写回后触发一次顺带重渲染（数据最终由事件总线回流） */
	refreshTasks: () => set((s) => ({ updateSeq: s.updateSeq + 1 })),

	setStatusFilter: (scope, status) =>
		set((s) => {
			const vf = { ...s.viewFilters, [scope]: { ...s.viewFilters[scope], status } };
			persistFilters(vf);
			return { viewFilters: vf };
		}),
	setTagFilter: (scope, tag) =>
		set((s) => {
			const vf = { ...s.viewFilters, [scope]: { ...s.viewFilters[scope], tag } };
			persistFilters(vf);
			return { viewFilters: vf };
		}),
	setSort: (scope, sort) =>
		set((s) => {
			const vf = { ...s.viewFilters, [scope]: { ...s.viewFilters[scope], sort } };
			persistFilters(vf);
			return { viewFilters: vf };
		}),
	applyFilter: (scope, status, tag, sort) =>
		set((s) => {
			const vf = { ...s.viewFilters, [scope]: { status, tag, sort } };
			persistFilters(vf);
			return { viewFilters: vf };
		}),
}));

/**
 * 选择器：获取某视图作用域的筛选状态
 */
export const selectViewFilter = (state: CalendarStoreState, scope: ViewScope): ViewFilterState =>
	state.viewFilters[scope] || defaultFilter();
