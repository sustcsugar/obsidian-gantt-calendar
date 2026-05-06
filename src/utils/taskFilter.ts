import type { GCTask } from '../types';
import type { TagFilterOperator } from '../types';

/** 虚拟状态 key：组合选项，对应多个实际状态 */
export const VIRTUAL_STATUS_UNCOMPLETED = '_uncompleted';
export const VIRTUAL_STATUS_COMPLETED = '_completed';

/** 推送过滤配置 */
export interface PushFilterConfig {
    enabled: boolean;
    statuses: string[];
    tags: string[];
    tagOperator: TagFilterOperator;
    priorities: string[];
    paths: string[];
    pathMode: 'include' | 'exclude';
}

/** 默认推送过滤配置 */
export const DEFAULT_PUSH_FILTER: PushFilterConfig = {
    enabled: false,
    statuses: [],
    tags: [],
    tagOperator: 'OR',
    priorities: [],
    paths: [],
    pathMode: 'include',
};

/** 推断任务状态（当任务没有明确的 status 字段时） */
function inferStatus(task: GCTask): string {
    if (task.completed) return 'done';
    if (task.cancelled) return 'canceled';
    return 'todo';
}

/** 状态过滤（支持虚拟组合选项 _uncompleted / _completed） */
export function applyStatusFilter(tasks: GCTask[], statuses: string[]): GCTask[] {
    if (statuses.length === 0) return tasks;
    return tasks.filter(task => {
        if (statuses.includes(VIRTUAL_STATUS_UNCOMPLETED) && !task.completed && !task.cancelled) return true;
        if (statuses.includes(VIRTUAL_STATUS_COMPLETED) && (task.completed || task.cancelled)) return true;
        const taskStatus = task.status || inferStatus(task);
        return statuses.includes(taskStatus);
    });
}

/** 标签过滤 */
export function applyTagFilter(tasks: GCTask[], tags: string[], operator: TagFilterOperator): GCTask[] {
    if (tags.length === 0) return tasks;

    const selectedLower = tags.map(t => t.toLowerCase());

    return tasks.filter(task => {
        if (!task.tags || task.tags.length === 0) {
            return operator === 'NOT';
        }
        const taskLower = task.tags.map(t => t.toLowerCase());

        switch (operator) {
            case 'AND':
                return selectedLower.every(t => taskLower.includes(t));
            case 'OR':
                return selectedLower.some(t => taskLower.includes(t));
            case 'NOT':
                return !selectedLower.some(t => taskLower.includes(t));
            default:
                return false;
        }
    });
}

/** 优先级过滤 */
export function applyPriorityFilter(tasks: GCTask[], priorities: string[]): GCTask[] {
    if (priorities.length === 0) return tasks;
    return tasks.filter(task => {
        const p = task.priority || 'normal';
        return priorities.includes(p);
    });
}

/** 文件路径过滤 */
export function applyPathFilter(tasks: GCTask[], paths: string[], mode: 'include' | 'exclude'): GCTask[] {
    if (paths.length === 0) return tasks;

    const normalizedPaths = paths.map(p => p.replace(/\\/g, '/').toLowerCase());

    return tasks.filter(task => {
        const filePath = task.filePath.replace(/\\/g, '/').toLowerCase();
        const matched = normalizedPaths.some(p => {
            if (p.endsWith('/')) {
                return filePath.startsWith(p) || filePath.includes('/' + p);
            }
            return filePath === p || filePath.endsWith('/' + p) || filePath.includes(p);
        });

        return mode === 'include' ? matched : !matched;
    });
}

/** 组合推送过滤 */
export function applyPushFilter(tasks: GCTask[], config: PushFilterConfig): GCTask[] {
    if (!config.enabled) return tasks;

    let filtered = tasks;

    if (config.statuses.length > 0) {
        filtered = applyStatusFilter(filtered, config.statuses);
    }
    if (config.tags.length > 0) {
        filtered = applyTagFilter(filtered, config.tags, config.tagOperator);
    }
    if (config.priorities.length > 0) {
        filtered = applyPriorityFilter(filtered, config.priorities);
    }
    if (config.paths.length > 0) {
        filtered = applyPathFilter(filtered, config.paths, config.pathMode);
    }

    return filtered;
}
