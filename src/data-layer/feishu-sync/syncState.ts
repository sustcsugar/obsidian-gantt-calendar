/**
 * 同步状态管理
 *
 * 持久化飞书任务同步状态到 .feishu-sync-state.json。
 * 用于检测任务是否需要重新同步，避免重复操作。
 */

import { App, normalizePath } from 'obsidian';

const STATE_FILE = '.feishu-sync-state.json';

/** 单条同步记录 */
export interface SyncRecord {
    /** 最后同步时间 (ISO 8601) */
    lastSyncAt: string;
    /** Obsidian 任务标识 (文件路径:行号) */
    obsidianTaskId: string;
    /** 飞书任务最后更新时间 (毫秒时间戳字符串) */
    feishuUpdatedAt: string;
    /** 上次同步时的 Obsidian 任务内容哈希 */
    lastSyncedContent: string;
    /** 上次同步时飞书任务的完成状态 */
    feishuCompleted?: boolean;
}

/** 同步状态数据 (key 为 feishuGuid) */
type SyncStateData = Record<string, SyncRecord>;

/**
 * 同步状态管理器
 *
 * 将同步元数据持久化到 vault 根目录的 .feishu-sync-state.json。
 * 以飞书 GUID 为键建立索引。
 */
export class SyncStateManager {
    private app: App;
    private data: SyncStateData = {};
    private loaded = false;

    constructor(app: App) {
        this.app = app;
    }

    /** 获取状态文件路径 */
    get statePath(): string {
        return normalizePath(STATE_FILE);
    }

    /** 从磁盘加载状态 */
    async load(): Promise<void> {
        try {
            if (await this.app.vault.adapter.exists(this.statePath)) {
                const raw = await this.app.vault.adapter.read(this.statePath);
                this.data = JSON.parse(raw) as SyncStateData;
            } else {
                this.data = {};
            }
            this.loaded = true;
        } catch {
            this.data = {};
            this.loaded = true;
        }
    }

    /** 将状态写入磁盘 */
    async save(): Promise<void> {
        if (!this.loaded) return;
        try {
            const raw = JSON.stringify(this.data, null, 2);
            await this.app.vault.adapter.write(this.statePath, raw);
        } catch {
            // 静默失败，下次加载时会重置
        }
    }

    /** 获取指定 GUID 的同步记录 */
    getRecord(guid: string): SyncRecord | undefined {
        return this.data[guid];
    }

    /** 设置同步记录 */
    setRecord(guid: string, record: SyncRecord): void {
        this.data[guid] = record;
    }

    /** 删除同步记录 */
    removeRecord(guid: string): void {
        delete this.data[guid];
    }

    /** 获取所有 GUID */
    getAllGuids(): string[] {
        return Object.keys(this.data);
    }

    /**
     * 判断任务是否需要同步
     *
     * 比较飞书任务的更新时间与本地记录的同步时间。
     * 如果飞书任务在最后同步之后被修改过，则需要重新同步。
     *
     * @param guid - 飞书任务 GUID
     * @param feishuUpdatedAt - 飞书任务的更新时间 (毫秒时间戳字符串)
     * @returns true 表示需要同步
     */
    needsSync(guid: string, feishuUpdatedAt: string): boolean {
        const record = this.data[guid];
        if (!record) return true;

        // 飞书更新时间比记录的同步时间晚 → 需要同步
        return feishuUpdatedAt > record.feishuUpdatedAt;
    }

    /**
     * 生成 Obsidian 任务标识
     */
    static makeTaskId(filePath: string, lineNumber: number): string {
        return `${filePath}:${lineNumber}`;
    }
}
