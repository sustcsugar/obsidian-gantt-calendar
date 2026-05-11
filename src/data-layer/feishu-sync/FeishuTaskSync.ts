/**
 * 飞书任务双向同步引擎
 *
 * 实现 Obsidian ↔ 飞书任务的自动匹配、变更检测和双向同步。
 *
 * 核心流程: fetch → match → detect → apply
 */

import { App, TFile } from 'obsidian';
import type { GCTask } from '../../types';
import type { FeishuTaskRaw } from '../sources/api/providers/feishu/FeishuTypes';
import type { FeishuProvider } from '../sources/api/providers/FeishuProvider';
import { SyncStateManager, SyncRecord } from './syncState';
import {
    toFeishuTaskPayload,
    toFeishuCompleted,
    fromFeishuTask,
    GCTaskUpdates,
} from './taskMapper';
import { parseTasksFromFile } from '../../tasks/taskParser/main';
import { serializeTask, TaskUpdates } from '../../tasks/taskSerializer';
import { Logger } from '../../utils/logger';
import { PushFilterConfig, applyPushFilter, passesPushFilter } from '../../utils/taskFilter';

/** 冲突解决策略 */
export type ConflictStrategy = 'newest-win' | 'local-win' | 'remote-win';

/** 同步进度回调 */
export type SyncProgressCallback = (stage: string) => void;

/** 同步选项 */
export interface FeishuSyncOptions {
    /** 冲突解决策略 */
    conflictStrategy: ConflictStrategy;
    /** 新任务写入的目标文件路径（默认 'Tasks.md'） */
    targetFile: string;
    /** 启用的任务格式 */
    enabledFormats: ('tasks' | 'dataview')[];
    /** 全局任务过滤器 */
    globalFilter?: string;
    /** 任务清单 GUID（可选，用于限定同步到特定任务清单） */
    tasklistGuid?: string;
    /** 同步进度回调（可选，用于 UI 进度展示） */
    onProgress?: SyncProgressCallback;
    /** 授权用户的 open_id，用于设置任务负责人 */
    creatorOpenId?: string;
    /** 授权用户的 user_id，用于匹配 GUI 创建的任务负责人 */
    creatorUserId?: string;
    /** 推送过滤配置（仅限制 Obsidian → 飞书方向的推送） */
    pushFilter?: PushFilterConfig;
    /** 中断信号，用于手动停止同步 */
    abortSignal?: AbortSignal;
}

/** 单条变更的详细记录 */
export interface SyncResultDetail {
    /** 变更类型 */
    type: 'push-create' | 'push-update' | 'pull-create' | 'pull-update' | 'conflict' | 'clear-guid';
    /** 变更类型标签 */
    label: string;
    /** 任务描述（用于展示） */
    taskDescription: string;
    /** 是否成功 */
    success: boolean;
    /** 错误信息（仅在失败时有值） */
    error?: string;
}

/** 同步结果 */
export interface SyncResult {
    pushed: number;
    pulled: number;
    conflicted: number;
    skipped: number;
    errors: string[];
    /** 每个变更任务的详细记录 */
    details: SyncResultDetail[];
}

/** 任务匹配对 */
interface TaskMatch {
    feishuTask?: FeishuTaskRaw;
    obsidianTask?: GCTask;
    /** 匹配类型 */
    matchType: 'guid' | 'fuzzy' | 'feishu-only' | 'obsidian-only' | 'orphaned';
}

/** 单条变更 */
interface PendingChange {
    type: 'push-create' | 'push-update' | 'pull-create' | 'pull-update' | 'conflict' | 'clear-guid';
    feishuTask?: FeishuTaskRaw;
    obsidianTask?: GCTask;
}

// ==================== 同步引擎 ====================

export class FeishuTaskSync {
    private app: App;
    private provider: FeishuProvider;
    private state: SyncStateManager;
    private options: FeishuSyncOptions;

    constructor(
        app: App,
        provider: FeishuProvider,
        state: SyncStateManager,
        options: FeishuSyncOptions
    ) {
        this.app = app;
        this.provider = provider;
        this.state = state;
        this.options = options;
    }

    // ==================== 主入口 ====================

    /**
     * 执行双向同步
     */
    async sync(): Promise<SyncResult> {
        const result: SyncResult = { pushed: 0, pulled: 0, conflicted: 0, skipped: 0, errors: [], details: [] };
        const onProgress = this.options.onProgress;

        try {
            await this.state.load();

            Logger.info('FeishuTaskSync', 'Starting bidirectional sync (v2 API)', {
                targetFile: this.options.targetFile,
                conflictStrategy: this.options.conflictStrategy,
                tasklistGuid: this.options.tasklistGuid || 'none',
            });

            // 1. 获取双方任务
            onProgress?.('🔄 飞书同步: 获取飞书任务...');
            const feishuTasks = await this.fetchFeishuTasks();

            onProgress?.('🔄 飞书同步: 获取本地任务...');
            const obsidianTasks = await this.fetchObsidianTasks();

            Logger.info('FeishuTaskSync', `Fetched: ${feishuTasks.length} Feishu tasks, ${obsidianTasks.length} Obsidian tasks`);

            // 2. 匹配
            onProgress?.('🔄 飞书同步: 匹配任务...');
            const matches = this.matchTasks(feishuTasks, obsidianTasks);

            // 3. 检测变更
            const changes = this.detectChanges(matches);

            Logger.info('FeishuTaskSync', `Detected ${changes.length} pending changes`);

            // 应用推送过滤（仅限制 push-create 和 push-update）
            if (this.options.pushFilter?.enabled) {
                const before = changes.length;
                this.filterPushChanges(changes);
                Logger.info('FeishuTaskSync', `Push filter: ${before} → ${changes.length} changes (filtered ${before - changes.length})`);
            }

            // 4. 应用变更
            const total = changes.length;
            for (let i = 0; i < changes.length; i++) {
                if (this.shouldStop(result)) break;
                const change = changes[i];
                onProgress?.(`🔄 飞书同步: ${this.changeLabel(change.type)} ${i + 1}/${total}`);
                try {
                    await this.applyChange(change, result);
                    const taskDesc = change.obsidianTask?.description || change.feishuTask?.summary || 'unknown';
                    result.details.push({
                        type: change.type,
                        label: this.changeLabel(change.type),
                        taskDescription: taskDesc,
                        success: true,
                    });
                } catch (error) {
                    const taskDesc = change.obsidianTask?.description || change.feishuTask?.summary || 'unknown';
                    const msg = `[${change.type}] "${taskDesc}": ${error instanceof Error ? error.message : String(error)}`;
                    result.errors.push(msg);
                    result.details.push({
                        type: change.type,
                        label: this.changeLabel(change.type),
                        taskDescription: taskDesc,
                        success: false,
                        error: error instanceof Error ? error.message : String(error),
                    });
                    Logger.error('FeishuTaskSync', `Apply change failed: ${msg}`, error);
                }
            }

            // 5. 清理僵尸记录
            this.purgeStaleRecords(feishuTasks);

            // 6. 保存状态
            onProgress?.('🔄 飞书同步: 保存状态...');
            await this.state.save();

            // 附加停止原因
            const reason = this.stopReason(result);
            if (reason) result.errors.push(reason);

            const parts: string[] = [];
            if (result.pushed > 0) parts.push(`推送${result.pushed}`);
            if (result.pulled > 0) parts.push(`拉取${result.pulled}`);
            if (result.conflicted > 0) parts.push(`冲突${result.conflicted}`);
            const summary = parts.length > 0 ? parts.join('/') : '无变更';
            onProgress?.(`✅ 飞书同步完成: ${summary}`);

            Logger.info('FeishuTaskSync', `Sync complete: pushed=${result.pushed}, pulled=${result.pulled}, conflicted=${result.conflicted}, skipped=${result.skipped}, errors=${result.errors.length}`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            result.errors.push(msg);
            Logger.error('FeishuTaskSync', 'Sync failed', error);
            onProgress?.('❌ 飞书同步失败');
        }

        return result;
    }

    /**
     * 获取变更类型的中文标签
     */
    private changeLabel(type: string): string {
        const labels: Record<string, string> = {
            'push-create': '推送新建',
            'push-update': '推送更新',
            'pull-create': '拉取新建',
            'pull-update': '拉取更新',
            'conflict': '解决冲突',
            'clear-guid': '清理残留',
        };
        return labels[type] || type;
    }

    /**
     * 测试同步：仅同步截止时间最新的 N 条任务（默认 5 条）
     *
     * 用于调试，不做匹配和冲突检测，直接：
     * - 将 OB 中截止时间最新、且未同步过的任务推送到飞书
     * - 将飞书中截止时间最新、且未同步过的任务拉取到 OB
     */
    async testSync(limit: number = 5): Promise<SyncResult> {
        const result: SyncResult = { pushed: 0, pulled: 0, conflicted: 0, skipped: 0, errors: [], details: [] };
        const onProgress = this.options.onProgress;

        try {
            await this.state.load();

            // 1. 获取双方任务
            onProgress?.('🧪 测试同步: 获取飞书任务...');
            const feishuTasks = await this.fetchFeishuTasks();

            onProgress?.('🧪 测试同步: 获取本地任务...');
            const obsidianTasks = await this.fetchObsidianTasks();

            // 2. OB → 飞书：取截止时间最新、且未同步的任务（应用推送过滤）
            let obTasksCandidates = obsidianTasks
                .filter(t => !t.feishuGuid && t.dueDate)
                .sort((a, b) => b.dueDate!.getTime() - a.dueDate!.getTime());
            if (this.options.pushFilter?.enabled) {
                obTasksCandidates = applyPushFilter(obTasksCandidates, this.options.pushFilter);
            }
            const obTasksToPush = obTasksCandidates.slice(0, limit);

            // 3. 飞书 → OB：取截止时间最新、且未同步的任务
            const feishuTasksToPull = feishuTasks
                .filter(t => t.due?.timestamp && !this.state.getRecord(t.guid))
                .sort((a, b) => {
                    const timeA = parseInt(a.due?.timestamp || '0', 10);
                    const timeB = parseInt(b.due?.timestamp || '0', 10);
                    return timeB - timeA;
                })
                .slice(0, limit);

            Logger.info('FeishuTaskSync', `Test sync: push ${obTasksToPush.length}/${limit} OB tasks, pull ${feishuTasksToPull.length}/${limit} Feishu tasks`);

            // 4. 推送 OB → 飞书
            for (let i = 0; i < obTasksToPush.length; i++) {
                if (this.shouldStop(result)) break;
                const task = obTasksToPush[i];
                onProgress?.(`🧪 测试同步: 推送 OB→飞书 ${i + 1}/${obTasksToPush.length}`);
                try {
                    await this.pushCreate(task, result);
                    result.details.push({
                        type: 'push-create',
                        label: '推送新建',
                        taskDescription: task.description || 'unknown',
                        success: true,
                    });
                } catch (error) {
                    const msg = `[push-create] "${task.description}": ${error instanceof Error ? error.message : String(error)}`;
                    result.errors.push(msg);
                    result.details.push({
                        type: 'push-create',
                        label: '推送新建',
                        taskDescription: task.description || 'unknown',
                        success: false,
                        error: error instanceof Error ? error.message : String(error),
                    });
                    Logger.error('FeishuTaskSync', `Test sync push failed: ${msg}`, error);
                }
            }

            // 5. 拉取 飞书 → OB
            for (let i = 0; i < feishuTasksToPull.length; i++) {
                if (this.shouldStop(result)) break;
                const task = feishuTasksToPull[i];
                onProgress?.(`🧪 测试同步: 拉取 飞书→OB ${i + 1}/${feishuTasksToPull.length}`);
                try {
                    await this.pullCreate(task, result);
                    result.details.push({
                        type: 'pull-create',
                        label: '拉取新建',
                        taskDescription: task.summary || 'unknown',
                        success: true,
                    });
                } catch (error) {
                    const msg = `[pull-create] "${task.summary}": ${error instanceof Error ? error.message : String(error)}`;
                    result.errors.push(msg);
                    result.details.push({
                        type: 'pull-create',
                        label: '拉取新建',
                        taskDescription: task.summary || 'unknown',
                        success: false,
                        error: error instanceof Error ? error.message : String(error),
                    });
                    Logger.error('FeishuTaskSync', `Test sync pull failed: ${msg}`, error);
                }
            }

            // 6. 清理僵尸记录
            this.purgeStaleRecords(feishuTasks);

            // 7. 保存状态
            onProgress?.('🧪 测试同步: 保存状态...');
            await this.state.save();

            const reason = this.stopReason(result);
            if (reason) result.errors.push(reason);

            const parts: string[] = [];
            if (result.pushed > 0) parts.push(`推送${result.pushed}`);
            if (result.pulled > 0) parts.push(`拉取${result.pulled}`);
            const summary = parts.length > 0 ? parts.join('/') : '无变更';
            onProgress?.(`✅ 测试同步完成: ${summary}`);

            Logger.info('FeishuTaskSync', `Test sync complete: pushed=${result.pushed}, pulled=${result.pulled}, errors=${result.errors.length}`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            result.errors.push(msg);
            Logger.error('FeishuTaskSync', 'Test sync failed', error);
            onProgress?.('❌ 测试同步失败');
        }

        return result;
    }

    /** 检查是否应停止同步（手动中止或错误超限） */
    private shouldStop(result: SyncResult): boolean {
        if (this.options.abortSignal?.aborted) return true;
        if (result.errors.length >= 5) return true;
        return false;
    }

    /** 生成停止原因描述 */
    private stopReason(result: SyncResult): string | null {
        if (this.options.abortSignal?.aborted) return '同步已被用户手动停止';
        if (result.errors.length >= 5) return '错误次数超过 5 次，同步已自动停止';
        return null;
    }

    // ==================== 数据获取 ====================

    /**
     * 获取默认任务格式，取用户启用的第一个格式
     */
    private getDefaultFormat(): 'tasks' | 'dataview' {
        return this.options.enabledFormats?.[0] || 'tasks';
    }

    private async fetchFeishuTasks(): Promise<FeishuTaskRaw[]> {
        // 返回全部飞书任务（用于 GUID 匹配，防止重复创建）
        // pull 操作的过滤在 detectChanges 中按变更类型处理
        const allTasks = await this.provider.fetchAllFeishuTasks();
        Logger.info('FeishuTaskSync', `Fetched ${allTasks.length} Feishu tasks (all, for matching)`);
        return allTasks;
    }

    private async fetchObsidianTasks(): Promise<GCTask[]> {
        const tasks: GCTask[] = [];
        const files = this.app.vault.getMarkdownFiles();

        for (const file of files) {
            const fileCache = this.app.metadataCache.getFileCache(file);
            const listItems = fileCache?.listItems || [];
            if (listItems.length === 0) continue;

            try {
                const fileTasks = await this.parseObsidianFile(file, listItems);
                tasks.push(...fileTasks);
            } catch {
                // 跳过读取失败的文件
            }
        }

        return tasks;
    }

    /**
     * 从单个文件解析任务
     */
    private async parseObsidianFile(file: TFile, listItems: any[]): Promise<GCTask[]> {
        if (listItems.length === 0) return [];

        try {
            // 使用 read 而非 cachedRead，确保读取到最新文件内容
            // （上次同步写入的 feishuGuid 可能还未刷新到缓存）
            const content = await this.app.vault.read(file);
            return parseTasksFromFile(
                file,
                content,
                listItems,
                this.options.enabledFormats,
                this.options.globalFilter
            );
        } catch {
            return [];
        }
    }

    // ==================== 任务匹配 ====================

    /**
     * 匹配飞书任务与 Obsidian 任务
     *
     * 匹配优先级:
     * 1. GUID 精确匹配: feishuTask.guid === obsidianTask.feishuGuid
     * 2. 标题模糊匹配: 标题相似度 >= 0.6 + 日期相同
     * 3. 未匹配的各自归类为单侧任务
     */
    private matchTasks(feishuTasks: FeishuTaskRaw[], obsidianTasks: GCTask[]): TaskMatch[] {
        const matches: TaskMatch[] = [];
        const matchedObsidian = new Set<GCTask>();

        // 建立 feishuGuid → obsidianTask 索引
        const obsidianByGuid = new Map<string, GCTask>();
        for (const task of obsidianTasks) {
            if (task.feishuGuid) {
                obsidianByGuid.set(task.feishuGuid, task);
            }
        }

        Logger.info('FeishuTaskSync', `Match: ${feishuTasks.length} feishu, ${obsidianTasks.length} obsidian, ${obsidianByGuid.size} with GUID`);

        for (const feishu of feishuTasks) {
            // 1. GUID 精确匹配
            const guidMatch = obsidianByGuid.get(feishu.guid);
            if (guidMatch) {
                matches.push({ feishuTask: feishu, obsidianTask: guidMatch, matchType: 'guid' });
                matchedObsidian.add(guidMatch);
                continue;
            }

            // 2. 标题模糊匹配（仅在无 GUID 匹配时尝试）
            const fuzzyMatch = this.findFuzzyMatch(feishu, obsidianTasks, matchedObsidian);
            if (fuzzyMatch) {
                matches.push({ feishuTask: feishu, obsidianTask: fuzzyMatch, matchType: 'fuzzy' });
                matchedObsidian.add(fuzzyMatch);
                continue;
            }

            // 3. 仅在飞书存在的任务
            matches.push({ feishuTask: feishu, obsidianTask: undefined, matchType: 'feishu-only' });
        }

        // 4. 区分 orphaned（有 GUID 但飞书侧已删除）和 obsidian-only（纯本地任务）
        for (const task of obsidianTasks) {
            if (!matchedObsidian.has(task)) {
                if (task.feishuGuid) {
                    // 有 GUID 但飞书侧无对应任务 → 飞书中已被删除
                    matches.push({ obsidianTask: task, matchType: 'orphaned' });
                } else {
                    matches.push({ obsidianTask: task, matchType: 'obsidian-only' });
                }
            }
        }

        return matches;
    }

    /**
     * 标题模糊匹配
     */
    private findFuzzyMatch(
        feishu: FeishuTaskRaw,
        obsidianTasks: GCTask[],
        exclude: Set<GCTask>
    ): GCTask | null {
        for (const task of obsidianTasks) {
            if (exclude.has(task)) continue;
            if (task.feishuGuid) continue; // 已有 GUID 的不做模糊匹配

            const similarity = this.titleSimilarity(feishu.summary, task.description);
            if (similarity >= 0.6) {
                return task;
            }
        }
        return null;
    }

    /**
     * 标题相似度（基于公共子串）
     */
    /**
     * 判断飞书任务是否属于当前用户（用于过滤 pull 操作）
     */
    private isSelfTask(feishu: FeishuTaskRaw): boolean {
        const selfIds = [this.options.creatorOpenId, this.options.creatorUserId].filter(Boolean);
        if (selfIds.length === 0) return true; // 未配置用户信息时不过滤
        const assigneeId = feishu.assignee?.id;
        return !!assigneeId && selfIds.includes(assigneeId);
    }

    private titleSimilarity(a: string, b: string): number {
        if (!a || !b) return 0;
        if (a === b) return 1;

        const longer = a.length > b.length ? a : b;
        const shorter = a.length > b.length ? b : a;

        // 最长公共子串
        let maxLen = 0;
        for (let i = 0; i < shorter.length; i++) {
            for (let j = i + 1; j <= shorter.length; j++) {
                const sub = shorter.substring(i, j);
                if (longer.includes(sub)) {
                    maxLen = Math.max(maxLen, sub.length);
                }
            }
        }

        return maxLen / Math.max(a.length, b.length);
    }

    // ==================== 变更检测 ====================

    /**
     * 检测每个匹配对需要的变更
     */
    private detectChanges(matches: TaskMatch[]): PendingChange[] {
        const changes: PendingChange[] = [];

        for (const match of matches) {
            let change: PendingChange | null = null;

            switch (match.matchType) {
                case 'guid':
                case 'fuzzy':
                    change = this.detectMatchedChange(match);
                    break;
                case 'feishu-only':
                    // 仅拉取当前用户的任务，跳过他人的任务
                    if (match.feishuTask && !this.isSelfTask(match.feishuTask)) {
                        break;
                    }
                    change = { type: 'pull-create', feishuTask: match.feishuTask };
                    break;
                case 'orphaned':
                    // 飞书侧已删除，清除 Obsidian 中的残留 GUID
                    if (match.obsidianTask) {
                        change = { type: 'clear-guid', obsidianTask: match.obsidianTask };
                    }
                    break;
                case 'obsidian-only':
                    if (match.obsidianTask) {
                        change = { type: 'push-create', obsidianTask: match.obsidianTask };
                    }
                    break;
            }

            if (change) {
                changes.push(change);
            }
        }

        return changes;
    }

    /**
     * 检测已匹配任务的变更方向
     */
    private detectMatchedChange(match: TaskMatch): PendingChange | null {
        const feishu = match.feishuTask!;
        const obsidian = match.obsidianTask!;
        const guid = feishu.guid;

        const record = this.state.getRecord(guid);

        if (!record) {
            // 首次同步：双向都有数据，以飞书为准（pull）
            return { type: 'pull-update', feishuTask: feishu, obsidianTask: obsidian };
        }

        const timeMismatch = this.hasTimePrecisionMismatch(feishu, obsidian);
        const obsidianChanged = this.hasObsidianChanged(obsidian, record);

        // timeMismatch 只在 OB 未变更时触发 pull（OB 变更时用户意图优先）
        const feishuChanged = feishu.updated_at !== record.feishuUpdatedAt
            || this.isFeishuCompleted(feishu) !== record.feishuCompleted
            || (timeMismatch && !obsidianChanged);

        Logger.debug('FeishuTaskSync', `detectMatchedChange [${feishu.summary || obsidian.description || '?'}]`, {
            feishu_due: feishu.due ? { ts: feishu.due.timestamp, allDay: feishu.due.is_all_day } : null,
            ob_dueDate: obsidian.dueDate?.toISOString(),
            ob_precision: obsidian.datePrecision,
            feishu_update_time: feishu.updated_at,
            stored_update_time: record.feishuUpdatedAt,
            update_time_match: feishu.updated_at === record.feishuUpdatedAt,
            completed_changed: this.isFeishuCompleted(feishu) !== record.feishuCompleted,
            timeMismatch,
            feishuChanged,
            obsidianChanged,
        });

        if (feishuChanged && obsidianChanged) {
            return { type: 'conflict', feishuTask: feishu, obsidianTask: obsidian };
        } else if (feishuChanged) {
            return { type: 'pull-update', feishuTask: feishu, obsidianTask: obsidian };
        } else if (obsidianChanged) {
            return { type: 'push-update', feishuTask: feishu, obsidianTask: obsidian };
        }

        // 无变更，跳过
        return null;
    }

    /**
     * 判断 Obsidian 任务是否变更（比较内容哈希）
     */
    private hasObsidianChanged(task: GCTask, record: SyncRecord): boolean {
        const currentHash = this.hashTask(task);
        return currentHash !== record.lastSyncedContent;
    }

    /**
     * 计算任务关键字段的内容哈希
     */
    private hashTask(task: GCTask): string {
        const parts = [
            task.description || '',
            task.completed ? '1' : '0',
            task.priority || 'normal',
            task.dueDate?.getTime() || '0',
            task.startDate?.getTime() || '0',
        ];
        return parts.join('|');
    }

    /**
     * 判断飞书任务是否实际完成
     *
     * feishu.completed 可能为 undefined（v2 API 不一定返回），
     * 因此同时检查 completed_at 字段：非零值表示已完成。
     */
    private isFeishuCompleted(feishu: FeishuTaskRaw): boolean {
        return feishu.completed === true
            || (feishu.completed_at != null && feishu.completed_at !== '0');
    }

    /**
     * 检测飞书与 OB 任务的时间精度是否不一致
     *
     * 当飞书任务有具体时间（is_all_day === false）但 OB 任务只有日期时，
     * 视为飞书侧变更，触发 pull-update 以拉取时间信息。
     */
    private hasTimePrecisionMismatch(feishu: FeishuTaskRaw, obsidian: GCTask): boolean {
        const feishuDueHasTime = feishu.due && feishu.due.is_all_day !== true && feishu.due.timestamp;
        const obDueHasTime = obsidian.datePrecision?.dueDate === 'time';

        Logger.debug('FeishuTaskSync', `hasTimePrecisionMismatch [${feishu.summary || obsidian.description || '?'}]`, {
            feishu_due: feishu.due,
            feishuDueHasTime,
            obDueHasTime,
            ob_datePrecision: obsidian.datePrecision,
        });

        if (feishuDueHasTime && !obDueHasTime) return true;

        const feishuStartHasTime = feishu.start && feishu.start.is_all_day !== true && feishu.start.timestamp;
        const obStartTime = obsidian.datePrecision?.startDate === 'time';
        if (feishuStartHasTime && !obStartTime) return true;

        return false;
    }

    /**
     * 对 push-create / push-update 变更应用推送过滤
     * pull 方向变更始终保留，不受过滤影响
     */
    private filterPushChanges(changes: PendingChange[]): void {
        const filter = this.options.pushFilter;
        if (!filter?.enabled) return;

        // 仅过滤 push-create（入池），push-update（已在池中）不受过滤限制
        for (let i = changes.length - 1; i >= 0; i--) {
            const change = changes[i];
            if (change.type === 'push-create') {
                const task = change.obsidianTask!;
                if (!passesPushFilter(task, filter)) {
                    changes.splice(i, 1);
                }
            }
        }
    }

    // ==================== 变更应用 ====================

    private async applyChange(change: PendingChange, result: SyncResult): Promise<void> {
        switch (change.type) {
            case 'push-create':
                await this.pushCreate(change.obsidianTask!, result);
                break;
            case 'push-update':
                await this.pushUpdate(change.feishuTask!, change.obsidianTask!, result);
                break;
            case 'pull-create':
                await this.pullCreate(change.feishuTask!, result);
                break;
            case 'pull-update':
                await this.pullUpdate(change.feishuTask!, change.obsidianTask!, result);
                break;
            case 'conflict':
                await this.resolveConflict(change, result);
                break;
            case 'clear-guid':
                await this.clearStaleGuid(change.obsidianTask!, result);
                break;
            default:
                result.skipped++;
        }
    }

    /** Push: Obsidian → 飞书 (新建) */
    private async pushCreate(task: GCTask, result: SyncResult): Promise<void> {
        const payload = toFeishuTaskPayload(task);

        // v2 API 用 completed_at（毫秒时间戳）表示完成状态
        if (task.completed) {
            payload.completed_at = String(task.completionDate?.getTime() || Date.now());
        }

        // 设置负责人为授权用户
        if (this.options.creatorOpenId) {
            payload.assignee = { id: this.options.creatorOpenId, type: 'open_id' };
        }

        Logger.info('FeishuTaskSync', `Push creating: "${task.description?.substring(0, 30)}" → tasklist=${this.options.tasklistGuid || 'default'}`);

        const guid = await this.provider.createFeishuTask(payload, this.options.tasklistGuid);

        // 写回 GUID 到 Obsidian
        await this.writeGuidToObsidian(task, guid);

        // 记录同步状态
        this.state.setRecord(guid, {
            lastSyncAt: new Date().toISOString(),
            obsidianTaskId: SyncStateManager.makeTaskId(task.filePath, task.lineNumber),
            feishuUpdatedAt: String(Date.now()),
            lastSyncedContent: this.hashTask(task),
            feishuCompleted: task.completed,
        });

        result.pushed++;
        Logger.info('FeishuTaskSync', `Push created: ${task.description} → ${guid}`);
    }

    /** Push: Obsidian → 飞书 (更新) */
    private async pushUpdate(
        feishu: FeishuTaskRaw,
        task: GCTask,
        result: SyncResult
    ): Promise<void> {
        const payload = toFeishuTaskPayload(task);

        Logger.debug('FeishuTaskSync', `pushUpdate [${task.description || '?'}]`, {
            ob_dueDate: task.dueDate?.toISOString(),
            ob_completed: task.completed,
            payload_due: payload.due,
            payload_completed_at: payload.completed_at,
        });

        // 同步完成状态：v2 API 使用 completed_at（毫秒时间戳），"0" 表示恢复未完成
        // 注意：feishu.completed 可能未返回（undefined），需同时检查 completed_at 判断实际状态
        const feishuIsCompleted = this.isFeishuCompleted(feishu);

        if (task.completed !== feishuIsCompleted) {
            payload.completed_at = task.completed
                ? String(task.completionDate?.getTime() || Date.now())
                : '0';
        }

        if (Object.keys(payload).length === 0) {
            // 无有效字段变更
            const record = this.state.getRecord(feishu.guid);
            if (record) {
                record.lastSyncedContent = this.hashTask(task);
                record.lastSyncAt = new Date().toISOString();
            }
            result.skipped++;
            return;
        }

        await this.provider.updateFeishuTask(feishu.guid, payload);

        this.state.setRecord(feishu.guid, {
            lastSyncAt: new Date().toISOString(),
            obsidianTaskId: SyncStateManager.makeTaskId(task.filePath, task.lineNumber),
            feishuUpdatedAt: feishu.updated_at || String(Date.now()),
            lastSyncedContent: this.hashTask(task),
            feishuCompleted: task.completed,
        });

        result.pushed++;
        Logger.info('FeishuTaskSync', `Push updated: ${task.description}`);
    }

    /** Pull: 飞书 → Obsidian (新建) */
    private async pullCreate(feishu: FeishuTaskRaw, result: SyncResult): Promise<void> {
        const updates = fromFeishuTask({
            task_guid: feishu.guid,
            summary: feishu.summary,
            description: feishu.description,
            completed: this.isFeishuCompleted(feishu),
            due_time: feishu.due,
            start_time: feishu.start,
            priority: feishu.priority,
        });

        const line = this.buildTaskLine(updates);
        const file = await this.getOrCreateTargetFile();

        await this.app.vault.process(file, (content: string) => {
            return content.trimEnd() + '\n' + line + '\n';
        });

        // 获取新行号
        const newContent = await this.app.vault.cachedRead(file);
        const lineNumber = newContent.split('\n').length - 1; // 最后一行（0-based 转 1-based）

        this.state.setRecord(feishu.guid, {
            lastSyncAt: new Date().toISOString(),
            obsidianTaskId: SyncStateManager.makeTaskId(file.path, lineNumber),
            feishuUpdatedAt: feishu.updated_at || String(Date.now()),
            lastSyncedContent: '',
            feishuCompleted: this.isFeishuCompleted(feishu),
        });

        result.pulled++;
        Logger.info('FeishuTaskSync', `Pull created: ${feishu.summary}`);
    }

    /** Pull: 飞书 → Obsidian (更新) */
    private async pullUpdate(
        feishu: FeishuTaskRaw,
        task: GCTask,
        result: SyncResult
    ): Promise<void> {
        const updates = fromFeishuTask({
            task_guid: feishu.guid,
            summary: feishu.summary,
            description: feishu.description,
            completed: this.isFeishuCompleted(feishu),
            due_time: feishu.due,
            start_time: feishu.start,
            priority: feishu.priority,
        });

        Logger.debug('FeishuTaskSync', 'pullUpdate', {
            task: feishu.summary,
            feishu_due: feishu.due,
            updates_dueDate: updates.dueDate?.toISOString(),
            updates_precision: updates.datePrecision,
            ob_dueDate_before: task.dueDate?.toISOString(),
            ob_precision_before: task.datePrecision,
        });

        await this.updateObsidianTaskLine(task, updates);

        const updatedTask = { ...task, ...updates };
        this.state.setRecord(feishu.guid, {
            lastSyncAt: new Date().toISOString(),
            obsidianTaskId: SyncStateManager.makeTaskId(task.filePath, task.lineNumber),
            feishuUpdatedAt: feishu.updated_at || String(Date.now()),
            lastSyncedContent: this.hashTask(updatedTask as GCTask),
            feishuCompleted: this.isFeishuCompleted(feishu),
        });

        result.pulled++;
        Logger.info('FeishuTaskSync', `Pull updated: ${feishu.summary}`);
    }

    /** 处理冲突 */
    private async resolveConflict(change: PendingChange, result: SyncResult): Promise<void> {
        const { feishuTask: feishu, obsidianTask: task } = change;
        if (!feishu || !task) return;

        switch (this.options.conflictStrategy) {
            case 'local-win':
                await this.pushUpdate(feishu, task, result);
                break;
            case 'remote-win':
                await this.pullUpdate(feishu, task, result);
                break;
            case 'newest-win':
            default: {
                // 比较时间戳
                const feishuTime = parseInt(feishu.updated_at || '0', 10);
                // 从同步记录获取上次同步时间作为参考
                const record = this.state.getRecord(feishu.guid);
                const lastSync = record ? new Date(record.lastSyncAt).getTime() : 0;

                if (feishuTime > lastSync && lastSync > 0) {
                    await this.pullUpdate(feishu, task, result);
                } else {
                    await this.pushUpdate(feishu, task, result);
                }
                break;
            }
        }

        result.conflicted++;
        Logger.info('FeishuTaskSync', `Conflict resolved via ${this.options.conflictStrategy}: ${task.description}`);
    }

    /** 清除飞书侧已不存在的僵尸同步记录 */
    private purgeStaleRecords(feishuTasks: FeishuTaskRaw[]): void {
        const feishuGuids = new Set(feishuTasks.map(t => t.guid));
        const staleGuids = this.state.getAllGuids().filter(g => !feishuGuids.has(g));
        if (staleGuids.length > 0) {
            for (const guid of staleGuids) {
                this.state.removeRecord(guid);
            }
            Logger.info('FeishuTaskSync', `Purged ${staleGuids.length} stale sync state records`);
        }
    }

    /** 清理飞书侧已删除的残留 GUID */
    private async clearStaleGuid(task: GCTask, result: SyncResult): Promise<void> {
        const oldGuid = task.feishuGuid;
        await this.updateObsidianTaskLine(task, {
            feishuGuid: null,     // null → 清除 GUID
        });

        // 从同步状态中移除
        if (oldGuid) {
            this.state.removeRecord(oldGuid);
        }

        Logger.info('FeishuTaskSync', `Cleared stale GUID ${oldGuid} from: ${task.description}`);
    }

    // ==================== Obsidian 文件操作 ====================

    /**
     * 生成任务行文本（含列表标记）
     *
     * serializeTask 只返回 "[ ] 内容" 部分，需补上 "- " 列表前缀。
     */
    private buildTaskLine(updates: GCTaskUpdates): string {
        const mockTask: GCTask = {
            filePath: '',
            fileName: '',
            lineNumber: 0,
            content: updates.description || '',
            description: updates.description || '',
            completed: updates.completed || false,
            priority: updates.priority || 'normal',
            dueDate: updates.dueDate,
            startDate: updates.startDate,
            feishuGuid: updates.feishuGuid ?? undefined,
            datePrecision: updates.datePrecision,
        };

        const taskUpdates: TaskUpdates = {
            completed: updates.completed,
            content: updates.description,
            feishuGuid: updates.feishuGuid,
            dueDate: updates.dueDate,
            startDate: updates.startDate,
            priority: updates.priority as any,
            datePrecision: updates.datePrecision,
        };

        // serializeTask 返回 "[ ] 内容"，需要补上 "- " 列表标记
        const taskContent = serializeTask(this.app, mockTask, taskUpdates, this.getDefaultFormat());
        return `- ${taskContent}`;
    }

    /**
     * 更新 Obsidian 文件中的单行任务
     *
     * 保留原始行的缩进和列表标记（- 或 *），只替换任务内容部分。
     */
    private async updateObsidianTaskLine(task: GCTask, updates: GCTaskUpdates): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(task.filePath);
        if (!(file instanceof TFile)) {
            throw new Error(`File not found: ${task.filePath}`);
        }

        await this.app.vault.process(file, (content: string) => {
            const lines = content.split('\n');
            const idx = task.lineNumber - 1; // 1-based → 0-based

            if (idx < 0 || idx >= lines.length) {
                throw new Error(`Line ${task.lineNumber} out of range in ${task.filePath}`);
            }

            const originalLine = lines[idx];

            // 提取原始缩进和列表标记（与 taskUpdater.ts 保持一致）
            const listMatch = originalLine.match(/^(\s*)([-*])\s+\[.\]/);

            // 构建更新后的任务内容
            const taskUpdates: TaskUpdates = {
                completed: updates.completed !== undefined ? updates.completed : task.completed,
                content: updates.description,
                feishuGuid: updates.feishuGuid,
                dueDate: updates.dueDate !== undefined ? updates.dueDate : task.dueDate,
                startDate: updates.startDate !== undefined ? updates.startDate : task.startDate,
                priority: updates.priority as any,
                datePrecision: updates.datePrecision !== undefined ? updates.datePrecision : task.datePrecision,
            };

            // completed 变更时同步 status，避免 serializeTask 用旧 status 覆盖 checkbox
            if (updates.completed !== undefined) {
                taskUpdates.status = updates.completed ? 'done' : 'todo';
            }

            const taskContent = serializeTask(this.app, task, taskUpdates, task.format || this.getDefaultFormat());

            // 拼接完整行：缩进 + 列表标记 + 空格 + 任务内容
            if (listMatch) {
                const indent = listMatch[1];
                const listMarker = listMatch[2];
                lines[idx] = `${indent}${listMarker} ${taskContent}`;
            } else {
                // 降级处理：原始行没有列表标记，直接补上 "- "
                lines[idx] = `- ${taskContent}`;
            }

            return lines.join('\n');
        });
    }

    /**
     * 将飞书 GUID 写回 Obsidian 任务行
     *
     * 在 push-create 后调用，将飞书返回的 GUID 写入对应任务行。
     */
    private async writeGuidToObsidian(task: GCTask, guid: string): Promise<void> {
        Logger.info('FeishuTaskSync', `Writing GUID ${guid} to ${task.filePath}:${task.lineNumber} "${task.description?.substring(0, 30)}"`);
        await this.updateObsidianTaskLine(task, { feishuGuid: guid });
        Logger.info('FeishuTaskSync', `GUID written successfully: ${guid}`);
    }

    /**
     * 获取新任务的目标文件
     */
    private async getOrCreateTargetFile(): Promise<TFile> {
        const path = this.options.targetFile || 'gantt-calendar-feishu-sync.md';
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) return file;

        // 自动创建目标文件
        await this.app.vault.create(path, '');
        const created = this.app.vault.getAbstractFileByPath(path);
        if (created instanceof TFile) return created;

        throw new Error(`Failed to create target file: ${path}`);
    }

    private getTargetFile(): TFile {
        const path = this.options.targetFile || 'gantt-calendar-feishu-sync.md';
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) return file;

        throw new Error(`Target file not found: ${path}. Please create it first.`);
    }
}
