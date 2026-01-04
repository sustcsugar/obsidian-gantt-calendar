/**
 * 任务更新处理器
 * 处理甘特图中的任务更新事件，同步回 Markdown 文件
 */

import { App, Notice, TFile } from 'obsidian';
import type { GanttTask } from '../../types';
import type { FrappeTask, DateFieldType } from '../types';
import { formatDate } from '../../dateUtils/dateUtilsIndex';

/**
 * 任务更新处理器
 *
 * 负责处理从 Frappe Gantt 触发的任务更新事件
 * 将更新同步回原始 Markdown 文件
 */
export class TaskUpdateHandler {
	constructor(
		private app: App,
		private plugin: any
	) {}

	/**
	 * 处理日期变更（拖拽任务条）
	 *
	 * @param frappeTask - Frappe Gantt 任务对象
	 * @param newStart - 新的开始日期
	 * @param newEnd - 新的结束日期
	 * @param startField - 开始时间字段名
	 * @param endField - 结束时间字段名
	 * @param _allTasks - 所有任务列表（保留参数以保持兼容性，但不再使用）
	 */
	async handleDateChange(
		frappeTask: FrappeTask,
		newStart: Date,
		newEnd: Date,
		startField: DateFieldType,
		endField: DateFieldType,
		_allTasks: GanttTask[]
	): Promise<void> {
		try {
			// 直接从 FrappeTask 获取任务信息
			if (!frappeTask.filePath || frappeTask.lineNumber === undefined) {
				console.error('[TaskUpdateHandler] Missing task information:', frappeTask);
				new Notice('任务信息不完整');
				return;
			}

			// 获取文件对象
			const file = this.app.vault.getAbstractFileByPath(frappeTask.filePath);
			if (!file || !(file instanceof TFile)) {
				new Notice('无法找到文件');
				return;
			}

			// 读取文件内容
			const content = await this.app.vault.read(file);
			const lines = content.split('\n');

			if (frappeTask.lineNumber < 0 || frappeTask.lineNumber >= lines.length) {
				new Notice('任务行号超出范围');
				return;
			}

			// 更新任务行
			const originalLine = lines[frappeTask.lineNumber];
			const updatedLine = this.updateTaskDatesInLine(
				originalLine,
				newStart,
				newEnd,
				startField,
				endField
			);

			lines[frappeTask.lineNumber] = updatedLine;

			// 写回文件
			await this.app.vault.modify(file, lines.join('\n'));

			// 通知缓存更新
			await this.plugin.taskCache.updateFileCache(frappeTask.filePath);

			// 显示通知
			new Notice(`任务时间已更新: ${formatDate(newStart, 'yyyy-MM-dd')} - ${formatDate(newEnd, 'yyyy-MM-dd')}`);

		} catch (error) {
			console.error('[TaskUpdateHandler] Error updating task:', error);
			new Notice('更新任务失败: ' + (error as Error).message);
		}
	}

	/**
	 * 处理进度变更
	 *
	 * @param frappeTask - Frappe Gantt 任务对象
	 * @param progress - 新的进度值 (0-100)
	 * @param _allTasks - 所有任务列表（保留参数以保持兼容性，但不再使用）
	 */
	async handleProgressChange(
		frappeTask: FrappeTask,
		progress: number,
		_allTasks: GanttTask[]
	): Promise<void> {
		try {
			// 直接从 FrappeTask 获取任务信息
			if (!frappeTask.filePath || frappeTask.lineNumber === undefined) {
				console.error('[TaskUpdateHandler] Missing task information:', frappeTask);
				new Notice('任务信息不完整');
				return;
			}

			// 获取文件对象
			const file = this.app.vault.getAbstractFileByPath(frappeTask.filePath);
			if (!file || !(file instanceof TFile)) {
				new Notice('无法找到文件');
				return;
			}

			const content = await this.app.vault.read(file);
			const lines = content.split('\n');

			if (frappeTask.lineNumber < 0 || frappeTask.lineNumber >= lines.length) {
				new Notice('任务行号超出范围');
				return;
			}

			// 更新复选框状态
			const originalLine = lines[frappeTask.lineNumber];
			const updatedLine = this.updateTaskCompletionInLine(originalLine, progress >= 100);

			lines[frappeTask.lineNumber] = updatedLine;
			await this.app.vault.modify(file, lines.join('\n'));

			await this.plugin.taskCache.updateFileCache(frappeTask.filePath);

			new Notice(progress >= 100 ? '任务已标记为完成' : '任务已标记为未完成');

		} catch (error) {
			console.error('[TaskUpdateHandler] Error updating progress:', error);
			new Notice('更新进度失败: ' + (error as Error).message);
		}
	}

	/**
	 * 处理任务点击事件
	 *
	 * @param frappeTask - 被点击的任务
	 * @param _allTasks - 所有任务列表（保留参数以保持兼容性，但不再使用）
	 */
	handleTaskClick(frappeTask: FrappeTask, _allTasks: GanttTask[]): void {
		// 直接从 FrappeTask 获取任务信息
		if (!frappeTask.filePath || !frappeTask.fileName) {
			console.error('[TaskUpdateHandler] Missing task information:', frappeTask);
			return;
		}

		// 打开文件并跳转到对应行
		this.app.workspace.openLinkText(
			frappeTask.fileName,
			'',
			true,
			{ state: { line: frappeTask.lineNumber } }
		);
	}

	/**
	 * 更新任务行中的日期标记
	 *
	 * @param line - 原始任务行
	 * @param newStart - 新的开始日期
	 * @param newEnd - 新的结束日期
	 * @param startField - 开始字段名
	 * @param endField - 结束字段名
	 * @returns 更新后的任务行
	 */
	private updateTaskDatesInLine(
		line: string,
		newStart: Date,
		newEnd: Date,
		startField: DateFieldType,
		endField: DateFieldType
	): string {
		const startEmoji = this.getDateEmoji(startField);
		const endEmoji = this.getDateEmoji(endField);
		const startDateStr = formatDate(newStart, 'yyyy-MM-dd');
		const endDateStr = formatDate(newEnd, 'yyyy-MM-dd');

		let updatedLine = line;

		// 更新开始日期
		if (startEmoji) {
			const startRegex = new RegExp(`${startEmoji}\\s*\\d{4}-\\d{2}-\\d{2}`, 'g');
			if (startRegex.test(updatedLine)) {
				updatedLine = updatedLine.replace(startRegex, `${startEmoji} ${startDateStr}`);
			} else {
				// 如果没有找到，添加到行末
				updatedLine = updatedLine.trimEnd() + ` ${startEmoji} ${startDateStr}`;
			}
		}

		// 更新结束日期
		if (endEmoji) {
			const endRegex = new RegExp(`${endEmoji}\\s*\\d{4}-\\d{2}-\\d{2}`, 'g');
			if (endRegex.test(updatedLine)) {
				updatedLine = updatedLine.replace(endRegex, `${endEmoji} ${endDateStr}`);
			} else {
				// 如果没有找到，添加到行末
				updatedLine = updatedLine.trimEnd() + ` ${endEmoji} ${endDateStr}`;
			}
		}

		return updatedLine;
	}

	/**
	 * 更新任务行的完成状态
	 *
	 * @param line - 原始任务行
	 * @param completed - 是否完成
	 * @returns 更新后的任务行
	 */
	private updateTaskCompletionInLine(line: string, completed: boolean): string {
		// 更新复选框
		const checkboxRegex = /^(\s*[-*+])\s*\[[ x]\]/;
		const match = line.match(checkboxRegex);

		if (match) {
			const prefix = match[1];
			const newCheckbox = completed ? '[x]' : '[ ]';
			return line.replace(checkboxRegex, `${prefix} ${newCheckbox}`);
		}

		return line;
	}

	/**
	 * 获取日期字段对应的 emoji
	 *
	 * @param field - 日期字段名
	 * @returns 对应的 emoji 或 null
	 */
	private getDateEmoji(field: DateFieldType): string | null {
		const emojiMap: Record<DateFieldType, string> = {
			createdDate: '➕',
			startDate: '🛫',
			scheduledDate: '⏳',
			dueDate: '📅',
			completionDate: '✅',
			cancelledDate: '❌'
		};

		return emojiMap[field] || null;
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
