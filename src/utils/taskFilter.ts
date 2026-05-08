import type { GCTask } from '../types';

/** 推送过滤配置 */
export interface PushFilterConfig {
    enabled: boolean;
    paths: string[];
    completionStatus: 'all' | 'incomplete-only';
    sinceDate: string;  // ISO 日期字符串（YYYY-MM-DD），空字符串表示不限
}

/** 默认推送过滤配置 */
export const DEFAULT_PUSH_FILTER: PushFilterConfig = {
    enabled: false,
    paths: [],
    completionStatus: 'all',
    sinceDate: '',
};

/** 文件路径匹配（include 模式：路径在列表中的任务通过） */
export function matchPath(filePath: string, paths: string[]): boolean {
    if (paths.length === 0) return true;

    const normalizedPaths = paths.map(p => p.replace(/\\/g, '/').toLowerCase());
    const normalizedFile = filePath.replace(/\\/g, '/').toLowerCase();

    return normalizedPaths.some(p => {
        if (p.endsWith('/')) {
            return normalizedFile.startsWith(p) || normalizedFile.includes('/' + p);
        }
        return normalizedFile === p || normalizedFile.endsWith('/' + p) || normalizedFile.includes(p);
    });
}

/** 日期过滤：任务任一日期字段 >= sinceDate 即通过 */
export function matchDate(task: GCTask, sinceDate: string): boolean {
    if (!sinceDate) return true;

    const threshold = new Date(sinceDate).getTime();
    if (isNaN(threshold)) return true;

    const dates = [
        task.dueDate,
        task.startDate,
        task.createdDate,
        task.scheduledDate,
        task.completionDate,
    ];

    return dates.some(d => d && d.getTime() >= threshold);
}

/** 单任务过滤判定 */
export function passesPushFilter(task: GCTask, config: PushFilterConfig): boolean {
    if (!config.enabled) return true;

    if (config.completionStatus === 'incomplete-only' && task.completed) {
        return false;
    }
    if (config.paths.length > 0 && !matchPath(task.filePath, config.paths)) {
        return false;
    }
    if (config.sinceDate && !matchDate(task, config.sinceDate)) {
        return false;
    }
    return true;
}

/** 批量过滤（用于 testSync 等场景） */
export function applyPushFilter(tasks: GCTask[], config: PushFilterConfig): GCTask[] {
    if (!config.enabled) return tasks;
    return tasks.filter(t => passesPushFilter(t, config));
}
