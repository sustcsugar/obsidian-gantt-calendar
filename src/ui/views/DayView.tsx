import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from 'react';
import { taskKey } from '../utils/taskKey';
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from 'react';
import { Notice } from 'obsidian';
import type { Component } from 'obsidian';
import type { GCTask } from '../../types';
import { getTaskDateField } from '../../types';
import type { DailyNoteIndex } from '../../utils/dailyNoteSettingsBridge';
import { DayViewClasses, EmbeddedEditorClasses, withModifiers } from '../../utils/bem';
import { DayViewConfig } from '../../components/TaskCard';
import { usePlugin, useApp } from '../pluginContext';
import { useCalendarStore, selectViewFilter } from '../store/calendarStore';
import { applyStatusFilter, applyTagFilter, applySort } from '../utils/taskFilters';
import { TaskCard } from '../components/TaskCard';
import { Icon } from '../components/Icon';
import { useDropTarget } from '../utils/useDragAndDrop';
import { useResizeDivider } from '../utils/useResizeDivider';
import { updateTaskDateField } from '../../tasks/taskUpdater';
import { isTodayInTimezone } from '../../dateUtils/timezone';
import { sortTasks } from '../../tasks/taskSorter';
import { generateVirtualInstances } from '../../tasks/virtualTaskGenerator';
import { EmbeddedNoteEditor } from '../../views/EmbeddedNoteEditor';
import { openCreateTaskModal } from '../modals/TaskFormModal';
import { i18n } from '../../i18n/i18n';
import { Logger } from '../../utils/logger';
import { RegularExpressions } from '../../utils/RegularExpressions';

/**
 * React 日视图
 * 保留原 DOM 结构与 BEM 类名，支持任务列表、时间轴布局、嵌入式 Daily Note
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
	const layout = plugin.settings.dayViewLayout || 'horizontal';
	const dateField = plugin.settings.dateFilterField || 'dueDate';

	const config = useMemo(() => ({ ...DayViewConfig }), []);
	const timelineConfig = useMemo(() => ({ ...DayViewConfig, enableDrag: true, variant: 'timeline' as const }), []);

	const normalized = useMemo(() => {
		const d = new Date(currentDate);
		d.setHours(0, 0, 0, 0);
		return d;
	}, [currentDate]);

	// ===== 任务数据（保持原日视图分片逻辑） =====
	const dayTasks = useMemo(() => {
		const scoped = applySort(applyTagFilter(applyStatusFilter(tasks, filter.status), filter.tag), filter.sort);
		const real: GCTask[] = [];
		for (const task of scoped) {
			const dateValue = getTaskDateField(task, dateField);
			if (!dateValue) continue;
			const taskDate = new Date(dateValue);
			if (isNaN(taskDate.getTime())) continue;
			taskDate.setHours(0, 0, 0, 0);
			if (taskDate.getTime() === normalized.getTime()) real.push(task);
		}
		const virtualInstances = generateVirtualInstances(
			scoped,
			normalized,
			normalized,
			dateField,
			plugin.settings.recurringTaskDisplayLimit ?? 5
		);
		const sorted = sortTasks([...real, ...virtualInstances], filter.sort);
		const allday: GCTask[] = [];
		const timed: GCTask[] = [];
		for (const task of sorted) {
			if (task.datePrecision?.[dateField] === 'time') timed.push(task);
			else allday.push(task);
		}
		return { sorted, allday, timed, hasTimed: timed.length > 0 };
	}, [tasks, filter, normalized, dateField, plugin.settings.recurringTaskDisplayLimit]);

	// ===== 时间轴：按小时分组（全天任务作为 0 时） =====
	const tasksByHour = useMemo(() => {
		const map = new Map<number, GCTask[]>();
		for (const task of dayTasks.allday) {
			if (!map.has(0)) map.set(0, []);
			map.get(0)!.push(task);
		}
		for (const task of dayTasks.timed) {
			const val = getTaskDateField(task, dateField);
			if (val instanceof Date) {
				const hour = val.getHours();
				if (!map.has(hour)) map.set(hour, []);
				map.get(hour)!.push(task);
			}
		}
		return map;
	}, [dayTasks, dateField]);

	// ===== 当前时间指示线 =====
	const timeGridRef = useRef<HTMLDivElement | null>(null);
	const [currentLineTop, setCurrentLineTop] = useState<number | null>(null);

	const updateCurrentLine = useCallback(() => {
		if (!dayTasks.hasTimed || !isTodayInTimezone(normalized)) {
			setCurrentLineTop(null);
			return;
		}
		const gridEl = timeGridRef.current;
		if (!gridEl) return;
		const slots = gridEl.querySelectorAll(`.${DayViewClasses.elements.timeSlot}`);
		const currentHour = new Date().getHours();
		const slot = slots[currentHour] as HTMLElement | undefined;
		if (!slot) {
			setCurrentLineTop(null);
			return;
		}
		const slotTop = slot.offsetTop;
		const slotHeight = slot.offsetHeight;
		const minuteOffset = (new Date().getMinutes() / 60) * slotHeight;
		setCurrentLineTop(slotTop + minuteOffset);
	}, [dayTasks.hasTimed, normalized]);

	useLayoutEffect(updateCurrentLine, [updateCurrentLine]);

	// 每 30s 重算一次当前时间线，否则挂机数小时后位置严重滞后
	useEffect(() => {
		const timer = window.setInterval(updateCurrentLine, 30_000);
		return () => window.clearInterval(timer);
	}, [updateCurrentLine]);

	// ===== 时间格拖放 =====
	const handleHourDrop = useCallback((taskId: string, hour: number) => {
		const [filePath, lineNum] = taskId.split(':');
		const lineNumber = parseInt(lineNum, 10);
		const sourceTask = tasks.find((t) => t.filePath === filePath && t.lineNumber === lineNumber);
		if (!sourceTask) {
			Logger.error('DayView', 'Source task not found:', taskId);
			return;
		}
		void (async () => {
			try {
				const newDate = new Date(normalized);
				newDate.setHours(hour, 0, 0, 0);
				// 拖到时间格 = time 精度。传入浅拷贝而非变异 store 中的共享对象
				const timedTask = { ...sourceTask, datePrecision: { ...sourceTask.datePrecision, [dateField]: 'time' } };
				await updateTaskDateField(app, timedTask, dateField, newDate, plugin.settings.enabledTaskFormats);
				await plugin.taskCache.refreshFile(sourceTask.filePath);
				refreshTasks();
				Logger.debug('DayView', 'Task time updated via drag-drop', { taskId, hour });
			} catch (error) {
				Logger.error('DayView', 'Error updating task time:', error);
				new Notice(i18n.t('views.dayView.updateTimeFailed'));
			}
		})();
	}, [app, dateField, plugin.settings.enabledTaskFormats, tasks, normalized]);

	const { onDragOver: slotDragOver, onDragLeave: slotDragLeave, onDrop: slotDrop } = useDropTarget({
		onDrop: (taskId, e) => {
			const slot = e.currentTarget;
			const slotIdx = slot.dataset.hour ? parseInt(slot.dataset.hour, 10) : 0;
			handleHourDrop(taskId, slotIdx);
		},
		activeClass: DayViewClasses.modifiers.timeSlotDragOver,
	});

	const slotDropProps = (hour: number): { onDragOver: (e: ReactDragEvent<HTMLDivElement>) => void; onDragLeave: (e: ReactDragEvent<HTMLDivElement>) => void; onDrop: (e: ReactDragEvent<HTMLDivElement>) => void; 'data-hour': number } => ({
		onDragOver: slotDragOver,
		onDragLeave: slotDragLeave,
		onDrop: slotDrop,
		'data-hour': hour,
	});

	// ===== 空时间格快速创建 =====
	const handleSlotCreateClick = useCallback((e: ReactMouseEvent<HTMLDivElement>, hour: number) => {
		e.stopPropagation();
		openCreateTaskModal({
			app,
			plugin,
			targetDate: normalized,
			targetHour: hour,
			onSuccess: () => {
			},
		});
	}, [app, plugin, normalized]);

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

	// ===== 任务列表渲染（时间轴 / 列表） =====
	const renderTaskList = (): JSX.Element => {
		if (dayTasks.hasTimed) {
			return (
				<div className={DayViewClasses.elements.timeline}>
					<div ref={timeGridRef} className={DayViewClasses.elements.timeGrid}>
						{Array.from({ length: 24 }, (_, h) => {
							const hourTasks = tasksByHour.get(h) || [];
							return (
								<div
									key={h}
									className={DayViewClasses.elements.timeSlot}
									{...slotDropProps(h)}
								>
									<div className={DayViewClasses.elements.timeLabel}>
										{`${String(h).padStart(2, '0')}:00`}
									</div>
									<div className={DayViewClasses.elements.timeTasks}>
										{hourTasks.map((t) => (
											<TaskCard
												key={taskKey(t)}
												task={t}
												config={timelineConfig}
												targetDate={normalized}
												onRefresh={handleCardRefresh}
											/>
										))}
									</div>
									{hourTasks.length === 0 ? (
										<div
											className={DayViewClasses.elements.slotCreate}
											role="button"
											tabIndex={0}
											onKeyDown={(e) => {
												if (e.key === 'Enter' || e.key === ' ') {
													e.preventDefault();
													handleSlotCreateClick(e as unknown as ReactMouseEvent<HTMLDivElement>, h);
												}
											}}
											onClick={(e) => handleSlotCreateClick(e, h)}
										>
											<Icon icon="plus" />
										</div>
									) : null}
								</div>
							);
						})}
						{currentLineTop !== null ? (
							<div
								className={DayViewClasses.elements.currentTimeLine}
								style={{ top: `${currentLineTop}px` }}
							/>
						) : null}
					</div>
				</div>
			);
		}

		if (dayTasks.sorted.length === 0) {
			return <div className="gantt-task-empty">{i18n.t('common.noTasks')}</div>;
		}

		return (
			<div className={DayViewClasses.elements.taskList}>
				{dayTasks.sorted.map((t) => (
					<TaskCard
						key={taskKey(t)}
						task={t}
						config={config}
						targetDate={normalized}
						onRefresh={handleCardRefresh}
					/>
				))}
			</div>
		);
	};

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
					onMouseDown={layout === 'horizontal' ? handleDividerMouseDown : handleDividerMouseDownVertical}
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

