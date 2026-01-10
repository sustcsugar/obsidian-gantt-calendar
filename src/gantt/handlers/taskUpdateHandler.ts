/**
 * 任务更新处理器
 * 处理甘特图中的任务更新事件，同步回 Markdown 文件
 */

import { App, Notice } from 'obsidian';
import type { GCTask } from '../../types';
import type { GanttChartTask, DateFieldType } from '../types';
import { formatDate } from '../../dateUtils/dateUtilsIndex';
import { Logger } from '../../utils/logger';

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
		private plugin: any
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
		_allTasks: GCTask[]
	): Promise<void> {
		try {
			// 直接从 GanttChartTask 获取任务信息
			if (!ganttTask.filePath || ganttTask.lineNumber === undefined) {
				Logger.error('TaskUpdateHandler', 'Missing task information:', ganttTask);
				new Notice('任务信息不完整');
				return;
			}

			// 使用 updateTaskProperties
			const { updateTaskProperties } = await import('../../tasks/taskUpdater');
			const updates: Record<string, Date> = {
				[startField]: newStart,
				[endField]: newEnd,
			};

			// 直接使用 ganttTask（已包含完整任务信息）
			await updateTaskProperties(
				this.app,
				ganttTask as any, // 类型断言：GanttChartTask 实际包含完整任务信息
				updates,
				this.plugin.settings.enabledTaskFormats
			);

			// 静默更新缓存（不触发全局刷新）
			await this.plugin.taskCache.updateFileCache(ganttTask.filePath, true, true);

			// 显示通知
			new Notice(`任务时间已更新: ${formatDate(newStart, 'yyyy-MM-dd')} - ${formatDate(newEnd, 'yyyy-MM-dd')}`);

			// 通知视图进行增量更新
			this.onTaskUpdated?.(ganttTask.filePath);

		} catch (error) {
			Logger.error('TaskUpdateHandler', 'Error updating task:', error);
			new Notice('更新任务失败: ' + (error as Error).message);
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
		try {
			// 直接从 GanttChartTask 获取任务信息
			if (!ganttTask.filePath || ganttTask.lineNumber === undefined) {
				Logger.error('TaskUpdateHandler', 'Missing task information:', ganttTask);
				new Notice('任务信息不完整');
				return;
			}

			const completed = progress >= 100;

			// 使用 updateTaskCompletion，它会自动更新 completionDate 和 status
			const { updateTaskCompletion } = await import('../../tasks/taskUpdater');
			// 直接使用 ganttTask（已包含完整任务信息）
			await updateTaskCompletion(
				this.app,
				ganttTask as any, // 类型断言：GanttChartTask 实际包含完整任务信息
				completed,
				this.plugin.settings.enabledTaskFormats
			);

			// 静默更新缓存（不触发全局刷新）
			await this.plugin.taskCache.updateFileCache(ganttTask.filePath, true, true);

			new Notice(completed ? '任务已标记为完成' : '任务已标记为未完成');

			// 通知视图进行增量更新
			this.onTaskUpdated?.(ganttTask.filePath);

		} catch (error) {
			Logger.error('TaskUpdateHandler', 'Error updating progress:', error);
			new Notice('更新进度失败: ' + (error as Error).message);
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
			console.error('[TaskUpdateHandler] Missing task information:', ganttTask);
			return;
		}

		// 使用 openFileInExistingLeaf 避免重复打开标签页
		const { openFileInExistingLeaf } = require('../../utils/fileOpener');
		openFileInExistingLeaf(this.app, ganttTask.filePath, ganttTask.lineNumber);
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
