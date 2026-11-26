import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { isChineseLanguage } from '../../i18n/i18n';
import { Notice } from 'obsidian';
import { sortTasks } from '../../tasks/taskSorter';
import { GanttClasses, ViewClasses } from '../../utils/bem';
import { Logger } from '../../utils/logger';
import { generateVirtualInstances } from '../../tasks/virtualTaskGenerator';
import {
	GanttChartAdapter,
	TaskUpdateHandler,
	TaskDataAdapter,
	buildGanttTree,
	flattenGanttTree,
	collectCollapsibleNodeIds,
	collectCollapseToFileLevelIds,
	type DateFieldType,
	type GanttChartConfig,
	type GanttChartTask,
	type GanttTreeNode,
	TimeGranularity,
} from '../../gantt';
import { i18n } from '../../i18n/i18n';
import type { GCTask } from '../../types';
import { usePlugin, useApp } from '../pluginContext';
import { useCalendarStore, selectViewFilter } from '../store/calendarStore';

const GANTT_CONFIG: Omit<GanttChartConfig, 'on_click' | 'on_date_change' | 'on_progress_change' | 'on_toggle_collapse'> = {
	view_mode: 'week',
	granularity: TimeGranularity.DAY,
	language: isChineseLanguage() ? 'zh' : 'en',
	header_height: 50,
	column_width: 40,
	step: 24,
	bar_height: 24,
	bar_corner_radius: 4,
	arrow_curve: 5,
	padding: 18,
	date_format: 'YYYY-MM-DD',
};

/**
 * 将单个 GanttTreeNode 映射为供 SvgGanttRenderer 消费的 GanttChartTask
 */
function treeNodeToGanttChartTask(
	node: GanttTreeNode,
	startField: DateFieldType,
	endField: DateFieldType,
	isCollapsed: boolean
): GanttChartTask {
	const hasChildren = node.children.length > 0;

	if (node.type === 'task' && node.task) {
		const sourceTask = node.task;
		if (!node.isRollupBar) {
			const adapted = TaskDataAdapter.toGanttChartTask(sourceTask, startField, endField, node.nodeId);
			if (adapted) {
				return {
					...adapted,
					treeNodeId: node.nodeId,
					treeNodeType: 'task',
					treeDepth: node.depth,
					isRollupBar: false,
					hasChildren,
					isCollapsed,
					hasOutOfBoundsChildren: node.hasOutOfBoundsChildren,
					leafTaskCount: node.leafTaskCount,
					completedTaskCount: node.completedTaskCount,
					progressRatio: node.progressRatio,
					isVirtualContainer: Boolean(sourceTask.isVirtualContainer),
					isInheritedDate: Boolean(node.isInheritedDate),
				};
			}
		}

		// 单日期里程碑或无自身日期的父汇总节点：使用 treeBuilder 计算出的本地日期跨度
		const classes: string[] = [];
		if (sourceTask.completed) classes.push('task-completed');
		if (sourceTask.cancelled) classes.push('task-cancelled');
		if (sourceTask.priority) classes.push(`priority-${sourceTask.priority}`);
		if (sourceTask.status) classes.push(`status-${sourceTask.status}`);

		return {
			id: node.nodeId,
			name: node.label,
			start: node.startStr,
			end: node.endStr,
			progress: sourceTask.completed ? 100 : 0,
			custom_class: classes.join(' '),
			completed: sourceTask.completed,
			cancelled: sourceTask.cancelled,
			filePath: sourceTask.filePath,
			fileName: sourceTask.fileName,
			lineNumber: sourceTask.lineNumber,
			content: sourceTask.content,
			description: sourceTask.description,
			tags: sourceTask.tags,
			priority: sourceTask.priority,
			format: sourceTask.format,
			status: sourceTask.status,
			createdDate: sourceTask.createdDate,
			startDate: sourceTask.startDate,
			scheduledDate: sourceTask.scheduledDate,
			dueDate: sourceTask.dueDate,
			cancelledDate: sourceTask.cancelledDate,
			completionDate: sourceTask.completionDate,
			repeat: sourceTask.repeat,
			datePrecision: sourceTask.datePrecision,
			metadataFields: sourceTask.metadataFields,
			treeNodeId: node.nodeId,
			treeNodeType: 'task',
			treeDepth: node.depth,
			isRollupBar: node.isRollupBar,
			hasChildren,
			isCollapsed,
			hasOutOfBoundsChildren: node.hasOutOfBoundsChildren,
			leafTaskCount: node.leafTaskCount,
			completedTaskCount: node.completedTaskCount,
			progressRatio: node.progressRatio,
			isVirtualContainer: Boolean(sourceTask.isVirtualContainer),
			isInheritedDate: Boolean(node.isInheritedDate),
		};
	}

	// folder / file 汇总行
	return {
		id: node.nodeId,
		name: node.label,
		start: node.startStr,
		end: node.endStr,
		progress: Math.round((node.progressRatio ?? 0) * 100),
		filePath: node.filePath,
		treeNodeId: node.nodeId,
		treeNodeType: node.type,
		treeDepth: node.depth,
		isRollupBar: true,
		hasChildren,
		isCollapsed,
		leafTaskCount: node.leafTaskCount,
		completedTaskCount: node.completedTaskCount,
		progressRatio: node.progressRatio,
	};
}

export function GanttView(): JSX.Element {
	const plugin = usePlugin();
	const app = useApp();
	const tasks = useCalendarStore((s) => s.tasks);
	const tasksWithVirtual = useCalendarStore((s) => s.tasksWithVirtual);
	const filter = useCalendarStore((s) => selectViewFilter(s, 'gantt'));
	const ganttScroll = useCalendarStore((s) => s.ganttScroll);
	const refreshTasks = useCalendarStore((s) => s.refreshTasks);
	const ganttDisplayMode = useCalendarStore((s) => s.ganttDisplayMode);
	const ganttGroupMode = useCalendarStore((s) => s.ganttGroupMode);
	const ganttCollapsedIds = useCalendarStore((s) => s.ganttCollapsedIds);
	const setGanttDisplayMode = useCalendarStore((s) => s.setGanttDisplayMode);
	const setGanttGroupMode = useCalendarStore((s) => s.setGanttGroupMode);
	const toggleGanttNodeCollapsed = useCalendarStore((s) => s.toggleGanttNodeCollapsed);
	const setGanttCollapsedIds = useCalendarStore((s) => s.setGanttCollapsedIds);

	const isFlatMode = ganttDisplayMode === 'flat';
	const startField = plugin.settings.ganttStartField;
	const endField = plugin.settings.ganttEndField;
	const rootFolder = plugin.settings.ganttRootFolder || '';
	const recurringLimit = plugin.settings.recurringTaskDisplayLimit ?? 5;

	// 搜索词保持视图会话级状态；展示模式、分组维度与折叠状态由 calendarStore 持久化至 data.json
	const collapsedIds = useMemo(() => new Set(ganttCollapsedIds), [ganttCollapsedIds]);
	const [searchQuery, setSearchQuery] = useState('');

	const containerRef = useRef<HTMLDivElement | null>(null);
	const engineRef = useRef<GanttChartAdapter | null>(null);
	const readyRef = useRef(false);
	const syncedSigRef = useRef('');
	const lastGanttRef = useRef<GanttChartTask[]>([]);
	// 仅首次挂载执行 scrollToToday；折叠/搜索/刷新重建时保留当前滚动位置
	const hasInitialScrolledRef = useRef(false);
	const savedScrollRef = useRef<{ scrollLeft: number; scrollTop: number } | null>(null);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	const updateHandlerRef = useRef<TaskUpdateHandler | null>(null);
	if (!updateHandlerRef.current) {
		updateHandlerRef.current = new TaskUpdateHandler(app, plugin);
	}

	// ========== 原版平铺模式数据链路（完整还原基线过滤、排序与平铺转换） ==========
	const flatFilteredTasks = useMemo(() => {
		if (!isFlatMode) return [];
		const withAssigned = TaskDataAdapter.applyFilters(
			tasks,
			filter.status,
			filter.tag.selectedTags,
			filter.tag.operator
		);
		return sortTasks(withAssigned, filter.sort);
	}, [isFlatMode, tasks, filter]);

	const flatTasksWithVirtuals = useMemo(() => {
		if (!isFlatMode) return [];
		const ref = new Date();
		const rangeStart = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
		const rangeEnd = new Date(ref.getFullYear() + 1, ref.getMonth(), ref.getDate());
		const virtuals = generateVirtualInstances(
			flatFilteredTasks,
			rangeStart,
			rangeEnd,
			startField,
			recurringLimit
		);
		return [...flatFilteredTasks, ...virtuals];
	}, [isFlatMode, flatFilteredTasks, startField, recurringLimit]);

	const flatGanttData = useMemo(() => {
		const ganttTasks: GanttChartTask[] = [];
		const taskById = new Map<string, GCTask>();
		if (!isFlatMode) {
			return { ganttTasks, taskById };
		}
		const seenIds = new Map<string, number>();
		for (const task of flatTasksWithVirtuals) {
			const converted = TaskDataAdapter.toGanttChartTask(task, startField, endField);
			if (!converted) continue;
			const occurrence = (seenIds.get(converted.id) ?? 0) + 1;
			seenIds.set(converted.id, occurrence);
			if (occurrence > 1) {
				converted.id = `${converted.id}#${occurrence}`;
			}
			ganttTasks.push(converted);
			taskById.set(converted.id, task);
		}
		return { ganttTasks, taskById };
	}, [isFlatMode, flatTasksWithVirtuals, startField, endField]);

	// ========== 树形分组模式数据链路 ==========
	const treeRoots = useMemo(() => {
		if (isFlatMode) return [];
		const ref = new Date();
		const rangeStart = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
		const rangeEnd = new Date(ref.getFullYear() + 1, ref.getMonth(), ref.getDate());
		// generateVirtualInstances 内部已跳过 isVirtualContainer 节点
		const recurringVirtuals = generateVirtualInstances(
			tasksWithVirtual,
			rangeStart,
			rangeEnd,
			startField,
			recurringLimit
		);
		const combined = recurringVirtuals.length > 0
			? [...tasksWithVirtual, ...recurringVirtuals]
			: tasksWithVirtual;

		return buildGanttTree(combined, {
			startField,
			endField,
			groupMode: ganttGroupMode,
			rootFolder,
			uncategorizedFolderLabel: i18n.t('views.ganttView.uncategorizedProject'),
			statusFilter: filter.status,
			tagFilter: filter.tag,
			searchQuery,
		});
	}, [isFlatMode, tasksWithVirtual, startField, endField, ganttGroupMode, rootFolder, filter.status, filter.tag, searchQuery, recurringLimit]);

	const latestTreeTaskByNodeId = useMemo(() => {
		const map = new Map<string, GCTask>();
		const collect = (nodes: GanttTreeNode[]): void => {
			for (const node of nodes) {
				if (node.type === 'task' && node.task) {
					map.set(node.nodeId, node.task);
				}
				if (node.children.length > 0) {
					collect(node.children);
				}
			}
		};
		collect(treeRoots);
		return map;
	}, [treeRoots]);

	const treeGanttTasks = useMemo(() => {
		if (isFlatMode) return [];
		const visibleNodes = flattenGanttTree(treeRoots, collapsedIds);
		return visibleNodes.map((node) =>
			treeNodeToGanttChartTask(node, startField, endField, collapsedIds.has(node.nodeId))
		);
	}, [isFlatMode, treeRoots, collapsedIds, startField, endField]);

	const ganttTasks = isFlatMode ? flatGanttData.ganttTasks : treeGanttTasks;
	const latestTaskByNodeId = isFlatMode ? flatGanttData.taskById : latestTreeTaskByNodeId;
	const hasTasks = ganttTasks.length > 0;

	const tasksRef = useRef(isFlatMode ? flatFilteredTasks : tasksWithVirtual);
	tasksRef.current = isFlatMode ? flatFilteredTasks : tasksWithVirtual;
	const latestTaskByNodeIdRef = useRef(latestTaskByNodeId);
	latestTaskByNodeIdRef.current = latestTaskByNodeId;
	const ganttTasksRef = useRef(ganttTasks);
	ganttTasksRef.current = ganttTasks;
	const startFieldRef = useRef(startField);
	startFieldRef.current = startField;
	const endFieldRef = useRef(endField);
	endFieldRef.current = endField;

	const resolveFreshGanttTask = useCallback((ganttTask: GanttChartTask): GanttChartTask | null => {
		const nodeId = ganttTask.treeNodeId ?? ganttTask.id;
		const latestTask = latestTaskByNodeIdRef.current.get(nodeId);
		if (!latestTask) {
			Logger.warn('GanttView', `Refusing write-back: latest task not found for nodeId=${nodeId}`);
			new Notice(i18n.t('views.ganttView.updateTaskFailed'));
			return null;
		}
		return {
			...ganttTask,
			...latestTask,
			id: ganttTask.id,
			name: ganttTask.name,
			start: ganttTask.start,
			end: ganttTask.end,
			progress: ganttTask.progress,
		};
	}, []);

	const handleToggleCollapse = useCallback((nodeId: string) => {
		toggleGanttNodeCollapsed(nodeId);
	}, [toggleGanttNodeCollapsed]);

	const handleExpandAll = useCallback(() => {
		setGanttCollapsedIds([]);
	}, [setGanttCollapsedIds]);

	const handleCollapseToFiles = useCallback(() => {
		setGanttCollapsedIds(collectCollapseToFileLevelIds(treeRoots));
	}, [treeRoots, setGanttCollapsedIds]);

	const handleCollapseAll = useCallback(() => {
		setGanttCollapsedIds(collectCollapsibleNodeIds(treeRoots));
	}, [treeRoots, setGanttCollapsedIds]);

	const handleTaskClick = useCallback((ganttTask: GanttChartTask) => {
		const nodeId = ganttTask.treeNodeId ?? ganttTask.id;
		const latestTask = latestTaskByNodeIdRef.current.get(nodeId);
		const target = latestTask ? { ...ganttTask, ...latestTask, id: ganttTask.id } : ganttTask;
		updateHandlerRef.current?.handleTaskClick(target, tasksRef.current);
	}, []);

	const handleDateChange = useCallback(async (ganttTask: GanttChartTask, start: Date, end: Date) => {
		// 第二道防线：汇总条与非实体任务行直接静默返回
		if (ganttTask.isRollupBar || ganttTask.treeNodeType === 'folder' || ganttTask.treeNodeType === 'file') {
			return;
		}
		const updateHandler = updateHandlerRef.current;
		if (!updateHandler) return;
		if (!TaskUpdateHandler.validateDateChange(start, end)) {
			new Notice(i18n.t('views.ganttView.invalidDateRange'));
			return;
		}
		const freshTask = resolveFreshGanttTask(ganttTask);
		if (!freshTask || freshTask.isVirtualContainer) {
			return;
		}
		try {
			await updateHandler.handleDateChange(
				freshTask,
				start,
				end,
				startFieldRef.current,
				endFieldRef.current,
				tasksRef.current
			);
			refreshTasks();
		} catch (error) {
			Logger.error('GanttView', 'Error handling date change:', error);
		}
	}, [refreshTasks, resolveFreshGanttTask]);

	const handleProgressChange = useCallback(async (ganttTask: GanttChartTask, progress: number) => {
		if (ganttTask.treeNodeType === 'folder' || ganttTask.treeNodeType === 'file') {
			return;
		}
		const updateHandler = updateHandlerRef.current;
		if (!updateHandler) return;
		const freshTask = resolveFreshGanttTask(ganttTask);
		if (!freshTask) {
			return;
		}
		try {
			await updateHandler.handleProgressChange(freshTask, progress, tasksRef.current);
			refreshTasks();
		} catch (error) {
			Logger.error('GanttView', 'Error handling progress change:', error);
		}
	}, [refreshTasks, resolveFreshGanttTask]);

	const config = useMemo<GanttChartConfig>(() => ({
		...GANTT_CONFIG,
		on_click: handleTaskClick,
		on_date_change: (task, start, end) => { void handleDateChange(task, start, end); },
		on_progress_change: (task, progress) => { void handleProgressChange(task, progress); },
		on_toggle_collapse: handleToggleCollapse,
	}), [handleTaskClick, handleDateChange, handleProgressChange, handleToggleCollapse]);

	const destroyEngine = useCallback(() => {
		if (engineRef.current && readyRef.current) {
			savedScrollRef.current = engineRef.current.getScrollPosition();
		}
		engineRef.current?.destroy();
		engineRef.current = null;
		readyRef.current = false;
		syncedSigRef.current = '';
		lastGanttRef.current = [];
	}, []);

	const buildEngine = useCallback(() => {
		const el = containerRef.current;
		if (!el || engineRef.current) return;
		const engine = new GanttChartAdapter(
			el,
			config,
			plugin,
			tasksRef.current,
			startFieldRef.current,
			endFieldRef.current
		);
		engineRef.current = engine;
		readyRef.current = false;
		void engine.init(ganttTasksRef.current).then(() => {
			readyRef.current = true;
			setErrorMsg(null);
			syncedSigRef.current = tasksSignature(ganttTasksRef.current);
			lastGanttRef.current = ganttTasksRef.current;
			if (!hasInitialScrolledRef.current) {
				hasInitialScrolledRef.current = true;
				engine.scrollToToday();
			} else if (savedScrollRef.current) {
				engine.setScrollPosition(savedScrollRef.current.scrollLeft, savedScrollRef.current.scrollTop);
			}
		}).catch((error) => {
			Logger.error('GanttView', 'Error initializing gantt:', error);
			setErrorMsg((error as Error).message);
		});
	}, [config, plugin]);

	useEffect(() => {
		if (!hasTasks) return;
		buildEngine();
		return () => destroyEngine();
	}, [hasTasks, startField, endField, buildEngine, destroyEngine]);

	useEffect(() => {
		const engine = engineRef.current;
		if (!engine || !readyRef.current || !hasTasks) return;
		const sig = tasksSignature(ganttTasks);
		if (sig === syncedSigRef.current) return;
		syncedSigRef.current = sig;
		const oldTasks = lastGanttRef.current;
		lastGanttRef.current = ganttTasks;
		if (shouldFullRefresh(oldTasks, ganttTasks)) {
			destroyEngine();
			buildEngine();
			return;
		}
		engine.updateTasks(ganttTasks);
	}, [ganttTasks, hasTasks, startField, endField, buildEngine, destroyEngine]);

	useEffect(() => {
		const engine = engineRef.current;
		if (!engine || !readyRef.current || !hasTasks || !ganttScroll) return;
		switch (ganttScroll.action) {
			case 'left': engine.scrollToLeft(); break;
			case 'today': engine.scrollToToday(); break;
			case 'right': engine.scrollToRight(); break;
		}
	}, [ganttScroll, hasTasks]);

	const emptyReasons = useMemo(() => {
		const reasons: string[] = [];
		if (filter.status.selectedStatuses.length > 0) {
			reasons.push(i18n.t('views.ganttView.currentFilter', { count: filter.status.selectedStatuses.length }));
		}
		if (filter.tag.selectedTags.length > 0) {
			reasons.push(i18n.t('views.ganttView.tagFilter', { tags: filter.tag.selectedTags.join(', ') }));
		}
		if (!startField || !endField) {
			reasons.push(i18n.t('views.ganttView.missingFieldConfig'));
		}
		return reasons;
	}, [filter, startField, endField]);

	const controlBar = (
		<div className={GanttClasses.elements.treeBar}>
			<div className={GanttClasses.elements.treeBarGroup}>
				<button
					type="button"
					className={`${GanttClasses.elements.treeGroupBtn} ${!isFlatMode ? GanttClasses.modifiers.treeGroupBtnActive : ''}`}
					onClick={() => setGanttDisplayMode('tree')}
				>
					{i18n.t('views.ganttView.treeMode')}
				</button>
				<button
					type="button"
					className={`${GanttClasses.elements.treeGroupBtn} ${isFlatMode ? GanttClasses.modifiers.treeGroupBtnActive : ''}`}
					onClick={() => setGanttDisplayMode('flat')}
				>
					{i18n.t('views.ganttView.flatMode')}
				</button>
			</div>

			{!isFlatMode ? (
				<>
					<div className={GanttClasses.elements.treeBarGroup}>
						<button
							type="button"
							className={`${GanttClasses.elements.treeGroupBtn} ${ganttGroupMode === 'project-model' ? GanttClasses.modifiers.treeGroupBtnActive : ''}`}
							onClick={() => setGanttGroupMode('project-model')}
						>
							{i18n.t('views.ganttView.groupByProjectModel')}
						</button>
						<button
							type="button"
							className={`${GanttClasses.elements.treeGroupBtn} ${ganttGroupMode === 'model-only' ? GanttClasses.modifiers.treeGroupBtnActive : ''}`}
							onClick={() => setGanttGroupMode('model-only')}
						>
							{i18n.t('views.ganttView.groupByModelOnly')}
						</button>
					</div>

					<div className={GanttClasses.elements.treeBarGroup}>
						<button
							type="button"
							className={GanttClasses.elements.treeActionBtn}
							onClick={handleExpandAll}
						>
							{i18n.t('views.ganttView.expandAll')}
						</button>
						<button
							type="button"
							className={GanttClasses.elements.treeActionBtn}
							onClick={handleCollapseToFiles}
						>
							{i18n.t('views.ganttView.collapseToFiles')}
						</button>
						<button
							type="button"
							className={GanttClasses.elements.treeActionBtn}
							onClick={handleCollapseAll}
						>
							{i18n.t('views.ganttView.collapseAll')}
						</button>
					</div>

					<div className={GanttClasses.elements.treeSearchWrap}>
						<input
							type="text"
							className={GanttClasses.elements.treeSearchInput}
							value={searchQuery}
							placeholder={i18n.t('views.ganttView.searchPlaceholder')}
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
						{searchQuery ? (
							<button
								type="button"
								className={GanttClasses.elements.treeSearchClear}
								title={i18n.t('views.ganttView.clearSearch')}
								aria-label={i18n.t('views.ganttView.clearSearch')}
								onClick={() => setSearchQuery('')}
							>
								{'×'}
							</button>
						) : null}
					</div>
				</>
			) : null}
		</div>
	);

	if (!hasTasks) {
		return (
			<div className={`${ViewClasses.block} ${ViewClasses.modifiers.gantt}`}>
				{controlBar}
				<div className={GanttClasses.elements.emptyState}>
					<div className={GanttClasses.elements.emptyIcon}>{'📊'}</div>
					<h3 className={GanttClasses.elements.emptyTitle}>{i18n.t('views.ganttView.emptyTitle')}</h3>
					{emptyReasons.length > 0 ? (
						<p className={GanttClasses.elements.emptyReason}>
							{i18n.t('views.ganttView.possibleReasons')}{emptyReasons.join(', ')}
						</p>
					) : null}
					<p className={GanttClasses.elements.emptyHint}>{i18n.t('views.ganttView.checkDatesHint')}</p>
				</div>
			</div>
		);
	}

	return (
		<div className={`${ViewClasses.block} ${ViewClasses.modifiers.gantt}`}>
			{controlBar}
			{errorMsg ? (
				<div className={GanttClasses.elements.error}>
					{i18n.t('views.ganttView.renderError')}{errorMsg}
				</div>
			) : null}
			<div className={GanttClasses.elements.container}>
				<div ref={containerRef} className={GanttClasses.elements.root} />
			</div>
		</div>
	);
}

function tasksSignature(tasks: GanttChartTask[]): string {
	return tasks
		.map((t) => [
			t.id,
			t.lineNumber ?? '',
			t.content || '',
			t.start,
			t.end,
			t.leadStart || '',
			t.progress,
			t.completed,
			t.name,
			t.custom_class || '',
			t.treeNodeType || '',
			t.treeDepth ?? '',
			t.isRollupBar ? '1' : '0',
			t.hasChildren ? '1' : '0',
			t.isCollapsed ? '1' : '0',
			t.leafTaskCount ?? '',
			t.completedTaskCount ?? '',
			t.hasOutOfBoundsChildren ? '1' : '0',
			t.isInheritedDate ? '1' : '0',
		].join('|'))
		.join('\u0001');
}

/**
 * Full engine rebuild is only needed when the row ORDER or row structural shape
 * changes: bars are positioned by row index, and switching between entity bar
 * and rollup bracket bar changes the underlying SVG/DOM structure.
 */
function shouldFullRefresh(oldTasks: GanttChartTask[], newTasks: GanttChartTask[]): boolean {
	if (oldTasks.length !== newTasks.length) return true;
	for (let i = 0; i < oldTasks.length; i++) {
		if (oldTasks[i].id !== newTasks[i].id) return true;
		if (oldTasks[i].isCollapsed !== newTasks[i].isCollapsed) return true;
		if (oldTasks[i].treeNodeType !== newTasks[i].treeNodeType) return true;
		if (Boolean(oldTasks[i].isRollupBar) !== Boolean(newTasks[i].isRollupBar)) return true;
	}
	return false;
}
