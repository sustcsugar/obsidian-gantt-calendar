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
	/** 插件启动时从 data.json 恢复持久化筛选（main.ts 在 loadSettings 后调用） */
	hydrateViewFilters: (filters?: Partial<Record<ViewScope, ViewFilterState>> | null) => void;

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

/**
 * 按 scope 合并持久化的部分筛选数据到默认值上（结构演进容错：
 * 缺失的 scope / 字段用默认值补全）
 */
export function mergeViewFilters(
	partial?: Partial<Record<ViewScope, ViewFilterState>> | null
): Record<ViewScope, ViewFilterState> {
	const base = buildInitialFilters();
	if (partial) {
		for (const scope of Object.keys(base) as ViewScope[]) {
			if (partial[scope]) base[scope] = { ...base[scope], ...partial[scope] };
		}
	}
	return base;
}

/**
 * 剔除「幽灵标签」：selectedTags 中在当前任务集里已不存在的标签。
 * 幽灵标签会形成隐形筛选（树里看不到勾选）：NOT 模式下匹配不到任何任务≈不过滤，
 * OR/AND 模式下匹配不到任何任务=全空。层级语义与 applyTagFilter 一致——
 * 父标签（如 work）在存在子标签（如 work/cyclops）时保留；大小写不敏感。
 * 任务集为空（如水合早于缓存就绪）时不做剔除，防误删真实筛选。
 * 无变化时返回原引用，避免触发订阅写回。
 */
export function pruneTagFilters(
	viewFilters: Record<ViewScope, ViewFilterState>,
	tasks: GCTask[]
): Record<ViewScope, ViewFilterState> {
	if (tasks.length === 0) return viewFilters;
	const tagSet = new Set<string>();
	for (const task of tasks) {
		for (const tag of task.tags || []) tagSet.add(tag.toLowerCase());
	}

	let changed = false;
	const next: Record<ViewScope, ViewFilterState> = { ...viewFilters };
	for (const scope of Object.keys(next) as ViewScope[]) {
		const { tag } = next[scope];
		if (tag.selectedTags.length === 0) continue;
		const kept = tag.selectedTags.filter((sel) => {
			const s = sel.toLowerCase();
			if (tagSet.has(s)) return true;
			return Array.from(tagSet).some((t) => t.startsWith(s + '/'));
		});
		if (kept.length !== tag.selectedTags.length) {
			changed = true;
			next[scope] = { ...next[scope], tag: { ...tag, selectedTags: kept } };
		}
	}
	return changed ? next : viewFilters;
}

export const useCalendarStore = create<CalendarStoreState>((set) => ({
	viewType: 'year',
	currentDate: new Date(),
	tasks: [],
	changedFilePath: undefined,
	updateSeq: 0,
	viewFilters: buildInitialFilters(),
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
			// 任务集刷新时同步剔除失效标签（幽灵标签隐形筛选的根治）
			return {
				tasks,
				changedFilePath: filePath,
				updateSeq: s.updateSeq + 1,
				viewFilters: pruneTagFilters(s.viewFilters, tasks),
			};
		}),
	setTasks: (tasks) =>
		set((s) => ({
			tasks,
			viewFilters: pruneTagFilters(s.viewFilters, tasks),
		})),
	bumpSettings: () => set((s) => ({ settingsVersion: s.settingsVersion + 1 })),
	requestGanttScroll: (action) =>
		set((s) => ({ ganttScroll: { seq: (s.ganttScroll?.seq ?? 0) + 1, action } })),
	/** 任务写回后触发一次顺带重渲染（数据最终由事件总线回流） */
	refreshTasks: () => set((s) => ({ updateSeq: s.updateSeq + 1 })),

	hydrateViewFilters: (filters) =>
		set((s) => ({
			// 水合时按当前任务集剔除幽灵标签；任务集未就绪（空）时不动，待任务到来再剔除
			viewFilters: pruneTagFilters(mergeViewFilters(filters), s.tasks),
		})),

	setStatusFilter: (scope, status) =>
		set((s) => {
			const vf = { ...s.viewFilters, [scope]: { ...s.viewFilters[scope], status } };
			return { viewFilters: vf };
		}),
	setTagFilter: (scope, tag) =>
		set((s) => {
			const vf = { ...s.viewFilters, [scope]: { ...s.viewFilters[scope], tag } };
			return { viewFilters: vf };
		}),
	setSort: (scope, sort) =>
		set((s) => {
			const vf = { ...s.viewFilters, [scope]: { ...s.viewFilters[scope], sort } };
			return { viewFilters: vf };
		}),
	applyFilter: (scope, status, tag, sort) =>
		set((s) => {
			const vf = { ...s.viewFilters, [scope]: { status, tag, sort } };
			return { viewFilters: vf };
		}),
}));

/**
 * 选择器：获取某视图作用域的筛选状态
 */
export const selectViewFilter = (state: CalendarStoreState, scope: ViewScope): ViewFilterState =>
	state.viewFilters[scope] || defaultFilter();
