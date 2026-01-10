# Obsidian Dataview 文件索引机制分析报告

## 概述

本报告分析了 [obsidian-dataview](https://github.com/blacksmithgu/obsidian-dataview) 插件的文件索引机制，该插件能够在启动时快速扫描大量文件（如 "all 1897 files have been indexed in 0.652s"），并与本插件（obsidian-gantt-calendar）的实现进行对比，提出改进建议。

## 一、Dataview 索引架构

### 1.1 核心组件

Dataview 的索引系统主要由以下几个核心组件构成：

```
┌─────────────────────────────────────────────────────────────────┐
│                        FullIndex                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ LocalStorage│  │FileImporter │  │ PrefixIndex │              │
│  │   Cache     │  │(Web Workers)│  │             │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│         ↓                  ↓                ↓                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Pages     │  │   Tags/     │  │   Links    │              │
│  │   Map       │  │   Etags     │  │   Map      │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 文件结构

| 文件 | 职责 |
|------|------|
| `src/data-index/index.ts` | 核心索引类 `FullIndex`，管理所有子索引 |
| `src/data-import/persister.ts` | `LocalStorageCache`，IndexedDB 持久化缓存 |
| `src/data-import/web-worker/import-manager.ts` | `FileImporter`，多线程文件解析 |
| `src/data-model/transferable.ts` | Web Worker 数据序列化/反序列化 |

## 二、Dataview 性能优化关键技术

### 2.1 IndexedDB 持久化缓存

**实现位置**: `src/data-import/persister.ts`

```typescript
export class LocalStorageCache {
    public persister: LocalForage;

    public constructor(public appId: string, public version: string) {
        this.persister = localforage.createInstance({
            name: "dataview/cache/" + appId,
            driver: [localforage.INDEXEDDB],  // 使用 IndexedDB
            description: "Cache metadata about files and sections in the dataview index.",
        });
    }

    public async loadFile(path: string): Promise<Cached<Partial<PageMetadata>> | null | undefined> {
        return this.persister.getItem(this.fileKey(path)).then(raw => {
            let result = raw as any as Cached<Partial<PageMetadata>>;
            if (result) result.data = Transferable.value(result.data);
            return result;
        });
    }
}
```

**关键点**:
- 使用 `localforage` 库封装 IndexedDB
- 缓存结构: `{ version: string, time: number, data: Partial<PageMetadata> }`
- 存储完整的解析后数据，避免重复解析

### 2.2 缓存验证机制

**实现位置**: `src/data-index/index.ts` 的 `reload` 方法

```typescript
public async reload(file: TFile): Promise<{ cached: boolean; skipped: boolean }> {
    // 首次加载：尝试从持久化缓存读取
    if (this.pages.has(file.path) || this.initialized) {
        await this.import(file);
        return { cached: false, skipped: false };
    } else {
        return this.persister.loadFile(file.path).then(async cached => {
            // 缓存有效性检查：mtime + 版本号
            if (!cached || cached.time < file.stat.mtime || cached.version != this.indexVersion) {
                // 缓存过期，重新解析
                await this.import(file);
                return { cached: false, skipped: false };
            } else {
                // 缓存有效，直接使用
                this.finish(file, cached.data);
                return { cached: true, skipped: false };
            }
        });
    }
}
```

**验证逻辑**:
1. 检查缓存是否存在
2. 检查 `cached.time < file.stat.mtime`（文件是否被修改）
3. 检查 `cached.version != this.indexVersion`（索引版本是否匹配）

### 2.3 Web Worker 多线程解析

**实现位置**: `src/data-import/web-worker/import-manager.ts`

```typescript
export class FileImporter extends Component {
    workers: Worker[];
    busy: boolean[];
    reloadQueue: TFile[];
    reloadSet: Set<string>;
    callbacks: Map<string, [[FileCallback, FileCallback][]]>;

    public constructor(public numWorkers: number, ...) {
        // 创建多个 Web Worker（默认 2 个）
        for (let index = 0; index < numWorkers; index++) {
            let worker = new DataviewImportWorker({ name: "Dataview Indexer " + (index + 1) });
            worker.onmessage = evt => this.finish(evt.data.path, Transferable.value(evt.data.result), index);
            this.workers.push(worker);
            this.busy.push(false);
        }
    }

    public reload(file: TFile): Promise<any> {
        // 去重：同一文件的多次请求合并为一次
        if (this.reloadSet.has(file.path)) return promise;
        this.reloadSet.add(file.path);

        // 分配给空闲的 Worker
        let workerId = this.nextAvailableWorker();
        if (workerId !== undefined) {
            this.send(file, workerId);
        } else {
            this.reloadQueue.push(file);  // 加入队列
        }
        return promise;
    }
}
```

**优势**:
- 文件解析在后台线程进行，不阻塞 UI
- 多个 Worker 并行处理
- 请求去重避免重复工作
- 队列管理确保公平调度

### 2.4 数据序列化优化

**实现位置**: `src/data-model/transferable.ts`

为了在 Web Worker 和主线程之间高效传输数据，Dataview 实现了专门的序列化机制：

```typescript
export namespace Transferable {
    // 将复杂对象转换为可传输的简单对象
    export function transferable(value: any): any {
        if (value instanceof Map) {
            let copied = new Map();
            for (let [key, val] of value.entries())
                copied.set(transferable(key), transferable(val));
            return copied;
        }
        // ... 处理各种类型
    }

    // 反序列化
    export function value(transferable: any): any {
        // 还原为原始对象
    }
}
```

### 2.5 批量并行初始化

**实现位置**: `src/data-index/index.ts` 的 `_initialize` 方法

```typescript
private async _initialize(files: TFile[]) {
    let reloadStart = Date.now();
    // 并行处理所有文件
    let promises = files.map(l => this.reload(l));
    let results = await Promise.all(promises);

    let cached = 0, skipped = 0;
    for (let item of results) {
        if (item.skipped) { skipped += 1; continue; }
        if (item.cached) cached += 1;
    }

    console.log(`Dataview: all ${files.length} files have been indexed in ${(Date.now() - reloadStart) / 1000.0}s (${cached} cached, ${skipped} skipped).`);
}
```

## 三、本插件 (obsidian-gantt-calendar) 现状分析

### 3.1 当前实现

**文件**: `src/data-layer/MarkdownDataSource.ts`

```typescript
export class MarkdownDataSource implements IDataSource {
    private cache: Map<string, MarkdownFileCache> = new Map();

    private async scanAllFiles(): Promise<GCTask[]> {
        const markdownFiles = this.app.vault.getMarkdownFiles();
        const BATCH_SIZE = 50;

        // 批处理，但每批仍需完整解析
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batchResults = await Promise.all(
                batch.map(file => this.parseFileForScan(file.path))
            );
            // ...
        }
    }

    private async parseFileForScan(filePath: string): Promise<...> {
        // 每次都需要读取文件内容并解析
        const content = await this.app.vault.read(file);
        const lines = content.split('\n');
        const tasks = parseTasksFromListItems(file, lines, listItems, ...);
        // ...
    }
}
```

**文件**: `src/data-layer/TaskRepository.ts`

```typescript
export class TaskRepository {
    private taskCache: Map<string, GCTask> = new Map();  // 内存缓存

    // 没有持久化机制
}
```

### 3.2 性能瓶颈对比

| 特性 | Dataview | 本插件 | 影响 |
|------|----------|--------|------|
| **持久化缓存** | IndexedDB | 无 | 每次启动需完整解析所有文件 |
| **缓存验证** | mtime + version | 无 | 无法跳过未修改的文件 |
| **多线程解析** | Web Workers | 主线程 | 大量文件时 UI 可能卡顿 |
| **请求去重** | reloadSet | 无 | 同一文件可能被多次解析 |
| **增量更新** | 完整支持 | 部分支持 | 文件修改后需重新解析 |

## 四、改进建议

### 4.1 添加 IndexedDB 持久化缓存

**优先级**: 高

**实现方案**:

```typescript
// 新建 src/data-layer/IndexedDBCache.ts
import localforage from 'localforage';

interface CachedFileData {
    version: string;
    time: number;
    data: {
        taskIds: string[];
        tasks: GCTask[];  // 存储完整的任务数据
    };
}

export class IndexedDBCache {
    private persister: LocalForage;

    constructor(appId: string, indexVersion: string) {
        this.persister = localforage.createInstance({
            name: `gantt-calendar/cache/${appId}`,
            driver: [localforage.INDEXEDDB],
        });
    }

    async loadFile(path: string): Promise<CachedFileData | null> {
        return this.persister.getItem(`file:${path}`);
    }

    async storeFile(path: string, tasks: GCTask[], mtime: number): Promise<void> {
        await this.persister.setItem(`file:${path}`, {
            version: this.indexVersion,
            time: mtime,
            data: { tasks }
        });
    }

    async synchronize(existingPaths: string[]): Promise<string[]> {
        const keys = await this.persister.keys();
        const existingSet = new Set(existingPaths.map(p => `file:${p}`));
        const toDelete = keys.filter(k => k.startsWith('file:') && !existingSet.has(k));
        await Promise.all(toDelete(k => this.persister.removeItem(k)));
        return toDelete.map(k => k.substring(5));
    }
}
```

**集成到 MarkdownDataSource**:

```typescript
export class MarkdownDataSource implements IDataSource {
    private cache: IndexedDBCache;

    async initialize(config: DataSourceConfig): Promise<void> {
        // 初始化 IndexedDB 缓存
        this.cache = new IndexedDBCache(
            this.app.appId || 'default',
            '1.0'  // 索引版本
        );

        const allTasks = await this.scanAllFiles();
        // 清理已删除文件的缓存
        const existingPaths = Array.from(this.fileCache.keys());
        await this.cache.synchronize(existingPaths);
    }

    private async parseFileForScan(filePath: string): Promise<...> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return null;

        // 尝试从缓存加载
        const cached = await this.cache.loadFile(filePath);
        if (cached && cached.time >= file.stat.mtime) {
            // 缓存有效，直接使用
            return {
                filePath,
                tasks: cached.data.tasks,
                fromCache: true
            };
        }

        // 缓存无效，重新解析
        const tasks = await this.parseFileInternal(file);
        await this.cache.storeFile(filePath, tasks, file.stat.mtime);
        return { filePath, tasks, fromCache: false };
    }
}
```

### 4.2 添加请求去重机制

**优先级**: 中

```typescript
export class MarkdownDataSource implements IDataSource {
    private pendingReloads: Map<string, Promise<GCTask[]>> = new Map();

    private async reloadFileWithDedupe(filePath: string): Promise<GCTask[]> {
        // 检查是否已有正在进行的请求
        const existing = this.pendingReloads.get(filePath);
        if (existing) {
            return existing;
        }

        // 创建新请求
        const promise = this.parseFileForScan(filePath).then(result => {
            this.pendingReloads.delete(filePath);
            return result?.tasks || [];
        });

        this.pendingReloads.set(filePath, promise);
        return promise;
    }
}
```

### 4.3 Web Worker 支持（可选，复杂度较高）

**优先级**: 低（需要较大架构改动）

由于本插件使用 Obsidian 的 metadataCache.getFileCache()，该方法无法在 Web Worker 中调用（依赖 Obsidian API），实现 Web Worker 需要重构整个解析流程。

**替代方案**: 使用 `requestIdleCallback` 分批处理

```typescript
private async scanAllFiles(): Promise<GCTask[]> {
    const markdownFiles = this.app.vault.getMarkdownFiles();
    const allTasks: GCTask[] = [];

    for (let i = 0; i < markdownFiles.length; i++) {
        const result = await this.parseFileForScan(markdownFiles[i].path);
        if (result) allTasks.push(...result.tasks);

        // 每 10 个文件让出控制权，避免阻塞 UI
        if (i % 10 === 0) {
            await new Promise(resolve => requestIdleCallback(() => resolve(void 0)));
        }
    }

    return allTasks;
}
```

## 五、预期效果

实施 IndexedDB 缓存后，预期性能对比如下：

| 场景 | 当前 | 优化后 |
|------|------|--------|
| 冷启动 (1000 文件) | ~2-3s | ~200-300ms (首次)，~50-100ms (后续) |
| 热启动 (1000 文件) | ~2-3s | ~50-100ms (99% 缓存命中) |
| 单文件修改 | ~50-100ms | ~50-100ms (仅重解析修改文件) |

## 六、实施计划

### 阶段 1: IndexedDB 缓存基础（1-2天）
1. 添加 `localforage` 依赖
2. 实现 `IndexedDBCache` 类
3. 集成到 `MarkdownDataSource`
4. 添加缓存统计日志

### 阶段 2: 请求去重（0.5天）
1. 实现 `pendingReloads` 去重机制
2. 添加防抖优化

### 阶段 3: 测试与调优（0.5天）
1. 大文件库测试
2. 缓存一致性验证
3. 性能基准测试

## 七、总结

Dataview 的快速索引主要得益于以下三点：
1. **IndexedDB 持久化缓存** - 避免重复解析未修改的文件
2. **Web Worker 多线程** - 后台解析不阻塞 UI
3. **请求去重** - 避免同一文件的重复工作

本插件最优先应该实现的是 **IndexedDB 持久化缓存**，这将带来最显著的性能提升。Web Worker 方案由于架构限制，实施成本较高，可以作为后续优化方向。

---

**参考资料**:
- [obsidian-dataview 源码](https://github.com/blacksmithgu/obsidian-dataview)
- [localforage 文档](https://github.com/localForage/localForage)
