/**
 * 任务数据适配器
 * 将插件的 GCTask 格式转换为 甘特图格式
 */

import type { GCTask } from '../../types';
import { getTaskDateField } from '../../types';
import { buildIntervalTimeLabel } from '../../ui/views/week/timelineModel';
import type { GanttChartTask, DateFieldType } from '../types';
import type { StatusFilterState } from '../../types';
import { orderTasksWithHierarchy } from './hierarchyOrder';
import { getTaskKey, getHierarchyNode, type TaskHierarchyIndex } from '../../tasks/hierarchy/taskHierarchy';
import { computeNodeAggregateDates, computeNodeStats } from '../../tasks/hierarchy/aggregate';

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
	 * @returns 甘特图任务对象，如果缺少必要字段则返回 null
	 */
	static toGanttChartTask(
		task: GCTask,
		startField: DateFieldType,
		endField: DateFieldType,
		id?: string,
		/** 层级聚合时覆盖日期（父任务自身没有日期、但子任务能推出范围） */
		overrides?: { start?: Date; end?: Date }
	): GanttChartTask | null {
		const endDate = overrides?.end ?? getTaskDateField(task, endField);

		// End field is always required.
		if (!endDate || isNaN(endDate.getTime())) {
			return null;
		}

		// Start resolution: the configured field first, then the two supported
		// fallbacks. createdDate and startDate are both valid Gantt start points,
		// so a task is renderable when ANY candidate exists plus the end field.
		let startDate: Date | undefined = overrides?.start;
		let startSourceField: DateFieldType = startField;
		if (!startDate) {
			const resolved = this.resolveStartCandidate(task, startField);
			if (resolved) {
				startDate = resolved.date;
				startSourceField = resolved.field;
			}
		}
		if (!startDate) {
			return null;
		}

		// 确保结束日期不早于开始日期
		const normalizedEndDate = endDate < startDate ? startDate : endDate;

		// Lead-in segment: creation → effective start, drawn in a distinct
		// muted color when both dates exist and creation precedes the start.
		const createdDate = task.createdDate;
		const leadStart = (createdDate && !isNaN(createdDate.getTime()) && createdDate < startDate)
			? this.formatDate(createdDate)
			: undefined;

		return {
			id: id ?? this.generateTaskId(task),
			name: task.description || '无标题任务',
			timeLabel: buildIntervalTimeLabel(
				startDate, normalizedEndDate,
				task.datePrecision?.[startField] === 'time',
				task.datePrecision?.[endField] === 'time'
			),
			start: this.formatDate(startDate),
			end: this.formatDate(normalizedEndDate),
			leadStart,
			startSourceField,
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
			repeat: task.repeat,
			datePrecision: task.datePrecision,
			metadataFields: task.metadataFields,
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
		// Uniqueness must be decided over tasks that pass field validation, so convert first,
		// then append an occurrence suffix only when a duplicate id appears (e.g. recurring
		// virtual instances). Regular tasks keep a fully stable id across inserts/sorts.
		const results: GanttChartTask[] = [];
		const seenIds = new Map<string, number>();
		for (const task of tasks) {
			const converted = this.toGanttChartTask(task, startField, endField);
			if (!converted) continue;

			const occurrence = (seenIds.get(converted.id) ?? 0) + 1;
			seenIds.set(converted.id, occurrence);
			if (occurrence > 1) {
				converted.id = `${converted.id}#${occurrence}`;
			}
			results.push(converted);
		}
		return results;
	}

	/**
	 * 解析任务的有效开始日期（配置字段优先，再走两个受支持的回退字段）。
	 *
	 * 返回实际命中的字段，供 timeLabel 判断时刻精度；全部缺失时返回 null。
	 */
	private static resolveStartCandidate(
		task: GCTask,
		startField: DateFieldType
	): { date: Date; field: DateFieldType } | null {
		const candidates: DateFieldType[] = startField === 'createdDate'
			? [startField, 'startDate']
			: startField === 'startDate'
				? [startField, 'createdDate']
				: [startField, 'createdDate', 'startDate'];

		for (const candidate of candidates) {
			const value = getTaskDateField(task, candidate);
			if (value && !isNaN(value.getTime())) {
				return { date: value, field: candidate };
			}
		}
		return null;
	}

	/**
	 * 层级批量转换：父子整块排序 + 聚合日期/进度注入。
	 *
	 * 与 toGanttChartTasks 的区别：
	 * - 行序按「父 + 子树」整块重排（orderTasksWithHierarchy）
	 * - 父行的日期/进度由子任务聚合，显式日期优先
	 * - 父行即使自身没有日期，只要子任务能推出范围也能渲染
	 * - 行上带 level / isAggregate / childProgress / collapsed
	 */
	static toGanttChartTasksHierarchical(
		tasks: GCTask[],
		startField: DateFieldType,
		endField: DateFieldType,
		index: TaskHierarchyIndex,
		opts: { collapsedTids?: ReadonlySet<string> } = {}
	): GanttChartTask[] {
		const rows = orderTasksWithHierarchy(tasks, index, opts);
		const seenIds = new Map<string, number>();
		const idByKey = new Map<string, string>();
		const converted: Array<{ gantt: GanttChartTask; parentKey: string | null }> = [];

		// 叶子任务的日期解析（含甘特起点的回退链）；父任务自身的显式日期则严格取配置字段
		const leafField = (task: GCTask, field: DateFieldType): Date | undefined => {
			if (field === startField) return this.resolveStartCandidate(task, startField)?.date;
			return getTaskDateField(task, field);
		};
		const explicitField = (task: GCTask, field: DateFieldType): Date | undefined =>
			getTaskDateField(task, field);

		for (const row of rows) {
			const node = getHierarchyNode(index, row.task);
			const isAggregate = Boolean(node?.hasChildren);
			let overrides: { start?: Date; end?: Date } | undefined;
			let stats: ReturnType<typeof computeNodeStats> | undefined;

			if (node && isAggregate) {
				const dates = computeNodeAggregateDates(node, leafField, startField, endField, explicitField);
				overrides = { start: dates.start, end: dates.end };
				stats = computeNodeStats(node);
			}

			const gantt = this.toGanttChartTask(row.task, startField, endField, undefined, overrides);
			if (!gantt) continue;

			// 重复 id（重复任务的虚拟实例）加后缀，与 toGanttChartTasks 保持一致
			const occurrence = (seenIds.get(gantt.id) ?? 0) + 1;
			seenIds.set(gantt.id, occurrence);
			if (occurrence > 1) {
				gantt.id = `${gantt.id}#${occurrence}`;
			}

			gantt.level = row.level;
			gantt.hasChildren = row.hasChildren;
			gantt.collapsed = row.collapsed;
			gantt.tid = row.task.tid ?? node?.tid ?? undefined;

			if (isAggregate) {
				gantt.isAggregate = true;
				gantt.progress = stats?.progress ?? gantt.progress;
				gantt.childProgress = {
					done: stats?.leafDone ?? 0,
					total: stats?.leafTotal ?? 0,
				};
			}

			idByKey.set(getTaskKey(row.task), gantt.id);
			converted.push({ gantt, parentKey: row.parentKey });
		}

		// 第二遍：父行真的渲染时才给子行填 parentId（同帧内视觉连引用）
		for (const entry of converted) {
			if (!entry.parentKey) continue;
			const parentId = idByKey.get(entry.parentKey);
			if (parentId) entry.gantt.parentId = parentId;
		}

		return converted.map((entry) => entry.gantt);
	}

	/**
	 * 生成唯一任务ID
	 *
	 * 格式: `{fileName}-{lineNumber}-{pathHash}`
	 *
	 * @param task - 原始任务对象
	 * @returns 唯一任务ID
	 */
	private static generateTaskId(task: GCTask): string {
		// 移除文件扩展名并替换特殊字符
		const sanitizedName = task.fileName.replace(/\.md$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
		// Same-named files in different folders are disambiguated by a short path hash
		const pathHash = this.hashString(task.filePath);
		return `${sanitizedName}-${task.lineNumber}-${pathHash}`;
	}

	/**
	 * Deterministic string hash (djb2 variant, base36 output).
	 * Only used to build a short stable path fingerprint; not cryptographic.
	 */
	private static hashString(input: string): string {
		let hash = 5381;
		for (let i = 0; i < input.length; i++) {
			hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
		}
		return (hash >>> 0).toString(36);
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
	 * 根据时间颗粒度调整日期（仅支持周视图）
	 *
	 * @param date - 原始日期
	 * @returns 调整后的日期
	 */
	static adjustDateByGranularity(date: Date): Date {
		const adjusted = new Date(date);
		// 按天对齐
		adjusted.setHours(0, 0, 0, 0);
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