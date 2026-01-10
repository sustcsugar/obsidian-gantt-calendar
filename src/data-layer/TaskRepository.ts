/**
 * TaskRepository - 任务仓库
 *
 * 任务仓库是数据层的核心组件，负责：
 * - 管理数据源
 * - 维护任务缓存
 * - 提供高性能查询接口
 * - 处理数据源变化事件
 *
 * 设计模式：仓库模式（Repository Pattern）
 * 直接使用 GCTask 作为内部格式，避免无意义的转换。
 */

import { EventBus } from './EventBus';
import type { GCTask } from '../types';
import {
	DataSourceChanges,
	QueryOptions
} from './types';
import { IDataSource } from './IDataSource';
import { Logger } from '../utils/logger';

/**
 * 生成任务ID
 */
function generateTaskId(task: GCTask): string {
	return `${task.filePath}:${task.lineNumber}`;
}

export class TaskRepository {
	private dataSources: Map<string, IDataSource> = new Map();
	private taskCache: Map<string, GCTask> = new Map();
	private fileIndex: Map<string, Set<string>> = new Map();
	private eventBus: EventBus;

	constructor(eventBus: EventBus) {
		this.eventBus = eventBus;
	}

	/**
	 * 注册数据源
	 * @param source - 数据源实例
	 */
	registerDataSource(source: IDataSource): void {
		this.dataSources.set(source.sourceId, source);
		source.onChange(async (changes) => {
			await this.handleSourceChanges(source.sourceId, changes);
		});
	}

	/**
	 * 获取所有任务
	 * @param options - 查询选项
	 * @returns 任务列表
	 */
	getAllTasks(options?: QueryOptions): GCTask[] {
		const tasks = Array.from(this.taskCache.values());
		return this.filterTasks(tasks, options);
	}

	/**
	 * 根据日期范围获取任务
	 * @param start - 开始日期
	 * @param end - 结束日期
	 * @param dateField - 日期字段名
	 * @returns 任务列表
	 */
	getTasksByDateRange(
		start: Date,
		end: Date,
		dateField: keyof GCTask = 'dueDate'
	): GCTask[] {
		return Array.from(this.taskCache.values()).filter(task => {
			const date = task[dateField] as Date | undefined;
			return date && date >= start && date <= end;
		});
	}

	/**
	 * 根据文件路径获取任务
	 * @param filePath - 文件路径
	 * @returns 任务列表
	 */
	getTasksByFilePath(filePath: string): GCTask[] {
		const taskIds = this.fileIndex.get(filePath) || new Set();
		return Array.from(taskIds)
			.map(id => this.taskCache.get(id)!)
			.filter(Boolean);
	}

	/**
	 * 获取任务统计信息
	 * @returns 统计信息
	 */
	getStats(): {
		totalTasks: number;
		dataSources: number;
		totalFiles: number;
	} {
		return {
			totalTasks: this.taskCache.size,
			dataSources: this.dataSources.size,
			totalFiles: this.fileIndex.size
		};
	}

	/**
	 * 过滤任务
	 * @param tasks - 任务列表
	 * @param options - 查询选项
	 * @returns 过滤后的任务列表
	 */
	private filterTasks(tasks: GCTask[], options?: QueryOptions): GCTask[] {
		if (!options) return tasks;

		let filtered = tasks;

		if (options.status?.length) {
			filtered = filtered.filter(t => options.status!.includes(t.status as any));
		}

		if (options.priority?.length) {
			filtered = filtered.filter(t => options.priority!.includes(t.priority as any));
		}

		if (options.tags?.length) {
			filtered = filtered.filter(t =>
				options.tags!.some(tag => t.tags?.includes(tag))
			);
		}

		if (options.dateRange) {
			const fieldMap: Record<keyof import('./types').TaskDates, keyof GCTask> = {
				created: 'createdDate',
				start: 'startDate',
				scheduled: 'scheduledDate',
				due: 'dueDate',
				completed: 'completionDate',
				cancelled: 'cancelledDate'
			};
			const gcField = fieldMap[options.dateRange.field];

			filtered = filtered.filter(t => {
				const date = t[gcField] as Date | undefined;
				return date && date >= options.dateRange!.start && date <= options.dateRange!.end;
			});
		}

		if (options.sources?.length) {
			filtered = filtered.filter(t => options.sources!.includes(t.filePath));
		}

		return filtered;
	}

	/**
	 * 处理数据源变化
	 * @param sourceId - 数据源ID
	 * @param changes - 变化详情
	 */
	private async handleSourceChanges(
		sourceId: string,
		changes: DataSourceChanges
	): Promise<void> {
		const startTime = performance.now();
		Logger.debug('TaskRepository', `Processing changes from ${sourceId}:`, {
			created: changes.created.length,
			updated: changes.updated.length,
			deleted: changes.deleted.length,
			deletedFilePaths: changes.deletedFilePaths?.length || 0
		});

		// 处理新增任务
		for (const task of changes.created) {
			const taskId = generateTaskId(task);
			this.taskCache.set(taskId, task);

			// 更新文件索引
			if (task.filePath) {
				if (!this.fileIndex.has(task.filePath)) {
					this.fileIndex.set(task.filePath, new Set());
				}
				this.fileIndex.get(task.filePath)!.add(taskId);
			}

			// 发布事件
			this.eventBus.emit('task:created', { task });
		}

		// 处理更新任务
		for (const { id, changes: taskChanges, task: newTask } of changes.updated) {
			let updatedTask: GCTask | undefined;

			// 优先使用完整的新任务对象（如果提供）
			if (newTask) {
				updatedTask = newTask;
				this.taskCache.set(id, newTask);
			} else {
				// 否则使用增量更新
				const task = this.taskCache.get(id);
				if (task) {
					updatedTask = { ...task, ...taskChanges };
					this.taskCache.set(id, updatedTask);
				}
			}

			if (updatedTask) {
				// 发布事件
				this.eventBus.emit('task:updated', { task: updatedTask });
			}
		}

		// 处理删除任务
		for (const task of changes.deleted) {
			const taskId = generateTaskId(task);
			this.taskCache.delete(taskId);

			// 更新文件索引
			if (task.filePath) {
				const taskIds = this.fileIndex.get(task.filePath);
				if (taskIds) {
					taskIds.delete(taskId);
					if (taskIds.size === 0) {
						this.fileIndex.delete(task.filePath);
					}
				}
			}

			// 发布事件
			this.eventBus.emit('task:deleted', { taskId });
		}

		// 处理文件删除（按文件路径清理所有任务）
		if (changes.deletedFilePaths) {
			for (const filePath of changes.deletedFilePaths) {
				const taskIds = this.fileIndex.get(filePath);
				if (taskIds) {
					// 删除该文件的所有任务
					for (const taskId of taskIds) {
						this.taskCache.delete(taskId);
						this.eventBus.emit('task:deleted', { taskId });
					}
					// 清理文件索引
					this.fileIndex.delete(filePath);
				}
			}
		}

		const elapsed = performance.now() - startTime;
		Logger.stats('TaskRepository', `Changes processed in ${elapsed.toFixed(2)}ms`);
	}

	/**
	 * 清空缓存
	 */
	clear(): void {
		this.taskCache.clear();
		this.fileIndex.clear();
		this.eventBus.clear();
	}
}
