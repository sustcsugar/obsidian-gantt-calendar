/**
 * 数据层类型定义
 *
 * 本文件定义了数据层所需的核心类型。
 * 统一使用 GCTask 作为内部任务格式，避免无意义的格式转换。
 */

import { TaskStatusType } from '../tasks/taskStatus';
import type { GCTask } from '../types';

/**
 * 任务状态类型（与现有系统兼容）
 */
export type TaskStatus = TaskStatusType;

/**
 * 优先级类型（与现有系统兼容）
 */
export type Priority = 'highest' | 'high' | 'medium' | 'normal' | 'low' | 'lowest';

/**
 * 任务日期集合
 */
export interface TaskDates {
	created?: Date;
	start?: Date;
	scheduled?: Date;
	due?: Date;
	completed?: Date;
	cancelled?: Date;
}

/**
 * 数据源配置
 */
export interface DataSourceConfig {
	enabled: boolean;
	syncDirection: 'bidirectional' | 'import-only' | 'export-only';
	autoSync: boolean;
	syncInterval?: number;
	conflictResolution: 'local-win' | 'remote-win' | 'manual';
	globalFilter?: string;
	enabledFormats?: string[];
}

/**
 * 事件类型
 */
export type TaskEvent =
	| 'task:created'
	| 'task:updated'
	| 'task:deleted'
	| 'task:completed'
	| 'sync:started'
	| 'sync:completed'
	| 'sync:conflict';

/**
 * 事件处理器类型
 */
export type EventHandler = (data?: any) => void | Promise<void>;

/**
 * 数据源变化事件
 *
 * 使用 GCTask 作为统一的任务格式，避免转换开销
 */
export interface DataSourceChanges {
	sourceId: string;
	created: GCTask[];
	updated: Array<{ id: string; changes: TaskChanges; task?: GCTask }>;
	deleted: GCTask[];
	deletedFilePaths?: string[];  // 已删除的文件路径列表
}

/**
 * 任务变更类型
 *
 * 与 GCTask 字段保持一致，便于更新操作
 */
export interface TaskChanges {
	description?: string;
	completed?: boolean;
	cancelled?: boolean;
	status?: TaskStatus;
	priority?: string;
	tags?: string[];
	createdDate?: Date;
	startDate?: Date;
	scheduledDate?: Date;
	dueDate?: Date;
	cancelledDate?: Date;
	completionDate?: Date;
}

/**
 * 查询选项
 */
export interface QueryOptions {
	status?: TaskStatus[];
	priority?: Priority[];
	tags?: string[];
	dateRange?: {
		start: Date;
		end: Date;
		field: keyof TaskDates
	};
	sources?: string[];  // 数据源筛选
}

/**
 * 同步状态
 */
export interface SyncStatus {
	lastSyncAt?: Date;
	syncDirection: 'bidirectional' | 'import-only' | 'export-only';
	conflictResolution: 'local-win' | 'remote-win' | 'manual';
}
