import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Notice } from 'obsidian';
import type { Component } from 'obsidian';
import type { GCTask } from '../../types';
import type { DailyNoteIndex } from '../../utils/dailyNoteSettingsBridge';
import { DayViewClasses, EmbeddedEditorClasses, withModifiers } from '../../utils/bem';
import { DayViewConfig } from '../../components/TaskCard';
import { usePlugin, useApp } from '../pluginContext';
import { useCalendarStore, selectViewFilter } from '../store/calendarStore';
import { isPhoneNow } from '../utils/platform';
import { applyStatusFilter, applyTagFilter, applySort } from '../utils/taskFilters';
import { TaskCard } from '../components/TaskCard';
import { Icon } from '../components/Icon';
import { useDropTarget } from '../utils/useDragAndDrop';
import { useResizeDivider } from '../utils/useResizeDivider';
import { updateTaskProperties } from '../../tasks/taskUpdater';
import { sortTasks } from '../../tasks/taskSorter';
import { generateVirtualInstances } from '../../tasks/virtualTaskGenerator';
import { EmbeddedNoteEditor } from '../../views/EmbeddedNoteEditor';
import { buildDayTimelineModel, getTaskInterval } from './week/timelineModel';
import { DayTimelineCanvas } from './week/DayTimelineCanvas';
import { i18n } from '../../i18n/i18n';
import { Logger } from '../../utils/logger';
import { RegularExpressions } from '../../utils/RegularExpressions';
import type { DateFieldType } from '../../settings/types';

/** dataTransfer.taskId（filePath:lineNumber）→ 任务查找 */
function findTaskById(tasks: GCTask[], taskId: string): GCTask | null {
	const [filePath, lineNum] = taskId.split(':');
	const lineNumber = parseInt(lineNum, 10);
	return tasks.find((t) => t.filePath === filePath && t.lineNumber === lineNumber) || null;
}

/**
 * React 日视图
 * 任务区 = 全天区 + 共享单日连续画布（与周视图/侧栏今日时间线同语义）；
 * 保留分屏布局与嵌入式 Daily Note
 */
export function DayView(): JSX.Element {
	const plugin = usePlugin();
	const app = useApp();
	const currentDate = useCalendarStore((s) => s.currentDate);
	const tasks = useCalendarStore((s) => s.tasks);
	const filter = useCalendarStore((s) => selectViewFilter(s, 'day'));
	const refreshTasks = useCalendarStore((s) => s.refreshTasks);
	// 稳定回调：TaskCard 已 memo，内联箭头函数会使 memo 失效
	const handleCardRefresh = useCallback(() => refreshTasks(), [refreshTasks]);

	const enableDailyNote = plugin.settings.enableDailyNote !== false;
	// 手机端强制上下分屏（左右分屏在窄屏两侧各 ~160px 不可用）
	const layout = isPhoneNow() ? 'vertical' : (plugin.settings.dayViewLayout || 'horizontal');
	const dateField = plugin.settings.dateFilterField || 'dueDate';
	const startField = plugin.settings.ganttStartField || 'startDate';
	const endField = plugin.settings.ganttEndField || 'dueDate';

	const config = useMemo(() => ({ ...DayViewConfig }), []);
	const timelineConfig = useMemo(() => ({
		...DayViewConfig,
		enableDrag: true,
		// 画布块信息密度高且可能被裁剪，悬浮详情弹窗与周视图/侧栏保持一致开启
		// （DayViewConfig 预设的 false 是旧版简化列表的遗留）
		enableTooltip: true,
		variant: 'timeline' as const,
	}), []);

	const normalized = useMemo(() => {
		const d = new Date(currentDate);
		d.setHours(0, 0, 0, 0);
		return d;
	}, [currentDate]);

	// ===== 任务数据：视图筛选 + 虚拟周期实例 → 单日连续画布模型 =====
	const model = useMemo(() => {
		const scoped = applySort(applyTagFilter(applyStatusFilter(tasks, filter.status), filter.tag), filter.sort);
		const virtualInstances = generateVirtualInstances(
			scoped,
			normalized,
			normalized,
			dateField,
			plugin.settings.recurringTaskDisplayLimit ?? 5
		);
		const combined = sortTasks([...scoped, ...virtualInstances], filter.sort).filter((t) => !t.cancelled);
		return buildDayTimelineModel(combined, normalized, startField, endField, dateField);
	}, [tasks, filter, normalized, dateField, startField, endField, plugin.settings.recurringTaskDisplayLimit]);

	// 任务全集（拖放源查找）
	const dragLookupTasks = useMemo(() => tasks.filter((t) => !t.cancelled), [tasks]);

	// ===== 全天区拖放：转全天（day 精度） =====
	const handleAllDayDrop = useCallback((taskId: string): void => {
		const task = findTaskById(dragLookupTasks, taskId);
		if (!task) return;
		const interval = getTaskInterval(task, startField, endField, dateField);
		const updates: Partial<Record<DateFieldType, Date>> = {};
		let precision: Partial<Record<DateFieldType, 'day' | 'time'>> = {};
		if (interval) {
			updates[startField] = normalized;
			updates[endField] = normalized;
			precision = { [startField]: 'day', [endField]: 'day' };
		} else {
			updates[dateField] = normalized;
			precision = { [dateField]: 'day' };
		}
		void (async () => {
			try {
				const taskToUpdate = { ...task, datePrecision: { ...task.datePrecision, ...precision } };
				await updateTaskProperties(app, taskToUpdate, updates, plugin.settings.enabledTaskFormats || []);
				await plugin.taskCache.refreshFile(task.filePath);
				refreshTasks();
			} catch (error) {
				Logger.error('DayView', 'Set all-day failed:', error);
				new Notice(i18n.t('views.dayView.updateTaskFailed'));
			}
		})();
	}, [dragLookupTasks, normalized, app, plugin, startField, endField, dateField, refreshTasks]);

	const allDayDropProps = useDropTarget({
		onDrop: (taskId) => handleAllDayDrop(taskId),
		activeClass: 'gc-day-view__allday--drag-over',
	});

	// ===== 分割线拖拽（水平/垂直） =====
	const tasksSectionRef = useRef<HTMLDivElement | null>(null);
	const notesSectionRef = useRef<HTMLDivElement | null>(null);

	const handleDividerMouseDown = useResizeDivider({
		direction: 'horizontal',
		firstRef: tasksSectionRef,
		secondRef: notesSectionRef,
	});

	const handleDividerMouseDownVertical = useResizeDivider({
		direction: 'vertical',
		firstRef: tasksSectionRef,
		secondRef: notesSectionRef,
	});

	// ===== 嵌入式 Daily Note =====
	const notesContentRef = useRef<HTMLDivElement | null>(null);
	const editorRef = useRef<EmbeddedNoteEditor | null>(null);
	const notesTitleRef = useRef<HTMLHeadingElement | null>(null);
	const modeToggleRef = useRef<HTMLButtonElement | null>(null);
	const [editorMode, setEditorMode] = useState<string | null>(null);

	useEffect(() => {
		if (!enableDailyNote) return;
		const container = notesContentRef.current;
		if (!container) return;
		const editor = new EmbeddedNoteEditor(app, container);
		editorRef.current = editor;
		return () => {
			editorRef.current = null;
			void editor.close();
		};
	}, [app, enableDailyNote, layout]);

	useEffect(() => {
		if (!enableDailyNote || !editorRef.current) return;
		let cancelled = false;
		void (async () => {
			const editor = editorRef.current;
			if (!editor) return;
			await editor.openDate(
				new Date(normalized),
				plugin.dailyNoteIndex as DailyNoteIndex,
				plugin.settings,
				plugin.calendarView as unknown as Component
			);
			if (cancelled) return;
			if (notesTitleRef.current) {
				const filePath = editor.getCurrentFilePath();
				const fileName = filePath
					? (filePath.split('/').pop() ?? '').replace(RegularExpressions.markdownFileExtensionRegex, '')
					: '';
				notesTitleRef.current.textContent = fileName || i18n.t('common.dailyNote');
			}
			setEditorMode(editor.getMode());
		})();
		return () => {
			cancelled = true;
		};
	}, [app, plugin, normalized, enableDailyNote, layout]);

	const handleModeToggle = useCallback(() => {
		const editor = editorRef.current;
		if (!editor) return;
		const currentMode = editor.getMode();
		if (currentMode === 'source') {
			editor.switchToPreview();
			setEditorMode('preview');
		} else {
			editor.switchToSource();
			setEditorMode('source');
		}
	}, []);

	useEffect(() => {
		const btnEl = modeToggleRef.current;
		if (!btnEl) return;
		if (editorMode === 'source' || editorMode === null) {
			btnEl.setAttribute('aria-label', i18n.t('views.dayView.switchToPreview'));
		} else {
			btnEl.setAttribute('aria-label', i18n.t('views.dayView.switchToEdit'));
		}
	}, [editorMode]);

	// ===== 任务区渲染：全天区 + 共享连续画布 =====
	const renderTaskList = (): JSX.Element => (
		<>
			{(model.allday.length > 0) ? (
				<div className={DayViewClasses.elements.alldaySection} {...allDayDropProps}>
					<div className={DayViewClasses.elements.alldayLabel}>
						{i18n.t('views.weekView.allDay')}
					</div>
					<div className={DayViewClasses.elements.alldayTasks}>
						{model.allday.map(({ task, timeLabel }) => (
							<div key={`${task.filePath}:${task.lineNumber}`} className={DayViewClasses.elements.alldayItem}>
								<TaskCard
									task={task}
									config={timelineConfig}
									targetDate={normalized}
									onRefresh={handleCardRefresh}
								/>
								{timeLabel ? (
									<span className={DayViewClasses.elements.alldayTime}>{timeLabel}</span>
								) : null}
							</div>
						))}
					</div>
				</div>
			) : null}
			{model.blocks.length === 0 && model.allday.length === 0 ? (
				<div className="gantt-task-empty">{i18n.t('common.noTasks')}</div>
			) : null}
			<DayTimelineCanvas
				day={normalized}
				model={model}
				config={timelineConfig}
				tasks={dragLookupTasks}
				refresh={handleCardRefresh}
			/>
		</>
	);

	// ===== 仅任务模式（不显示 Daily Note） =====
	if (!enableDailyNote) {
		return (
			<div className="gc-view gc-view--day">
				<div className={withModifiers(DayViewClasses.block, DayViewClasses.modifiers.tasksOnly)}>
					<h3 className={DayViewClasses.elements.title}>{i18n.t('views.dayView.todayTasks')}</h3>
					{renderTaskList()}
				</div>
			</div>
		);
	}

	// ===== 分屏布局（水平 / 垂直） =====
	return (
		<div className="gc-view gc-view--day">
			<div
				className={layout === 'horizontal' ? DayViewClasses.modifiers.horizontal : DayViewClasses.modifiers.vertical}
			>
				<div ref={tasksSectionRef} className={DayViewClasses.elements.sectionTasks}>
					<h3 className={DayViewClasses.elements.title}>{i18n.t('views.dayView.todayTasks')}</h3>
					{renderTaskList()}
				</div>
				<div
					className={layout === 'horizontal' ? DayViewClasses.elements.divider : DayViewClasses.elements.dividerVertical}
					onPointerDown={layout === 'horizontal' ? handleDividerMouseDown : handleDividerMouseDownVertical}
				/>
				<div ref={notesSectionRef} className={DayViewClasses.elements.sectionNotes}>
					<div className={DayViewClasses.elements.notesHeader}>
						<h3 ref={notesTitleRef} className={DayViewClasses.elements.title}>{i18n.t('common.dailyNote')}</h3>
						<button
							ref={modeToggleRef}
							className={EmbeddedEditorClasses.elements.modeToggle}
							aria-label={i18n.t('views.dayView.switchToPreview')}
							onClick={handleModeToggle}
						>
							<Icon icon={editorMode === 'source' || editorMode === null ? 'pencil' : 'book-open'} />
						</button>
					</div>
					<div ref={notesContentRef} className={DayViewClasses.elements.notesContent} />
				</div>
			</div>
		</div>
	);
}
