# Obsidian 甘特日历插件 - 缓存系统重构与飞书双向同步方案

## 执行摘要

**核心目标**：通过分层架构重构，解决性能瓶颈、解耦组件、支持飞书多维表格双向同步

**关键改进**：
- 🚀 性能提升：MonthView 渲染时间从 500ms 降至 < 100ms
- 🏗️ 架构解耦：分层设计（数据层、业务层、视图层）
- 🔄 双向同步：支持飞书多维表格 + 本地 Markdown
- 🧪 可测试性：依赖注入，单元测试覆盖 > 80%

**技术选型**：
- 仓库模式（Repository Pattern）- 统一数据访问
- 事件驱动架构（Event-Driven）- 组件解耦
- 数据适配器模式（Adapter Pattern）- 多数据源支持
- 字段级合并 + 版本向量（Vector Clock）- 冲突解决

---

## 当前架构问题分析

### 问题 1：性能瓶颈

**现象**：
- MonthView 每次渲染调用 35 次 `getAllTasks()`
- 所有视图全量重渲染，无法局部更新
- 无查询结果缓存

**代码路径**：
- `src/views/MonthView.ts:68-69` - 循环调用 loadMonthViewTasks
- `src/views/MonthView.ts:98` - 每次都调用 getAllTasks

### 问题 2：紧耦合

**现象**：
- 视图直接访问 `plugin.taskCache`
- 无法独立测试
- 难以扩展第三方数据源

**代码路径**：
- 所有视图都直接访问 `plugin.taskCache.getAllTasks()`

### 问题 3：全量刷新

**现象**：
- 任何文件变化触发所有视图重渲染
- 深度比较 `areTasksEqual()` 只避免通知，不避免读取

**代码路径**：
- `src/taskManager.ts:256-264` - notifyListeners 简单回调

### 问题 4：缺少唯一标识和版本控制

**现象**：
- GCTask 使用 `filePath:lineNumber` 作为临时 ID
- 无法支持跨设备同步
- 无冲突检测机制

**代码路径**：
- `src/types.ts:96-115` - GCTask 接口定义

---

## 目标架构设计

### 分层架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                        │
│  Views: YearView, MonthView, WeekView, DayView, TaskView,    │
│         GanttView, Toolbar                                   │
└───────────────────────┬─────────────────────────────────────┘
                        │ observe (订阅事件)
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                   Business Logic Layer                       │
│  ┌───────────────┐  ┌────────────────┐  ┌────────────────┐ │
│  │ TaskStore     │  │ SyncManager    │  │ ConflictResolver│
│  │ (状态管理)     │  │ (同步协调)      │  │ (冲突解决)      │
│  └───────────────┘  └────────────────┘  └────────────────┘ │
└───────────────────────┬─────────────────────────────────────┘
                        │ use (使用仓库)
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                      Data Access Layer                       │
│  ┌───────────────┐  ┌────────────────┐  ┌────────────────┐ │
│  │ TaskRepository│  │ TaskIndex      │  │ CacheManager   │ │
│  │ (统一接口)     │  │ (快速索引)      │  │ (多级缓存)      │
│  └───────────────┘  └────────────────┘  └────────────────┘ │
│      │                    │                    │            │
│      ├────────────────────┼────────────────────┼───────────┤
│      ▼                    ▼                    ▼            │
│  ┌─────────┐        ┌──────────┐        ┌──────────┐      │
│  │Markdown │        │ Feishu   │        │ Future   │      │
│  │DataSource│       │ DataSource│       │Sources   │      │
│  └─────────┘        └──────────┘        └──────────┘      │
└─────────────────────────────────────────────────────────────┘
                        ↑
                        │ emits (发布事件)
                        │
                ┌───────────────┐
                │   EventBus    │
                │  (事件总线)    │
                └───────────────┘
```

### 核心数据结构

#### 1. ExternalTask（数据源通用格式）

```typescript
interface ExternalTask {
  id: string;                    // 唯一标识符（必须）
  sourceId: string;              // 数据源ID
  title: string;                 // 任务标题
  description?: string;          // 描述
  status: TaskStatus;            // 状态
  priority: Priority;            // 优先级
  tags: string[];                // 标签
  dates: TaskDates;              // 日期集合
  metadata: Record<string, any>; // 扩展元数据
  version: number;               // 版本号（用于冲突检测）
  updatedAt: Date;               // 最后更新时间
  createdAt: Date;               // 创建时间
  syncInfo?: SyncInfo;           // 同步信息
}

interface TaskDates {
  created?: Date;
  start?: Date;
  scheduled?: Date;
  due?: Date;
  completed?: Date;
  cancelled?: Date;
}

interface SyncInfo {
  lastSyncAt?: Date;
  conflictStatus?: 'synced' | 'conflict' | 'pending';
  externalId?: string;  // 外部系统ID
}
```

#### 2. NormalizedTask（内部统一格式）

```typescript
interface NormalizedTask {
  id: string;                  // 全局唯一ID
  sourceId: string;            // 数据源ID
  externalId: string;          // 外部系统ID
  filePath?: string;           // 文件路径（仅 Markdown）
  lineNumber?: number;         // 行号（仅 Markdown）

  // 业务字段
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  tags: string[];
  dates: TaskDates;

  // 元数据
  version: number;
  createdAt: Date;
  updatedAt: Date;
  syncInfo?: SyncInfo;
}
```

#### 3. IDataSource（数据源抽象接口）

```typescript
interface IDataSource {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly isReadOnly: boolean;

  initialize(config: DataSourceConfig): Promise<void>;
  getTasks(): Promise<ExternalTask[]>;
  onChange(handler: ChangeEventHandler): void;

  createTask(task: ExternalTask): Promise<string>;
  updateTask(taskId: string, changes: TaskChanges): Promise<void>;
  deleteTask(taskId: string): Promise<void>;

  getSyncStatus(): Promise<SyncStatus>;
  destroy(): void;
}

interface DataSourceConfig {
  enabled: boolean;
  syncDirection: 'bidirectional' | 'import-only' | 'export-only';
  autoSync: boolean;
  syncInterval?: number;
  conflictResolution: 'local-win' | 'remote-win' | 'manual';
  globalFilter?: string;
  enabledFormats?: string[];
}
```

---

## 关键组件设计

### 1. TaskRepository（任务仓库）

**职责**：统一数据访问接口

**核心方法**：
```typescript
class TaskRepository {
  // 注册数据源
  registerDataSource(source: IDataSource): void

  // 高性能查询
  getAllTasks(options?: QueryOptions): NormalizedTask[]
  getTasksByDateRange(start, end, dateField): NormalizedTask[]
  getTasksByFilePath(filePath: string): NormalizedTask[]

  // 任务操作
  async updateTask(taskId, changes): Promise<NormalizedTask>
  async createTask(task): Promise<string>
  async deleteTask(taskId): Promise<void>

  // 内部方法
  private handleSourceChanges(sourceId, changes)
  private filterTasks(tasks, options)
}
```

**性能优化**：
- 内存缓存：`Map<taskId, NormalizedTask>`
- 文件索引：`Map<filePath, Set<taskId>>`
- 事件驱动更新

### 2. TaskStore（任务存储服务）

**职责**：业务逻辑层，提供智能查询缓存

**核心方法**：
```typescript
class TaskStore {
  // 月视图优化（解决 35 次读取问题）
  getMonthViewTasks(year, month, options?): Map<number, NormalizedTask[]>

  // 智能缓存
  private queryCache: Map<string, CachedQueryResult>
  private invalidateCache(taskIds: string[])

  // 事件处理
  private setupEventListeners()
}
```

**缓存策略**：
```typescript
interface CachedQueryResult {
  data: any;
  timestamp: number;
  ttl: number;  // 5秒缓存
}
```

### 3. TaskIndex（任务索引）

**职责**：快速查找，避免全量扫描

**索引类型**：
```typescript
class TaskIndex {
  private dateIndex: Map<date, Set<taskIds>>      // 日期索引
  private tagIndex: Map<tag, Set<taskIds>>        // 标签索引
  private statusIndex: Map<status, Set<taskIds>>  // 状态索引
  private fileIndex: Map<filePath, Set<taskIds>>  // 文件索引

  index(task: NormalizedTask): void
  query(query: QueryOptions): Set<string>
}
```

### 4. SyncManager（同步管理器）

**职责**：协调多数据源双向同步

**同步流程**：
```typescript
class SyncManager {
  async syncAll(): Promise<SyncResult> {
    for (const source of this.dataSources) {
      await this.syncSource(source)
    }
  }

  private async syncSource(source): Promise<SourceSyncResult> {
    // 1. 拉取远程任务
    const remoteTasks = await source.getTasks()

    // 2. 获取本地任务
    const localTasks = this.repository.getAllTasks({ sources: [source.sourceId] })

    // 3. 对比并检测变化
    const changes = this.detectChanges(localTasks, remoteTasks)

    // 4. 解决冲突
    const resolved = await this.conflictResolver.resolve(changes)

    // 5. 应用变更
    await this.applyChanges(source, resolved)
  }

  private detectChanges(localTasks, remoteTasks): DetectedChanges {
    // 返回: created, updated, deleted, conflicts
  }
}
```

### 5. ConflictResolver（冲突解决器）

**职责**：检测和解决同步冲突

**解决策略**：

#### 策略 1：Last-Write-Wins（LWW）
```typescript
function lwwResolution(local, remote): NormalizedTask {
  return local.updatedAt > remote.updatedAt ? local : toNormalized(remote)
}
```

#### 策略 2：字段级合并
```typescript
function fieldMergeResolution(local, remote): NormalizedTask {
  return {
    ...local,
    title: newerField(local.title, local.updatedAt, remote.title, remote.updatedAt),
    priority: higherPriority(local.priority, remote.priority),
    tags: Array.from(new Set([...local.tags, ...remote.tags])),
    dates: {
      due: newerDate(local.dates.due, remote.dates.due),
      // ...其他日期
    },
    version: Math.max(local.version, remote.version) + 1
  }
}
```

#### 策略 3：版本向量（Vector Clock）
```typescript
interface VectorClock {
  [clientId: string]: number
}

function hasConflict(local, remote): boolean {
  // 检测并发修改
  return isConcurrent(local.metadata.vectorClock, remote.metadata.vectorClock)
}
```

### 6. EventBus（事件总线）

**职责**：解耦组件通信

```typescript
class EventBus {
  on(eventName: string, handler: EventHandler): void
  off(eventName: string, handler: EventHandler): void
  emit(eventName: string, data?: any): void
  once(eventName: string, handler: EventHandler): void
}

// 事件类型
type TaskEvent =
  | 'task:created'
  | 'task:updated'
  | 'task:deleted'
  | 'task:completed'
  | 'sync:started'
  | 'sync:completed'
  | 'sync:conflict'
```

---

## 双向同步流程

### 同步流程图

```
┌─────────────────────────────────────────────────────────────┐
│              SyncManager.syncAll() 触发同步                   │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 1: 拉取远程数据                                         │
│  - MarkdownDataSource: 扫描文件                               │
│  - FeishuDataSource: API 获取所有记录                         │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 2: 检测变化（3-way merge）                              │
│  - 对比本地缓存和远程数据                                      │
│  - 识别: created, updated, deleted, conflict                 │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 3: 解决冲突                                             │
│  - 自动合并（字段级别）                                       │
│  - 配置策略（local-win/remote-win/manual）                    │
│  - 手动冲突弹窗                                               │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 4: 应用变更                                             │
│  - 批量创建新任务                                             │
│  - 批量更新现有任务                                           │
│  - 批量删除已删除任务                                         │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 5: 更新缓存和通知视图                                    │
│  - 更新 TaskRepository 缓存                                   │
│  - 发布 task:updated 事件                                     │
│  - 视图增量更新                                               │
└─────────────────────────────────────────────────────────────┘
```

### 冲突解决示例

**场景**：同时修改同一任务

| 字段 | 本地修改 | 飞书修改 | 解决策略 |
|------|---------|---------|---------|
| 标题 | "完成报告" | "撰写报告" | 取较新的（时间戳比较） |
| 优先级 | high | medium | 取较高的（high） |
| 截止日期 | 2025-01-15 | 2025-01-20 | 取较晚的（2025-01-20） |
| 标签 | ["工作"] | ["紧急"] | 合并去重 |
| 状态 | in_progress | todo | 取较新的 |

**结果**：合并后的任务包含所有改进

---

## 数据源实现

### 1. MarkdownDataSource

**职责**：适配现有的 Markdown 文件解析

**核心方法**：
```typescript
class MarkdownDataSource implements IDataSource {
  readonly sourceId = 'markdown'
  readonly sourceName = 'Markdown Files'
  readonly isReadOnly = false

  private cache: Map<filePath, {tasks: GCTask[], lastModified: number}>

  async initialize(): Promise<void> {
    await this.scanAllFiles()
    this.setupFileWatchers()
  }

  async getTasks(): Promise<ExternalTask[]> {
    return Array.from(this.cache.values())
      .flatMap(file => file.tasks)
      .map(task => this.toExternalTask(task))
  }

  private toExternalTask(task: GCTask): ExternalTask {
    return {
      id: `${task.filePath}:${task.lineNumber}`,
      sourceId: this.sourceId,
      title: task.description,
      // ... 映射其他字段
      version: 1,  // 使用文件 mtime
      updatedAt: new Date()
    }
  }

  private setupFileWatchers(): void {
    this.app.vault.on('modify', async (file) => {
      await this.updateFileCache(file.path)
      // 发布变化事件
      this.changeHandler?.(changes)
    })
  }
}
```

**复用现有代码**：
- `parseTasksFromListItems()` - 任务解析
- `areTasksEqual()` - 变化检测

### 2. FeishuDataSource

**职责**：集成飞书多维表格 API

**核心方法**：
```typescript
class FeishuDataSource implements IDataSource {
  readonly sourceId = 'feishu-bitable'
  readonly sourceName = '飞书多维表格'
  readonly isReadOnly = false

  private apiClient: FeishuApiClient
  private config: FeishuDataSourceConfig

  async getTasks(): Promise<ExternalTask[]> {
    const records = await this.apiClient.getAllRecords()
    return records.map(record => this.recordToTask(record))
  }

  async createTask(task: ExternalTask): Promise<string> {
    const record = this.taskToRecord(task)
    const result = await this.apiClient.createRecord(record)
    return result.record_id
  }

  private recordToTask(record: FeishuRecord): ExternalTask {
    const fields = record.fields
    return {
      id: record.record_id,
      sourceId: this.sourceId,
      title: fields[this.config.fieldMapping.title],
      // ... 映射其他字段
      version: fields.__version__ || 1,
      updatedAt: new Date(fields.last_modified_time)
    }
  }
}
```

**API 客户端**：
```typescript
class FeishuApiClient {
  private async getAccessToken(): Promise<string> {
    // OAuth 2.0 获取 tenant_access_token
  }

  async getAllRecords(): Promise<FeishuRecord[]> {
    // 分页获取所有记录
  }

  async createRecord(record): Promise<FeishuRecord> {
    // 创建记录
  }

  async updateRecord(recordId, record): Promise<void> {
    // 更新记录
  }

  async deleteRecord(recordId): Promise<void> {
    // 删除记录
  }
}
```

**速率限制**：
```typescript
class RateLimiter {
  private limit = 10000  // 基础版：10,000 次/月
  private window = 30 * 24 * 60 * 60 * 1000  // 30天

  async acquire(): Promise<void> {
    // 检查并限制请求频率
  }
}
```

---

## 性能优化策略

### 1. 多级缓存系统

```typescript
class CacheManager {
  // L1: 查询结果缓存（5秒 TTL）
  private queryCache: Map<string, CachedResult>

  // L2: 任务索引（永久，直到任务变化）
  private taskIndex: TaskIndex

  // L3: 文件级缓存（永久，直到文件变化）
  private fileCache: Map<filePath, FileTasks>

  getMonthViewTasks(year, month): Map<number, NormalizedTask[]> {
    const cacheKey = `month:${year}:${month}`

    // 检查缓存
    if (this.queryCache.has(cacheKey)) {
      const cached = this.queryCache.get(cacheKey)!
      if (!this.isCacheStale(cached)) {
        return cached.data
      }
    }

    // 构建查询
    const tasks = this.repository.getTasksByDateRange(start, end)
    const grouped = this.groupTasksByDate(tasks, year, month)

    // 缓存结果
    this.queryCache.set(cacheKey, {
      data: grouped,
      timestamp: Date.now(),
      ttl: 5000
    })

    return grouped
  }

  invalidate(affectedFiles, affectedTasks): void {
    // 智能失效：只清除受影响的查询
  }
}
```

### 2. 增量渲染优化

```typescript
class IncrementalViewUpdater {
  // 增量更新月视图
  updateMonthView(viewId, changes: TaskChanges[]): void {
    for (const change of changes) {
      this.updateTaskCard(viewId, change.taskId)
    }
  }

  // 虚拟滚动
  setupVirtualScrolling(container): void {
    const visibleDays = this.getVisibleDays(container)
    const tasks = this.getTasksForDays(visibleDays)
    this.renderTasks(container, tasks)
  }

  // 防抖处理
  debouncedUpdate = debounce(() => this.refresh(), 300)
}
```

### 3. 性能指标

| 指标 | 当前 | 目标 | 提升 |
|------|------|------|------|
| MonthView 渲染时间 | 500ms | < 100ms | 5x |
| 缓存命中率 | 0% | > 90% | - |
| API 调用次数 | 基准 | -80% | - |
| 内存占用 | - | < 50MB | - |

---

## 分阶段实施计划

### Phase 1: 基础架构重构（Week 1-2）

**目标**：建立分层架构，不破坏现有功能

**任务清单**：
1. ✅ 创建事件总线（`EventBus.ts`）
2. ✅ 定义数据源接口（`IDataSource.ts`, `types.ts`）
3. ✅ 实现任务仓库（`TaskRepository.ts`）
4. ✅ 迁移 TaskCacheManager 到 MarkdownDataSource
5. ✅ 更新视图以使用 TaskRepository
6. ✅ 单元测试

**关键文件**：
- **新建**：
  - `src/data-layer/EventBus.ts`
  - `src/data-layer/IDataSource.ts`
  - `src/data-layer/TaskRepository.ts`
  - `src/data-layer/MarkdownDataSource.ts`
  - `src/data-layer/types.ts`
- **修改**：
  - `src/taskManager.ts` → 重构为适配器模式
  - `main.ts` → 初始化新架构
  - `src/views/*.ts` → 使用新 API

**向后兼容策略**：
```typescript
// 旧代码继续工作
plugin.taskCache.getAllTasks()

// 内部委托给新架构
class TaskCacheManager {
  private repository: TaskRepository

  getAllTasks(): GCTask[] {
    return this.repository.getAllTasks().map(toGCTask)
  }
}
```

### Phase 2: 性能优化（Week 3）

**目标**：解决性能问题

**任务清单**：
1. ✅ 实现任务索引（`TaskIndex.ts`）
2. ✅ 实现缓存管理器（`CacheManager.ts`）
3. ✅ 实现 TaskStore（`TaskStore.ts`）
4. ✅ 优化 MonthView（使用 `getMonthViewTasks()`）
5. ✅ 实现增量更新机制
6. ✅ 性能测试和优化

**关键文件**：
- **新建**：
  - `src/data-layer/TaskIndex.ts`
  - `src/data-layer/CacheManager.ts`
  - `src/business-layer/TaskStore.ts`
- **修改**：
  - `src/views/MonthView.ts` → 使用 `taskStore.getMonthViewTasks()`
  - `src/views/WeekView.ts`
  - `src/views/DayView.ts`

**性能验证**：
```typescript
describe('Performance Tests', () => {
  it('MonthView should render in < 100ms', async () => {
    const start = performance.now()
    await monthView.render()
    const duration = performance.now() - start
    expect(duration).toBeLessThan(100)
  })

  it('Cache hit rate should be > 90%', () => {
    // 多次渲染，计算缓存命中率
  })
})
```

### Phase 3: 飞书数据源实现（Week 4-5）

**目标**：实现飞书多维表格集成

**任务清单**：
1. ✅ 实现 FeishuDataSource
2. ✅ 实现 FeishuApiClient
3. ✅ 实现速率限制器（RateLimiter）
4. ✅ 飞书数据格式映射
5. ✅ 集成测试

**关键文件**：
- **新建**：
  - `src/data-layer/FeishuDataSource.ts`
  - `src/data-layer/FeishuApiClient.ts`
  - `src/data-layer/RateLimiter.ts`
- **修改**：
  - `src/settings.ts` → 添加飞书配置界面

**飞书配置界面**：
```typescript
interface FeishuSettings {
  appId: string
  appSecret: string
  bitableId: string
  tableId: string
  fieldMapping: {
    title: string
    description?: string
    status: string
    priority: string
    tags: string
    startDate: string
    dueDate: string
  }
  syncDirection: 'bidirectional' | 'import-only' | 'export-only'
  autoSync: boolean
  syncInterval?: number
  conflictResolution: 'local-win' | 'remote-win' | 'manual'
}
```

### Phase 4: 双向同步实现（Week 6-7）

**目标**：实现完整的双向同步

**任务清单**：
1. ✅ 实现 SyncManager
2. ✅ 实现 ConflictResolver
3. ✅ 实现三种冲突解决策略
4. ✅ 实现同步状态监控
5. ✅ 用户界面（同步进度、冲突解决弹窗）

**关键文件**：
- **新建**：
  - `src/business-layer/SyncManager.ts`
  - `src/business-layer/ConflictResolver.ts`
  - `src/components/SyncStatusModal.ts`
  - `src/components/ConflictResolutionModal.ts`
- **修改**：
  - `src/main.ts` → 初始化 SyncManager
  - `src/settings.ts` → 添加同步控制按钮

**同步测试用例**：
```typescript
describe('SyncManager', () => {
  it('should sync new tasks from Feishu to local', async () => {
    // 在飞书创建任务
    // 执行同步
    // 验证本地有新任务
  })

  it('should sync new tasks from local to Feishu', async () => {
    // 本地创建任务
    // 执行同步
    // 验证飞书有新任务
  })

  it('should detect and resolve conflicts', async () => {
    // 同时修改本地和飞书
    // 执行同步
    // 验证冲突被正确解决
  })
})
```

### Phase 5: 测试和文档（Week 8）

**目标**：确保质量和可维护性

**任务清单**：
1. ✅ 单元测试覆盖（目标 > 80%）
2. ✅ 集成测试
3. ✅ 性能测试
4. ✅ 用户文档
5. ✅ API 文档

**测试框架**：Jest + Testing Library

**文档结构**：
```
docs/
├── architecture.md        # 架构设计文档
├── data-sources.md       # 数据源开发指南
├── sync-guide.md         # 同步功能用户指南
├── api-reference.md      # API 参考
└── contributing.md       # 贡献指南
```

---

## 关键文件修改清单

### 新建文件（19 个）

**数据层（9 个）**：
1. `src/data-layer/EventBus.ts` - 事件总线
2. `src/data-layer/types.ts` - 数据层类型定义
3. `src/data-layer/IDataSource.ts` - 数据源接口
4. `src/data-layer/TaskRepository.ts` - 任务仓库
5. `src/data-layer/MarkdownDataSource.ts` - Markdown 数据源
6. `src/data-layer/FeishuDataSource.ts` - 飞书数据源
7. `src/data-layer/FeishuApiClient.ts` - 飞书 API 客户端
8. `src/data-layer/TaskIndex.ts` - 任务索引
9. `src/data-layer/CacheManager.ts` - 缓存管理器

**业务层（3 个）**：
10. `src/business-layer/TaskStore.ts` - 任务存储服务
11. `src/business-layer/SyncManager.ts` - 同步管理器
12. `src/business-layer/ConflictResolver.ts` - 冲突解决器

**视图层修改（5 个）**：
13. `src/views/MonthView.ts` - 优化
14. `src/views/WeekView.ts` - 优化
15. `src/views/DayView.ts` - 优化
16. `src/views/TaskView.ts` - 优化
17. `src/views/GanttView.ts` - 优化

**组件（4 个）**：
18. `src/components/SyncStatusModal.ts` - 同步状态弹窗
19. `src/components/ConflictResolutionModal.ts` - 冲突解决弹窗
20. `src/components/DataSourceSettings.ts` - 数据源配置界面

### 修改文件（5 个）

1. **`src/taskManager.ts`** - 重构为适配器模式，委托给 TaskRepository
2. **`main.ts`** - 初始化新架构组件
3. **`src/settings.ts`** - 添加数据源配置
4. **`src/GCMainView.ts`** - 使用 TaskStore 替代直接访问 taskCache
5. **`src/types.ts`** - 添加新类型定义

---

## 风险评估和缓解策略

### 风险 1：性能退化

**可能性**：中
**影响**：高

**缓解措施**：
- ✅ 性能基准测试（每次 PR 自动运行）
- ✅ 渐进式迁移（保留旧代码路径）
- ✅ 性能监控和告警

### 风险 2：数据丢失

**可能性**：低
**影响**：极高

**缓解措施**：
- ✅ 备份机制（同步前自动备份）
- ✅ 事务性更新（失败回滚）
- ✅ 冲突解决日志

### 风险 3：API 限制超限

**可能性**：中
**影响**：中

**缓解措施**：
- ✅ 速率限制器（RateLimiter）
- ✅ 批量操作（减少 API 调用）
- ✅ 智能同步（仅同步变化）

### 风险 4：兼容性问题

**可能性**：中
**影响**：中

**缓解措施**：
- ✅ 向后兼容适配器
- ✅ 逐步迁移策略
- ✅ 回滚机制

---

## 技术调研参考

### 双向同步技术方案

基于调研结果，主流方案包括：

1. **OT (Operational Transformation)**：实时协同编辑，Google Docs 使用
2. **CRDT (Conflict-Free Replicated Data Types)**：无冲突复制，自动收敛
3. **传统方法**：Last Write Wins (LWW)、Vector Clock、版本号机制

**我们的选择**：结合 LWW 和字段级合并，支持 Vector Clock 扩展

### Obsidian 同步机制

参考方案：
- **官方 Sync**：加密、增量同步、diff-match-patch 冲突解决
- **LiveSync (CouchDB)**：本地 DB + 远程 DB，双向复制

**我们的启发**：增量更新 + 事件驱动

### 飞书多维表格 API

关键特性：
- **Webhook 事件驱动**：订阅记录变化
- **批量操作 API**：创建/更新/删除
- **OAuth 2.0 认证**
- **限制**：基础版 10,000 次 API 调用/月

**我们的应对**：速率限制器 + 批量操作

---

## 总结

### 核心优势

1. **🏗️ 解耦架构**：清晰的分层设计，易于维护和扩展
2. **🚀 高性能**：多级缓存 + 智能索引，解决现有性能瓶颈
3. **🔄 可扩展**：插件式数据源架构，轻松添加新的第三方集成
4. **🛡️ 可靠性**：完善的冲突解决和错误处理机制
5. **✅ 向后兼容**：渐进式迁移，不破坏现有功能

### 预期收益

**性能提升**：
- MonthView 渲染时间：500ms → < 100ms（5倍提升）
- 缓存命中率：0% → > 90%
- API 调用次数：减少 80%

**可维护性**：
- 测试覆盖率：0% → > 80%
- 新功能开发时间：减少 50%

**扩展性**：
- ✅ 支持飞书多维表格双向同步
- ✅ 预留其他平台集成接口（Notion, Todoist 等）
- ✅ 支持离线场景和冲突解决

### 实施要点

**第一优先级**：Phase 1-2（基础架构 + 性能优化）
- 解决最紧迫的性能问题
- 建立可扩展的架构基础

**第二优先级**：Phase 3-4（飞书集成 + 双向同步）
- 实现第三方同步核心功能
- 验证架构的扩展性

**第三优先级**：Phase 5（测试和文档）
- 确保长期可维护性
- 降低后续开发成本
