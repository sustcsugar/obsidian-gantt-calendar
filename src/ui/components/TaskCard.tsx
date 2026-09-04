import { memo, useMemo, type CSSProperties, type JSX } from 'react';
import type { GCTask } from '../../types';
import type { TaskCardConfig } from '../../components/TaskCard/TaskCardConfig';
import { TaskCardClasses, TimeBadgeClasses } from '../../utils/bem';
import { isVirtualTask, getVirtualMetadata } from '../../tasks/virtualTaskGenerator';
import { getStatusColor, DEFAULT_TASK_STATUSES, getCurrentThemeMode } from '../../tasks/taskStatus';
import { formatDate } from '../../dateUtils/dateUtilsIndex';
import { toISOStringLocal } from '../../dateUtils/timezone';
import { usePlugin, useApp } from '../pluginContext';
import { DescriptionWithLinks } from './DescriptionWithLinks';
import { TagPillSpan } from './TagPillSpan';
import { ContextMenuTrigger, type ContextMenuSection } from './ContextMenu';
import { useTaskTooltip } from './TooltipProvider';
import { useDragSource } from '../utils/useDragAndDrop';
import { openFileInExistingLeaf } from '../../utils/fileOpener';
import { isTouchNow } from '../utils/platform';
import { updateTaskCompletion } from '../../tasks/taskUpdater';
import { completeRecurringTask } from '../../tasks/recurringTaskCompleter';
import { openEditTaskModal } from '../modals/TaskFormModal';
import { createNoteFromTask } from '../../contextMenu/commands/createNoteFromTask';
import { createNoteFromTaskAlias } from '../../contextMenu/commands/createNoteFromTaskAlias';
import { postponeTask } from '../../contextMenu/commands/postponeTask';
import { cancelTask } from '../../contextMenu/commands/cancelTask';
import { restoreTask } from '../../contextMenu/commands/restoreTask';
import { deleteTask } from '../../contextMenu/commands/deleteTask';
import { setTaskStatus } from '../../contextMenu/commands/setTaskStatus';
import { setTaskPriority } from '../../contextMenu/commands/setPriority';
import { i18n } from '../../i18n/i18n';
import { Logger } from '../../utils/logger';
import { useCalendarStore } from '../store/calendarStore';

export interface ReactTaskCardProps {
	task: GCTask;
	config: TaskCardConfig;
	targetDate?: Date;
	onClick?: (task: GCTask) => void;
	onRefresh?: () => void;
}

const PRIORITY_ICONS: Record<string, string> = {
	highest: '🔺',
	high: '⏫',
	medium: '🔼',
	low: '🔽',
	lowest: '⏬',
};

const PRIORITY_CLASSES: Record<string, string> = {
	highest: 'priority-highest',
	high: 'priority-high',
	medium: 'priority-medium',
	low: 'priority-low',
	lowest: 'priority-lowest',
};

function formatDateForDisplay(date: Date, precision?: 'day' | 'time'): string {
	if (precision === 'time') {
		return formatDate(date, 'yyyy-MM-dd HH:mm');
	}
	return formatDate(date, 'yyyy-MM-dd');
}

/**
 * React 任务卡片组件
 * 输出与原 TaskCardComponent 完全一致的 DOM 结构与 BEM 类名
 */
// memo：tasks 数组引用每次刷新都会变化，但未变化的任务卡片
//（props 中 task/config/回调均稳定）应跳过重渲染——
// 调用方需用 useCallback 稳定 onRefresh，否则 memo 无效
export const TaskCard = memo(function TaskCard({ task, config, targetDate, onClick, onRefresh }: ReactTaskCardProps): JSX.Element {
	const plugin = usePlugin();
	const app = useApp();
	const virtual = isVirtualTask(task);
	const tooltip = useTaskTooltip();

	// ===== 类名组装 =====
	const classes = useMemo(() => {
		const list = [TaskCardClasses.block];
		const viewKey = `${config.viewModifier}View` as keyof typeof TaskCardClasses.modifiers;
		const mod = TaskCardClasses.modifiers[viewKey];
		if (mod) list.push(mod);
		if (config.variant === 'timeline') list.push(TaskCardClasses.modifiers.timeline);
		if (config.compact) list.push(TaskCardClasses.modifiers.compact);
		if (virtual) list.push(TaskCardClasses.modifiers.virtual);
		else if (task.repeat) list.push(TaskCardClasses.modifiers.recurring);
		list.push(task.completed ? TaskCardClasses.modifiers.completed : TaskCardClasses.modifiers.pending);
		// 有自定义状态时添加 task-with-status，激活 CSS 变量卡片着色
		if (task.status && !task.completed) list.push('task-with-status');
		return list;
	}, [config.viewModifier, config.variant, config.compact, virtual, task.repeat, task.completed, task.status]);

	// ===== 状态颜色 =====
	const style = useMemo<CSSProperties | undefined>(() => {
		if (!task.status) return undefined;
		const statuses = plugin.settings?.taskStatuses || DEFAULT_TASK_STATUSES;
		const colors = getStatusColor(task.status, statuses, getCurrentThemeMode());
		if (!colors) return undefined;
		return {
			'--task-bg-color': colors.bg,
			'--task-text-color': colors.text,
		} as CSSProperties;
	}, [task.status, plugin.settings, task.completed]);

	// ===== 富文本描述 =====
	const description = useMemo(() => {
		if (!config.showDescription) return null;
		const gf = (plugin.settings.globalTaskFilter || '').trim();
		const textCls = [TaskCardClasses.elements.text];
		if (config.maxLines) textCls.push(TaskCardClasses.modifiers.textLimited);
		const style: CSSProperties | undefined = config.maxLines
			? ({ ['--max-lines']: String(config.maxLines) } as CSSProperties)
			: undefined;
		return (
			<div className={textCls.join(' ')} style={style}>
				{plugin.settings.showGlobalFilterInTaskText && gf ? `${gf} ` : ''}
				<DescriptionWithLinks text={task.description} app={app} />
			</div>
		);
	}, [config.showDescription, config.maxLines, plugin.settings, task.description, app]);

	// ===== 右键菜单（声明式 sections，复用 contextMenu 命令模块） =====
	const menuSections = useMemo<ContextMenuSection[]>(() => {
		if (virtual) return [];
		const enabledFormats = plugin.settings.enabledTaskFormats || ['tasks'];
		const taskNotePath = plugin.settings.taskNotePath || 'Tasks';
		const refresh = onRefresh || (() => {});
		const isCancelled = task.cancelled === true;

		const priorities: Array<{ value: 'highest' | 'high' | 'medium' | 'low' | 'lowest' | 'normal'; label: string; icon: string }> = [
			{ value: 'highest', label: i18n.t('common.priority.highest'), icon: '🔺' },
			{ value: 'high', label: i18n.t('common.priority.high'), icon: '⏫' },
			{ value: 'medium', label: i18n.t('common.priority.medium'), icon: '🔼' },
			{ value: 'normal', label: i18n.t('common.priority.normal'), icon: '◽' },
			{ value: 'low', label: i18n.t('common.priority.low'), icon: '🔽' },
			{ value: 'lowest', label: i18n.t('common.priority.lowest'), icon: '⏬' },
		];
		const postponeOptions = [
			{ days: 1, label: i18n.t('contextMenu.postpone.days1') },
			{ days: 3, label: i18n.t('contextMenu.postpone.days3') },
			{ days: 7, label: i18n.t('contextMenu.postpone.days7') },
		];
		const setDueDateOptions = [
			{ days: 1, label: i18n.t('contextMenu.setDueDate.tomorrow') },
			{ days: 3, label: i18n.t('contextMenu.setDueDate.days3') },
			{ days: 7, label: i18n.t('contextMenu.setDueDate.days7') },
		];

		return [
			{
				items: [{
					key: 'edit',
					title: i18n.t('contextMenu.editTask'),
					icon: 'pencil',
					onClick: () => {
						openEditTaskModal(app, task, enabledFormats, refresh, true);
					},
				}],
			},
			{
				items: [
					{
						key: 'createNote',
						title: i18n.t('contextMenu.createNote'),
						icon: 'file-plus',
						onClick: () => {
							void createNoteFromTask(app, task, taskNotePath, enabledFormats);
						},
					},
					{
						key: 'createNoteAlias',
						title: i18n.t('contextMenu.createNoteAlias'),
						icon: 'file-plus',
						onClick: () => {
							void createNoteFromTaskAlias(app, task, taskNotePath, enabledFormats);
						},
					},
				],
			},
			{
				items: priorities.map((p) => ({
					key: `priority-${p.value}`,
					title: `${p.icon} ${p.label}`,
					onClick: () => {
						void setTaskPriority(app, task, p.value, enabledFormats, refresh);
					},
				})),
			},
			{
				items: [
					{
						key: 'statusImportant',
						title: i18n.t('contextMenu.statusImportant'),
						onClick: () => {
							void setTaskStatus(app, task, 'important', enabledFormats, refresh);
						},
					},
					{
						key: 'statusQuestion',
						title: i18n.t('contextMenu.statusQuestion'),
						onClick: () => {
							void setTaskStatus(app, task, 'question', enabledFormats, refresh);
						},
					},
				],
			},
			{
				items: [
					...postponeOptions.map((o) => ({
						key: `postpone-${o.days}`,
						title: o.label,
						icon: 'calendar-clock',
						onClick: () => {
							void postponeTask(app, task, o.days, enabledFormats, refresh, false);
						},
					})),
					...setDueDateOptions.map((o) => ({
						key: `due-${o.days}`,
						title: o.label,
						icon: 'calendar-check',
						onClick: () => {
							void postponeTask(app, task, o.days, enabledFormats, refresh, true);
						},
					})),
				],
			},
			{
				items: [
					{
						key: 'cancelRestore',
						title: isCancelled ? i18n.t('contextMenu.restoreTask') : i18n.t('contextMenu.cancelTask'),
						icon: isCancelled ? 'rotate-ccw' : 'x',
						onClick: () => {
							if (isCancelled) {
								void restoreTask(app, task, enabledFormats, refresh);
							} else {
								void cancelTask(app, task, enabledFormats, refresh);
							}
						},
					},
					{
						key: 'delete',
						title: i18n.t('contextMenu.deleteTask'),
						icon: 'trash',
						onClick: () => {
							void deleteTask(app, task, refresh);
						},
					},
				],
			},
		];
	}, [task, app, plugin.settings.enabledTaskFormats, plugin.settings.taskNotePath, virtual, onRefresh]);

	// ===== 拖拽（useDragSource 封装） =====
	const dragProps = useDragSource({
		taskId: `${task.filePath}:${task.lineNumber}`,
		enabled: !!config.enableDrag && !virtual,
		onDragStart: () => tooltip.cancel(),
	});

	// ===== 交互事件 =====
	const handleClick = () => {
		if (virtual) {
			void (async () => {
				const meta = getVirtualMetadata(task);
				if (meta?.sourceTaskId) {
					const [filePath, lineStr] = meta.sourceTaskId.split(':');
					await openFileInExistingLeaf(app, filePath, parseInt(lineStr));
				}
				onClick?.(task);
			})();
			return;
		}
		if (config.clickable) {
			void (async () => {
				await openFileInExistingLeaf(app, task.filePath, task.lineNumber);
				onClick?.(task);
			})();
		}
	};

	const handleCheckboxChange = (checked: boolean) => {
		void (async () => {
			try {
				if (checked && task.repeat && !virtual) {
					const dateField = plugin.settings.dateFilterField || 'dueDate';
					await completeRecurringTask(app, task, plugin.settings.enabledTaskFormats, dateField);
				} else if (!virtual) {
					await updateTaskCompletion(app, task, checked, plugin.settings.enabledTaskFormats);
				}
				// 写回完成后立即刷新 Repository 缓存并推送最新数据到视图，
				// 跳过文件修改事件的 50+75ms 防抖回流（与拖拽修复同模式）
				await plugin.taskCache.refreshFile(task.filePath);
				const { useCalendarStore } = await import('../store/calendarStore');
				useCalendarStore.getState().notifyTasksUpdated(
					plugin.taskCache.getAllTasks(), task.filePath
				);
				onRefresh?.();
			} catch (error) {
				Logger.error('TaskCard', 'Error updating task:', error);
			}
		})();
	};

	// ===== 子元素 =====
	const metadataBlock = task.metadataFields && task.metadataFields.length > 0 ? (
		<div className={TaskCardClasses.elements.metadata}>
			{task.metadataFields.map((f, idx) => (
				<div key={idx} className={TaskCardClasses.elements.metadataItem}>
					<span className={TaskCardClasses.elements.metadataKey}>{f.key}:</span>
					<span className={TaskCardClasses.elements.metadataValue}>{f.value || i18n.t('common.empty')}</span>
				</div>
			))}
		</div>
	) : null;

	const timeBadges = (() => {
		if (!config.showTimes || !config.timeFields) return null;
		const tc = config.timeFields;
		if (!tc.showCreated && !tc.showStart && !tc.showScheduled && !tc.showDue && !tc.showCancelled && !tc.showCompletion) {
			return null;
		}
		const dp = task.datePrecision || {};
		const isOverdue = !!tc.showOverdueIndicator && !!task.dueDate && task.dueDate < new Date() && !task.completed;
		const badges: Array<{ key: keyof typeof dp; label: string; date?: Date; cls: string; overdue?: boolean; show: boolean }> = [
			{ key: 'createdDate', label: i18n.t('taskCard.created'), date: task.createdDate, cls: TimeBadgeClasses.created, show: !!tc.showCreated },
			{ key: 'startDate', label: i18n.t('taskCard.start'), date: task.startDate, cls: TimeBadgeClasses.start, show: !!tc.showStart },
			{ key: 'scheduledDate', label: i18n.t('taskCard.scheduled'), date: task.scheduledDate, cls: TimeBadgeClasses.scheduled, show: !!tc.showScheduled },
			{ key: 'dueDate', label: i18n.t('taskCard.due'), date: task.dueDate, cls: TimeBadgeClasses.due, overdue: isOverdue, show: !!tc.showDue },
			{ key: 'cancelledDate', label: i18n.t('taskCard.cancelled'), date: task.cancelledDate, cls: TimeBadgeClasses.cancelled, show: !!tc.showCancelled },
			{ key: 'completionDate', label: i18n.t('taskCard.done'), date: task.completionDate, cls: TimeBadgeClasses.completion, show: !!tc.showCompletion },
		];
		return (
			<div className={TaskCardClasses.elements.times}>
				{badges.map((b) => {
					if (!b.show || !b.date) return null;
					return (
						<span key={b.key} className={`${TaskCardClasses.elements.timeBadge} ${b.cls}${b.overdue ? ` ${TimeBadgeClasses.overdue}` : ''}`}>
							{b.label}:{formatDateForDisplay(b.date, dp[b.key])}
						</span>
					);
				})}
			</div>
		);
	})();

	const tags = config.showTags && task.tags && task.tags.length > 0 ? (
		<div className={TaskCardClasses.elements.tags}>
			{task.tags.map((t) => (
				<TagPillSpan key={t} label={t} showHash />
			))}
		</div>
	) : null;

	const priority = config.showPriority && task.priority && PRIORITY_ICONS[task.priority] ? (
		<div className={TaskCardClasses.elements.priority}>
			<span className={`${TaskCardClasses.elements.priorityBadge} ${PRIORITY_CLASSES[task.priority]}`}>
				{PRIORITY_ICONS[task.priority]}
			</span>
		</div>
	) : null;

	const fileLocation = config.showFileLocation ? (
		<span className={TaskCardClasses.elements.file}>{`${task.fileName}:${task.lineNumber}`}</span>
	) : null;

	const warning = config.showWarning && task.warning ? (
		<span className={TaskCardClasses.elements.warning} title={task.warning}>
			⚠️
		</span>
	) : null;

	// ===== 组装 =====
	const cardContent = (
		<div
			className={classes.join(' ')}
			style={style}
			draggable={dragProps.draggable}
			data-task-id={dragProps['data-task-id']}
			data-target-date={config.enableDrag && targetDate ? toISOStringLocal(targetDate) : undefined}
			onClick={(e) => {
				// 点击复选框不触发打开任务文件
				if ((e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type === 'checkbox') {
					return;
				}
				handleClick();
			}}
			onDragStart={dragProps.onDragStart}
			onDragEnd={dragProps.onDragEnd}
			onMouseEnter={(e) => {
				if (config.enableTooltip && !isTouchNow()) tooltip.show(task, e.currentTarget);
			}}
			onMouseLeave={() => tooltip.hide()}
			onContextMenu={() => tooltip.cancel()}
		>
			{config.showCheckbox ? (
				<input
					type="checkbox"
					className={TaskCardClasses.elements.checkbox}
					checked={task.completed}
					onChange={(e) => {
						e.stopPropagation();
						if (virtual) {
							void (async () => {
								const meta = getVirtualMetadata(task);
								if (meta?.sourceTaskId) {
									const [filePath, lineStr] = meta.sourceTaskId.split(':');
									await openFileInExistingLeaf(app, filePath, parseInt(lineStr));
								}
							})();
							return;
						}
						handleCheckboxChange(e.target.checked);
					}}
					onClick={(e) => e.stopPropagation()}
				/>
			) : null}
			{description}
			{config.showTicktick ? (
				<>
					{task.ticktick ? <div className={TaskCardClasses.elements.ticktick}>{task.ticktick}</div> : null}
					{metadataBlock}
				</>
			) : null}
			{task.repeat ? <span className={TaskCardClasses.elements.repeatIndicator}>🔁</span> : null}
			{tags}
			{priority}
			{timeBadges}
			{fileLocation}
			{warning}
		</div>
	);

	// 虚拟任务无右键菜单，直接渲染
	if (virtual) return cardContent;

	return (
		<ContextMenuTrigger sections={menuSections}>
			{cardContent}
		</ContextMenuTrigger>
	);
});

