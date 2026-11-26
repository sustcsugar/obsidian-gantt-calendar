/**
 * 任务更新处理器
 * 处理甘特图中的任务更新事件，同步回 Markdown 文件
 */

import { App, Notice } from 'obsidian';
import type { GCTask, IPluginContext } from '../../types';
import { getTaskDateField } from '../../types';
import type { GanttChartTask, DateFieldType } from '../types';
import { formatDate } from '../../dateUtils/dateUtilsIndex';
import { parseLocalDate } from '../wrappers/dateGeometry';
import { Logger } from '../../utils/logger';
import { i18n } from '../../i18n/i18n';
import { openFileInExistingLeaf } from '../../utils/fileOpener';
import { taskUndo } from '../../tasks/taskUndo';

/**
 * 任务更新回调函数类型
 */
export type TaskUpdateCallback = (filePath: string) => void;

/**
 * 任务更新处理器
 *
 * 负责处理从 甘特图 触发的任务更新事件
 * 将更新同步回原始 Markdown 文件
 */
export class TaskUpdateHandler {
	constructor(
		private app: App,
		private plugin: IPluginContext
	) {}

	/**
	 * 任务更新完成后的回调（用于增量更新视图）
	 */
	onTaskUpdated?: TaskUpdateCallback;

	/**
	 * 处理日期变更（拖拽任务条）
	 *
	 * @param ganttTask - 甘特图 任务对象
	 * @param newStart - 新的开始日期
	 * @param newEnd - 新的结束日期
	 * @param startField - 开始时间字段名
	 * @param endField - 结束时间字段名
	 * @param _allTasks - 所有任务列表（保留参数以保持兼容性，但不再使用）
	 */
	async handleDateChange(
		ganttTask: GanttChartTask,
		newStart: Date,
		newEnd: Date,
		startField: DateFieldType,
		endField: DateFieldType,
		allTasks: GCTask[]
	): Promise<void> {
		// 第二道防线：静默拦截汇总条及非实体任务行，绝不触发任何文件写入
		if (ganttTask.isRollupBar || ganttTask.treeNodeType === 'folder' || ganttTask.treeNodeType === 'file') {
			return;
		}

		try {
			// 直接从 GanttChartTask 获取任务信息
			if (!ganttTask.filePath || ganttTask.lineNumber === undefined) {
				Logger.error('TaskUpdateHandler', 'Missing task information:', ganttTask);
				new Notice(i18n.t('gantt.taskInfoIncomplete'));
				return;
			}

			// Resolve which source field actually provided the draggable start
			// (startDate, or createdDate fallback for tasks without a start date)
			const startSource: DateFieldType = ganttTask.startSourceField ?? startField;

			// 当条形起点来自回退字段（如任务无开始日期、以创建时间充当起点）时，
			// 拖拽的语义是"为任务补一个真正的开始日期"：写入配置的开始字段，
			// 而不是修改创建时间。创建时间保持原值，创建→开始自然形成引导段。
			const writeStartTo: DateFieldType = startSource !== startField ? startField : startSource;

			// Dragging is day-granular: re-apply the original time-of-day so a
			// timed task (yyyy-MM-dd HH:mm) does not lose its time on write-back.
			const originalStartDate = getTaskDateField(ganttTask as unknown as GCTask, writeStartTo);
			const originalEndDate = getTaskDateField(ganttTask as unknown as GCTask, endField);
			const updates: Record<string, Date> = {
				[writeStartTo]: this.preserveTimeOfDay(newStart, originalStartDate, ganttTask.datePrecision?.[writeStartTo]),
				[endField]: this.preserveTimeOfDay(newEnd, originalEndDate, ganttTask.datePrecision?.[endField]),
			};

			const {
				updateTaskProperties,
				collectDescendantTasks,
				shiftTaskDatesAtomically,
				refreshTaskView,
			} = await import('../../tasks/taskUpdater');

			// T8：仅在树形模式下，开启「拖拽父任务时联动平移子任务」且本次为整体平移（非单边拉伸）时，原子批量顺延后代
			if (
				ganttTask.treeNodeType === 'task' &&
				this.plugin.settings.ganttCascadeParentDrag &&
				ganttTask.start &&
				ganttTask.end
			) {
				const prevStart = parseLocalDate(ganttTask.start);
				const prevEnd = parseLocalDate(ganttTask.end);
				const newStartMidnight = new Date(newStart.getFullYear(), newStart.getMonth(), newStart.getDate());
				const newEndMidnight = new Date(newEnd.getFullYear(), newEnd.getMonth(), newEnd.getDate());
				const deltaStartDays = Math.round((newStartMidnight.getTime() - prevStart.getTime()) / 86400000);
				const deltaEndDays = Math.round((newEndMidnight.getTime() - prevEnd.getTime()) / 86400000);

				if (deltaStartDays !== 0 && deltaStartDays === deltaEndDays) {
					const parentSource = allTasks.find(
						(t) => t.filePath === ganttTask.filePath && t.lineNumber === ganttTask.lineNumber
					) ?? (ganttTask as unknown as GCTask);

					const descendants = collectDescendantTasks(parentSource, allTasks);
					const childItems: Array<{ task: GCTask; updates: Record<string, Date> }> = [];
					const fieldsToShift = Array.from(new Set<DateFieldType>([startField, endField]));

					for (const child of descendants) {
						if (child.isVirtualContainer) continue;
						const childUpdates: Record<string, Date> = {};
						for (const field of fieldsToShift) {
							const currentVal = getTaskDateField(child, field);
							if (currentVal && !isNaN(currentVal.getTime())) {
								const shifted = new Date(currentVal);
								shifted.setDate(shifted.getDate() + deltaStartDays);
								childUpdates[field] = shifted;
							}
						}
						if (Object.keys(childUpdates).length > 0) {
							childItems.push({ task: child, updates: childUpdates });
						}
					}

					if (childItems.length > 0) {
						const batchResult = await shiftTaskDatesAtomically(
							this.app,
							ganttTask.filePath,
							[{ task: parentSource, updates }, ...childItems],
							this.plugin.settings.enabledTaskFormats
						);
						await refreshTaskView(this.app, ganttTask.filePath);
						const deltaLabel = deltaStartDays > 0 ? `+${deltaStartDays}` : String(deltaStartDays);
						const msg = i18n.t('views.ganttView.cascadeUpdated', {
							count: childItems.length,
							delta: deltaLabel,
						});
						taskUndo.registerBatchLines(
							{
								app: this.app,
								filePath: ganttTask.filePath,
								previousLines: batchResult.previousLines,
								onRefresh: () => {
									this.onTaskUpdated?.(ganttTask.filePath!);
								},
							},
							msg
						);
						return;
					}
				}
			}

			// 常规单行更新：直接使用 ganttTask（已包含完整任务信息）
			await updateTaskProperties(
				this.app,
				ganttTask as unknown as GCTask,
				updates,
				this.plugin.settings.enabledTaskFormats
			);

			// 显示通知
			new Notice(i18n.t('gantt.timeUpdated', { start: formatDate(newStart, 'yyyy-MM-dd'), end: formatDate(newEnd, 'yyyy-MM-dd') }));

		} catch (error) {
			Logger.error('TaskUpdateHandler', 'Error updating task:', error);
			new Notice(i18n.t('gantt.updateFailed', { error: (error as Error).message }));
		}
	}

	/**
	 * 处理进度变更
	 *
	 * @param ganttTask - 甘特图 任务对象
	 * @param progress - 新的进度值 (0-100)
	 * @param _allTasks - 所有任务列表（保留参数以保持兼容性，但不再使用）
	 */
	async handleProgressChange(
		ganttTask: GanttChartTask,
		progress: number,
		_allTasks: GCTask[]
	): Promise<void> {
		if (ganttTask.treeNodeType === 'folder' || ganttTask.treeNodeType === 'file') {
			return;
		}

		try {
			// 直接从 GanttChartTask 获取任务信息
			if (!ganttTask.filePath || ganttTask.lineNumber === undefined) {
				Logger.error('TaskUpdateHandler', 'Missing task information:', ganttTask);
				new Notice(i18n.t('gantt.taskInfoIncomplete'));
				return;
			}

			const completed = progress >= 100;

			// 使用 updateTaskCompletion，它会自动更新 completionDate 和 status
			const { updateTaskCompletion } = await import('../../tasks/taskUpdater');
			// 直接使用 ganttTask（已包含完整任务信息）
			await updateTaskCompletion(
				this.app,
				ganttTask as unknown as GCTask,
				completed,
				this.plugin.settings.enabledTaskFormats
			);

			new Notice(completed ? i18n.t('gantt.markedComplete') : i18n.t('gantt.markedIncomplete'));

		} catch (error) {
			Logger.error('TaskUpdateHandler', 'Error updating progress:', error);
			new Notice(i18n.t('gantt.updateProgressFailed', { error: (error as Error).message }));
		}
	}

	/**
	 * 处理任务点击事件
	 *
	 * @param ganttTask - 被点击的任务
	 * @param _allTasks - 所有任务列表（保留参数以保持兼容性，但不再使用）
	 */
	handleTaskClick(ganttTask: GanttChartTask, _allTasks: GCTask[]): void {
		// 直接从 GanttChartTask 获取任务信息
		if (!ganttTask.filePath || !ganttTask.fileName) {
			Logger.error('TaskUpdateHandler', 'Missing task information', ganttTask);
			return;
		}

		// 使用 openFileInExistingLeaf 避免重复打开标签页
		void openFileInExistingLeaf(this.app, ganttTask.filePath, ganttTask.lineNumber);
	}

	/**
	 * Re-apply the original time-of-day onto a day-granular drag result.
	 * Keeps HH:mm for timed tasks; date-only tasks stay at midnight.
	 */
	private preserveTimeOfDay(newDate: Date, original: Date | undefined, precision?: 'day' | 'time'): Date {
		if (!original) return newDate;
		const isTimed = precision === 'time' ||
			original.getHours() !== 0 || original.getMinutes() !== 0;
		if (!isTimed) return newDate;

		const result = new Date(newDate);
		result.setHours(original.getHours(), original.getMinutes(), 0, 0);
		return result;
	}
	/**
	 * 验证日期变更是否有效
	 *
	 * @param newStart - 新的开始日期
	 * @param newEnd - 新的结束日期
	 * @returns 是否有效
	 */
	static validateDateChange(newStart: Date, newEnd: Date): boolean {
		return (
			newStart instanceof Date &&
			!isNaN(newStart.getTime()) &&
			newEnd instanceof Date &&
			!isNaN(newEnd.getTime()) &&
			newEnd >= newStart
		);
	}

	/**
	 * 格式化日期范围显示
	 *
	 * @param start - 开始日期
	 * @param end - 结束日期
	 * @returns 格式化的字符串
	 */
	static formatDateRange(start: Date, end: Date): string {
		const formatter = (date: Date) => formatDate(date, 'yyyy-MM-dd');
		return `${formatter(start)} → ${formatter(end)}`;
	}
}
