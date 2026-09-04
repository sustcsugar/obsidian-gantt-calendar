import { useCallback,  useEffect, useMemo, useRef, useState, type JSX  } from 'react';
import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { GCTask, IPluginContext } from '../../types';
import type { CreateTaskData } from '../../utils/dailyNoteHelper';
import { createTaskInDailyNote } from '../../utils/dailyNoteHelper';
import type { TaskUpdates } from '../../tasks/taskSerializer';
import { updateTaskProperties } from '../../tasks/taskUpdater';
import { Logger } from '../../utils/logger';
import { i18n } from '../../i18n/i18n';
import { EditTaskModalClasses } from '../../utils/bem';
import { Modal } from '../components/Modal';
import { TagSelector } from './TagSelector';
import { RepeatSection } from './RepeatSection';
import { DateTimePicker } from '../components/DateTimePicker';
import { openReactModal } from './modalHost';

/**
 * 优先级选项
 */
export interface PriorityOption {
	value: 'highest' | 'high' | 'medium' | 'normal' | 'low' | 'lowest';
	label: string;
	icon: string;
}

export interface TaskFormModalProps {
	/** 创建或编辑模式 */
	mode: 'create' | 'edit';
	app: App;
	/** 创建模式需要：插件上下文 */
	plugin?: IPluginContext;
	/** 创建模式：目标日期/小时/分钟（预填 dueDate 时刻） */
	targetDate?: Date;
	targetHour?: number;
	targetMinute?: number;
	/** 创建模式：目标起止区间（预填 startDate+dueDate，均带时刻） */
	targetRange?: { start: Date; end: Date };
	/** 编辑模式需要：任务对象 */
	task?: GCTask;
	enabledFormats?: string[];
	allowEditContent?: boolean;
	onSuccess: () => void;
	/** 宿主关闭函数（真正卸载元素） */
	onClose: () => void;
}

// 模块级常量会在 import 时固化 i18n 文案，语言切换后不生效——
// 改为组件内按当前语言求值
function getPriorityOptions(): PriorityOption[] {
	return [
		{ value: 'highest', label: i18n.t('common.priority.highest'), icon: '🔺' },
		{ value: 'high', label: i18n.t('common.priority.high'), icon: '⏫' },
		{ value: 'medium', label: i18n.t('common.priority.medium'), icon: '🔼' },
		{ value: 'normal', label: i18n.t('common.priority.normal'), icon: '◽' },
		{ value: 'low', label: i18n.t('common.priority.low'), icon: '🔽' },
		{ value: 'lowest', label: i18n.t('common.priority.lowest'), icon: '⏬' },
	];
}

function getDateFields(): DateFieldDef[] {
	return [
		{ key: 'createdDate', label: i18n.t('modals.createTask.dateFields.created') },
		{ key: 'startDate', label: i18n.t('modals.createTask.dateFields.start') },
		{ key: 'scheduledDate', label: i18n.t('modals.createTask.dateFields.scheduled') },
		{ key: 'dueDate', label: i18n.t('modals.createTask.dateFields.due') },
		{ key: 'completionDate', label: i18n.t('modals.createTask.dateFields.completion') },
		{ key: 'cancelledDate', label: i18n.t('modals.createTask.dateFields.cancelled') },
	];
}

/** 日期字段定义 */
interface DateFieldDef {
	key: string;
	label: string;
}

/** 弹窗内联样式（原 BaseTaskModal.addStyles 的内容） */

/**
 * 任务创建/编辑弹窗（React，合并原 BaseTaskModal/CreateTaskModal/EditTaskModal）
 */
/**
 * 任务创建/编辑弹窗（React，合并原 BaseTaskModal/CreateTaskModal/EditTaskModal）
 */
export function TaskFormModal({
	mode,
	app,
	plugin,
	targetDate,
	targetHour,
	targetMinute,
	targetRange,
	task,
	enabledFormats,
	allowEditContent,
	onSuccess,
	onClose,
}: TaskFormModalProps): JSX.Element {
	const [open, setOpen] = useState(true);
	const priorityOptions = useMemo(getPriorityOptions, []);
	const dateFields = useMemo(getDateFields, []);

	// ========== 表单状态 ==========
	const [priority, setPriority] = useState<PriorityOption['value']>(
		mode === 'edit'
			? ((task?.priority as PriorityOption['value']) || 'normal')
			: (plugin?.settings.defaultTaskPriority || 'normal')
	);
	const [repeat, setRepeat] = useState<string | null>(mode === 'edit' ? (task?.repeat || null) : null);

	// 日期状态：{ key: Date | null }
	const initialDates = useMemo(() => {
		const d: Record<string, Date | null> = {};
		if (mode === 'edit' && task) {
			d.createdDate = task.createdDate || null;
			d.startDate = task.startDate || null;
			d.scheduledDate = task.scheduledDate || null;
			d.dueDate = task.dueDate || null;
			d.completionDate = task.completionDate || null;
			d.cancelledDate = task.cancelledDate || null;
		} else {
			const base = targetDate || new Date();
			const dayStart = new Date(base);
			dayStart.setHours(0, 0, 0, 0);
			d.createdDate = new Date(dayStart);
			d.dueDate = new Date(dayStart);
			d.startDate = null;
			d.scheduledDate = null;
			d.cancelledDate = null;
			d.completionDate = null;
			if (targetRange) {
				// 时间线拖拽选区：直接建成区间任务
				d.startDate = new Date(targetRange.start);
				d.dueDate = new Date(targetRange.end);
			} else if (targetHour !== undefined) {
				d.dueDate = new Date(dayStart);
				d.dueDate.setHours(targetHour, targetMinute ?? 0, 0, 0);
			}
		}
		return d;
	}, [mode, task, targetDate, targetHour, targetMinute, targetRange]);

	const [dates, setDates] = useState<Record<string, Date | null>>(initialDates);
	const [datePrecision, setDatePrecision] = useState<Record<string, 'day' | 'time'>>(
		mode === 'edit'
			? (task?.datePrecision ? { ...task.datePrecision } : {})
			: (targetRange ? { startDate: 'time', dueDate: 'time' } : (targetHour !== undefined ? { dueDate: 'time' } : {}))
	);
	const [selectedTags, setSelectedTags] = useState<string[]>(mode === 'edit' ? (task?.tags || []) : []);
	const [description, setDescription] = useState(mode === 'edit' ? (task?.description || '') : '');
	const descriptionRef = useRef<HTMLTextAreaElement | null>(null);

	// 编辑模式：变更跟踪
	const [priorityChanged, setPriorityChanged] = useState(false);
	const [repeatChanged, setRepeatChanged] = useState(false);
	const [datesChanged, setDatesChanged] = useState(false);
	const [contentChanged, setContentChanged] = useState(false);
	const [tagsChanged, setTagsChanged] = useState(false);

	// 创建模式自动聚焦描述框
	useEffect(() => {
		if (mode === 'create') {
			const t = window.setTimeout(() => descriptionRef.current?.focus(), 100);
			return () => window.clearTimeout(t);
		}
	}, [mode]);

	// 关闭只切状态，退出动画播完后由 onExited 从宿主移除。
	// 直接调 onClose 会立即卸载整个弹窗，动画中断且可能丢弃动画中的状态。
	// useCallback：Modal 的焦点管理 useEffect 依赖 onClose，
	// 未 memo 化会导致每次键入触发 focus 面板（输入框焦点被抢走）
	const handleClose = useCallback(() => setOpen(false), []);

	const isEdit = mode === 'edit';
	const title = isEdit ? i18n.t('modals.editTask.title') : i18n.t('modals.createTask.title');
	const saveText = isEdit ? i18n.t('common.save') : i18n.t('common.add');

	// ========== 保存逻辑 ==========
	const saveTask = async () => {
		if (mode === 'create') {
			if (!plugin) return;
			const desc = description.trim().replace(/[\r\n]+/g, ' ');
			if (!desc) {
				new Notice(i18n.t('modals.createTask.errorEmptyDescription'));
				descriptionRef.current?.focus();
				return;
			}
			if (dates.createdDate && dates.dueDate && dates.createdDate > dates.dueDate) {
				new Notice(i18n.t('modals.createTask.errorDateOrder'));
				return;
			}
			try {
				const taskData: CreateTaskData = {
					description: desc,
					priority: priority === 'normal' ? undefined : priority,
					repeat: repeat || undefined,
					createdDate: dates.createdDate!,
					startDate: dates.startDate,
					scheduledDate: dates.scheduledDate,
					dueDate: dates.dueDate!,
					completionDate: dates.completionDate,
					cancelledDate: dates.cancelledDate,
					tags: selectedTags.length > 0 ? selectedTags : undefined,
					datePrecision: Object.keys(datePrecision).length > 0 ? datePrecision : undefined,
				};
				const targetFilePath = await createTaskInDailyNote(app, taskData, plugin.settings, plugin.dailyNoteIndex);
				// 写回后立即刷新缓存并推送数据，跳过文件事件防抖回流
				if (targetFilePath && plugin.taskCache) {
					await plugin.taskCache.refreshFile(targetFilePath);
					const { useCalendarStore } = await import('../store/calendarStore');
					useCalendarStore.getState().notifyTasksUpdated(
						plugin.taskCache.getAllTasks(), targetFilePath
					);
				}
				new Notice(i18n.t('modals.createTask.success'));
				onSuccess();
				handleClose();
			} catch (error) {
				Logger.error('CreateTaskModal', 'Error creating task:', error);
				new Notice(i18n.t('modals.createTask.error', { error: (error as Error).message }));
			}
			return;
		}

		// 编辑模式
		if (!task) return;
		try {
			const updates: TaskUpdates = {};
			if (priorityChanged) updates.priority = priority;
			if (repeatChanged) updates.repeat = repeat;
			if (datesChanged) {
				updates.createdDate = dates.createdDate;
				updates.startDate = dates.startDate;
				updates.scheduledDate = dates.scheduledDate;
				updates.dueDate = dates.dueDate;
				updates.completionDate = dates.completionDate;
				updates.cancelledDate = dates.cancelledDate;
			}
			if (contentChanged) updates.content = description;
			if (tagsChanged) updates.tags = selectedTags;

			if (Object.keys(updates).length === 0) {
				handleClose();
				return;
			}
			// 日期精度变化时传入浅拷贝，不变异 store 中的共享任务对象
			const taskToUpdate = datesChanged
				? { ...task, datePrecision: { ...datePrecision } }
				: task;
			await updateTaskProperties(app, taskToUpdate, updates, enabledFormats || []);
			if (plugin?.taskCache) {
				await plugin.taskCache.refreshFile(taskToUpdate.filePath);
				const { useCalendarStore } = await import('../store/calendarStore');
				useCalendarStore.getState().notifyTasksUpdated(
					plugin.taskCache.getAllTasks(), taskToUpdate.filePath
				);
			}
			onSuccess();
			handleClose();
			new Notice(i18n.t('modals.editTask.success'));
		} catch (err) {
			Logger.error('editTask', 'Failed to update task', err);
			new Notice(i18n.t('modals.editTask.error'));
		}
	};

	// 编辑模式的标签推荐：通过 Obsidian 内部 API 获取所有任务
	const allTasksForTags = useMemo(() => {
		if (mode === 'create') {
			return plugin?.taskCache.getAllTasks() || [];
		}
		const internal = (app as unknown as Record<string, Record<string, Record<string, unknown>>>).plugins
			?.plugins?.['gantt-calendar'] as { taskCache?: { getAllTasks: () => GCTask[] } } | undefined;
		return internal?.taskCache?.getAllTasks() || [];
	}, [mode, plugin, app]);

	return (
		<Modal open={open} onClose={handleClose} onExited={onClose} title={title} width={560}>
			<div className={EditTaskModalClasses.block}>
				{/* 滚动容器 */}
				<div className={EditTaskModalClasses.elements.scrollContainer}>
					{/* 1. 任务描述板块（编辑模式仅在允许时显示） */}
					{!isEdit || allowEditContent ? (
						<div className={EditTaskModalClasses.elements.section}>
							<div className={EditTaskModalClasses.elements.descContainer}>
								<label className={EditTaskModalClasses.elements.sectionLabel}>
									{isEdit ? i18n.t('modals.editTask.descriptionLabel') : i18n.t('modals.createTask.descriptionLabel')}
								</label>
								<div className={EditTaskModalClasses.elements.sectionHint}>
									{isEdit ? i18n.t('modals.editTask.submitHint') : i18n.t('modals.createTask.submitHint')}
								</div>
								<textarea
									ref={descriptionRef}
									className={EditTaskModalClasses.elements.descTextarea}
									placeholder={isEdit ? undefined : i18n.t('modals.createTask.descriptionPlaceholder')}
									value={description}
									onChange={(e) => {
										const v = e.target.value.replace(/[\r\n]+/g, ' ');
										setDescription(v);
										if (isEdit) setContentChanged(true);
									}}
									onKeyDown={(e) => {
										if (e.key === 'Enter') {
											e.preventDefault();
											void saveTask();
										}
									}}
								/>
							</div>
						</div>
					) : null}

					{/* 2. 优先级板块 */}
					<div className={EditTaskModalClasses.elements.section}>
						<div className={EditTaskModalClasses.elements.priorityContainer}>
							<label className={EditTaskModalClasses.elements.sectionLabel}>
								{i18n.t('modals.editTask.priorityLabel')}
							</label>
							<div className={EditTaskModalClasses.elements.priorityGrid}>
								{priorityOptions.map(option => (
									<button
										key={option.value}
										className={[
											EditTaskModalClasses.elements.priorityBtn,
											...(option.value === priority ? [EditTaskModalClasses.elements.priorityBtnSelected] : []),
										].join(' ')}
										data-value={option.value}
										onClick={() => {
											setPriority(option.value);
											if (isEdit) setPriorityChanged(true);
										}}
									>
										{`${option.icon} ${option.label}`}
									</button>
								))}
							</div>
						</div>
					</div>

					{/* 3. 时间设置板块 */}
					<div className={EditTaskModalClasses.elements.section}>
						<div className={EditTaskModalClasses.elements.datesContainer}>
							<label className={EditTaskModalClasses.elements.sectionLabel}>
								{i18n.t('modals.editTask.datesLabel')}
							</label>
							<div className={EditTaskModalClasses.elements.datesGrid}>
								{dateFields.map(field => (
									<DateField
										key={field.key}
										label={field.label}
										current={dates[field.key] ?? null}
										onChange={(d) => {
											setDates((prev) => ({ ...prev, [field.key]: d }));
											if (isEdit) setDatesChanged(true);
										}}
										onPrecisionChange={(precision) => {
											setDatePrecision((prev) => ({ ...prev, [field.key]: precision }));
										}}
									/>
								))}
							</div>
						</div>
					</div>

					{/* 3.5. 周期设置板块 */}
					<div className={EditTaskModalClasses.elements.section} style={{ marginBottom: '20px' }}>
						<RepeatSection
							value={repeat}
							onChange={(rule) => {
								setRepeat(rule);
								if (isEdit) setRepeatChanged(true);
							}}
							prefix={isEdit ? 'editTask' : 'createTask'}
						/>
					</div>

					{/* 4. 标签选择器 */}
					<div className={EditTaskModalClasses.elements.section} style={{ marginBottom: '20px' }}>
						<div className={EditTaskModalClasses.elements.tagsSection}>
							<TagSelector
								allTasks={allTasksForTags}
								initialTags={selectedTags}
								onChange={(tags) => {
									setSelectedTags(tags);
									if (isEdit) setTagsChanged(true);
								}}
							/>
						</div>
					</div>
				</div>

				{/* 操作按钮 */}
				<div className={EditTaskModalClasses.elements.buttons}>
					<button onClick={handleClose}>{i18n.t('common.cancel')}</button>
					<button className="mod-cta" onClick={() => void saveTask()}>
						{saveText}
					</button>
				</div>
			</div>
		</Modal>
	);
}

// ==================== 日期字段（Linear 风格日期时间选择器） ====================

interface DateFieldProps {
	label: string;
	current: Date | null;
	onChange: (d: Date | null) => void;
	onPrecisionChange: (precision: 'day' | 'time') => void;
}

function DateField({ label, current, onChange, onPrecisionChange }: DateFieldProps): JSX.Element {
	return (
		<div className={EditTaskModalClasses.elements.dateItem}>
			<label className={EditTaskModalClasses.elements.dateLabel}>{label}</label>
			<div className={EditTaskModalClasses.elements.dateInputContainer}>
				<DateTimePicker
					value={current}
					placeholder={i18n.t('modals.editTask.datePlaceholder')}
					onChange={(d) => {
						onChange(d);
						if (!d) {
							onPrecisionChange('day');
						} else {
							onPrecisionChange(d.getHours() !== 0 || d.getMinutes() !== 0 ? 'time' : 'day');
						}
					}}
				/>
			</div>
		</div>
	);
}

// ==================== 命令式 API（兼容旧调用方） ====================

/**
 * 打开创建任务弹窗（命令式，兼容旧 new CreateTaskModal().open()）
 */
export function openCreateTaskModal(options: {
	app: App;
	plugin: IPluginContext;
	targetDate?: Date;
	targetHour?: number;
	targetMinute?: number;
	targetRange?: { start: Date; end: Date };
	onSuccess: () => void;
}): void {
	const close = openReactModal(
		<TaskFormModal
			mode="create"
			app={options.app}
			plugin={options.plugin}
			targetDate={options.targetDate}
			targetHour={options.targetHour}
			targetMinute={options.targetMinute}
			targetRange={options.targetRange}
			onSuccess={options.onSuccess}
			onClose={() => close()}
		/>
	);
}

/**
 * 打开编辑任务弹窗（命令式，兼容旧 openEditTaskModal()）
 */
export function openEditTaskModal(
	app: App,
	task: GCTask,
	enabledFormats: string[],
	onSuccess: () => void,
	allowEditContent?: boolean
): void {
	const close = openReactModal(
		<TaskFormModal
			mode="edit"
			app={app}
			task={task}
			enabledFormats={enabledFormats}
			allowEditContent={allowEditContent}
			onSuccess={onSuccess}
			onClose={() => close()}
		/>
	);
}

/** 导出类型（兼容旧 re-export） */
export type { RepeatConfig } from '../../utils/repeatRules';