/**
 * 任务数据适配器
 * 将插件的 GCTask 格式转换为 甘特图格式
 */

import type { GCTask } from '../../types';
import type { GanttChartTask, DateFieldType } from '../types';
import type { StatusFilterState } from '../../types';
import { formatDate } from '../../dateUtils/dateUtilsIndex';

/**
 * 任务数据适配器
 */
export class TaskDataAdapter {
	/**
	 * 转换单个任务为 甘特图格式
	 *
	 * @param task - 原始任务对象
	 * @param startField - 开始时间字段
	 * @param endField - 结束时间字段
	 * @param index - 任务索引（用于生成唯一ID）
	 * @returns 甘特图任务对象，如果缺少必要字段则返回 null
	 */
	static toGanttChartTask(
		task: GCTask,
		startField: DateFieldType,
		endField: DateFieldType,
		index: number
	): GanttChartTask | null {
		const startDate = (task as any)[startField] as Date | undefined;
		const endDate = (task as any)[endField] as Date | undefined;

		// 验证必要字段
		if (!startDate || !endDate) {
			return null;
		}

		// 验证日期有效性
		if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
			return null;
		}

		// 确保结束日期不早于开始日期
		const normalizedEndDate = endDate < startDate ? startDate : endDate;

		return {
			id: this.generateTaskId(task, index),
			name: task.description || '无标题任务',
			start: this.formatDate(startDate),
			end: this.formatDate(normalizedEndDate),
			progress: this.calculateProgress(task),
			custom_class: this.getCustomClass(task),

			// 保存原始任务信息，避免后续查找
			completed: task.completed,
			cancelled: task.cancelled,
			filePath: task.filePath,
			fileName: task.fileName,
			lineNumber: task.lineNumber,

			// 完整任务信息（用于更新时保留原始数据）
			content: task.content,
			description: task.description,
			tags: task.tags,
			priority: task.priority,
			format: task.format,
			status: task.status,
			createdDate: task.createdDate,
			startDate: task.startDate,
			scheduledDate: task.scheduledDate,
			dueDate: task.dueDate,
			cancelledDate: task.cancelledDate,
			completionDate: task.completionDate,
		};
	}

	/**
	 * 批量转换任务列表
	 *
	 * @param tasks - 原始任务列表
	 * @param startField - 开始时间字段
	 * @param endField - 结束时间字段
	 * @returns 甘特图任务数组
	 */
	static toGanttChartTasks(
		tasks: GCTask[],
		startField: DateFieldType,
		endField: DateFieldType
	): GanttChartTask[] {
		return tasks
			.map((task, index) => this.toGanttChartTask(task, startField, endField, index))
			.filter((t): t is GanttChartTask => t !== null);
	}

	/**
	 * 生成唯一任务ID
	 *
	 * 格式: `{fileName}-{lineNumber}-{index}`
	 *
	 * @param task - 原始任务对象
	 * @param index - 任务索引
	 * @returns 唯一任务ID
	 */
	private static generateTaskId(task: GCTask, index: number): string {
		// 移除文件扩展名并替换特殊字符
		const sanitizedName = task.fileName.replace(/\.md$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
		return `${sanitizedName}-${task.lineNumber}-${index}`;
	}

	/**
	 * 格式化日期为 YYYY-MM-DD
	 *
	 * @param date - 日期对象
	 * @returns 格式化的日期字符串
	 */
	private static formatDate(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	/**
	 * 计算任务进度百分比
	 *
	 * @param task - 任务对象
	 * @returns 进度百分比 (0-100)
	 */
	private static calculateProgress(task: GCTask): number {
		if (task.completed) return 100;
		if (task.cancelled) return 0;

		// 可根据更多条件计算进度
		return 0;
	}

	/**
	 * 根据任务状态生成自定义CSS类名
	 *
	 * @param task - 任务对象
	 * @returns CSS类名
	 */
	private static getCustomClass(task: GCTask): string {
		const classes: string[] = [];

		// 完成状态
		if (task.completed) {
			classes.push('task-completed');
		}

		// 取消状态
		if (task.cancelled) {
			classes.push('task-cancelled');
		}

		// 优先级
		if (task.priority) {
			classes.push(`priority-${task.priority}`);
		}

		// 自定义状态
		if (task.status) {
			classes.push(`status-${this.sanitizeClassName(task.status)}`);
		}

		return classes.join(' ');
	}

	/**
	 * 清理类名中的特殊字符
	 *
	 * @param name - 原始名称
	 * @returns 清理后的类名
	 */
	private static sanitizeClassName(name: string): string {
		return name.toLowerCase().replace(/[^a-z0-9]/g, '-');
	}

	/**
	 * 应用筛选条件到任务列表
	 *
	 * @param tasks - 原始任务列表
	 * @param statusFilter - 状态筛选条件
	 * @param selectedTags - 选中的标签列表
	 * @param tagOperator - 标签组合方式 (AND/OR/NOT)
	 * @returns 筛选后的任务列表
	 */
	static applyFilters(
		tasks: GCTask[],
		statusFilter: StatusFilterState,
		selectedTags: string[] = [],
		tagOperator: 'AND' | 'OR' | 'NOT' = 'OR'
	): GCTask[] {
		let filtered = tasks;

		// 状态筛选（支持多选）
		if (statusFilter.selectedStatuses.length > 0) {
			filtered = filtered.filter(task => {
				const taskStatus = task.status || TaskDataAdapter.getInferredStatus(task);
				return statusFilter.selectedStatuses.includes(taskStatus);
			});
		}

		// 标签筛选（大小写不敏感匹配）
		if (selectedTags.length > 0) {
			// 将选中的标签转换为小写，用于大小写不敏感匹配
			const selectedTagsLower = selectedTags.map(tag => tag.toLowerCase());

			filtered = filtered.filter(task => {
				// 对于没有标签的任务
				if (!task.tags || task.tags.length === 0) {
					if (tagOperator === 'NOT') {
						return true;  // NOT 模式：保留没有标签的任务
					} else {
						return false;  // AND/OR 模式：过滤掉没有标签的任务
					}
				}

				// 将任务标签转换为小写用于匹配
				const taskTagsLower = task.tags.map(tag => tag.toLowerCase());

				if (tagOperator === 'AND') {
					return selectedTagsLower.every(tag => taskTagsLower.includes(tag));
				} else if (tagOperator === 'OR') {
					return selectedTagsLower.some(tag => taskTagsLower.includes(tag));
				} else {
					// NOT: 排除包含任一选中标签的任务
					return !selectedTagsLower.some(tag => taskTagsLower.includes(tag));
				}
			});
		}

		return filtered;
	}

	/**
	 * 根据时间颗粒度调整日期
	 *
	 * @param date - 原始日期
	 * @param granularity - 时间颗粒度
	 * @returns 调整后的日期
	 */
	static adjustDateByGranularity(
		date: Date,
		granularity: 'day' | 'week' | 'month'
	): Date {
		const adjusted = new Date(date);

		switch (granularity) {
			case 'day':
				// 按天对齐
				adjusted.setHours(0, 0, 0, 0);
				break;
			case 'week':
				// 按周对齐（周一）
				const dayOfWeek = adjusted.getDay();
				const diff = adjusted.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
				adjusted.setDate(diff);
				adjusted.setHours(0, 0, 0, 0);
				break;
			case 'month':
				// 按月对齐（月初）
				adjusted.setDate(1);
				adjusted.setHours(0, 0, 0, 0);
				break;
		}

		return adjusted;
	}

	/**
	 * 推断任务状态（当任务没有明确的 status 字段时）
	 */
	private static getInferredStatus(task: GCTask): string {
		if (task.completed) return 'done';
		if (task.cancelled) return 'canceled';
		return 'todo';
	}
}