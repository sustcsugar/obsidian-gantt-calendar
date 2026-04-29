# TaskStore 缓存机制与大数据量性能分析报告

**日期**: 2026-04-30
**范围**: `src/TaskStore.ts` → `TaskRepository` → `MarkdownDataSource` → 视图消费全链路

---

## 一、缓存架构总览

系统存在 **三层缓存**，均为内存缓存，无持久化：

| 层级 | 位置 | 数据结构 | 生命周期 |
|------|------|----------|----------|
| L1 结果缓存 | `TaskStore.ts:49-50` | `GCTask[]` + `cacheValid` 布尔值 | 任何事件立即失效 |
| L2 仓库缓存 | `TaskRepository.ts:32-33` | `Map<string, GCTask>` + `Map<string, Set<string>>` fileIndex | 仅 `clear()` / 插件重启时清空 |
| L3 文件元缓存 | `MarkdownDataSource.ts:60` | `Map<string, MarkdownFileCache>`（仅存 taskId 引用） | 按文件粒度增删 |

### 关键发现：L1 缓存失效策略过于激进

`TaskStore.setupEventForwarding()`（第87-108行）中，**每一个** `task:created`、`task:updated`、`task:deleted` 事件都立即调用 `invalidateCache()`，将 `cachedTasks` 置为 `null`。单次用户按键可能触发多次 Obsidian `modify` 事件 → 每次经过 50ms 防抖后的文件重解析 → 每个文件中所有同 ID 任务全部标记为 `updated` → 逐个发射 EventBus 事件 → 每次都 invalidate L1 缓存。

**结果**：在编辑含 500 个任务的大文件时，一次字符修改会导致 500 次 `invalidateCache()` 调用（虽然结果相同——都是置 null）。

---

## 二、完整数据流向

### 2.1 文件变更路径（最高频）

```
Obsidian vault 'modify' 事件
  → MarkdownDataSource (50ms 按文件防抖)
    → processFileModification() 重解析整个文件
      → detectChangesByIds() 将所有同 ID 任务标记为 updated（不做字段级 diff）
        → changeHandler → TaskRepository.handleSourceChanges()
          → 更新 taskCache Map + fileIndex
          → EventBus.emit('task:created' / 'task:updated' / 'task:deleted')
            → TaskStore: invalidateCache() + notifyListenersDebounced(75ms)
              → GCMainView.incrementalRefresh() / GCSidebarView.refreshCurrentTab()
                → 各视图调用 getAllTasks() → cache miss → 从仓库 Map 重建数组
                → 内存过滤 + 排序 → DOM 更新
```

### 2.2 初始化路径

```
TaskStore.initialize()
  → TaskRepository.clear()
  → MarkdownDataSource.initialize()
    → scanAllFiles()：按 50 个文件一批，批内 Promise.all 并发解析，批间 setTimeout(0)
    → notifyInitialTasks(allTasks) → handleSourceChanges() → EventBus
  → notifyListeners()
```

### 2.3 飞书同步路径（独立于上述链路）

```
FeishuTaskSync.sync()
  → 直接读取 vault 所有文件并解析（绕过 TaskStore/TaskRepository）
  → 匹配 → 冲突检测 → 写入文件（vault.process）
  → 写入操作触发 Obsidian 'modify' → 走 2.1 文件变更路径
  → 保存状态到 .feishu-sync-state.json
```

---

## 三、性能瓶颈分析

### 瓶颈 1：全量返回，无按日期/范围查询

**严重程度：高**

`TaskStore` 只暴露 `getAllTasks()` 一个数据获取方法。底层 `TaskRepository` 虽然提供了 `getTasksByDateRange()`（第68行）和 `getTasksByFilePath()`（第84行），但被 `TaskStore` 的门面模式完全遮蔽，**所有视图只能拿到全量数组后自行过滤**。

调用 `getAllTasks()` 的位置共 **22 处**，分布如下：

| 调用场景 | 频次 |
|----------|------|
| 各视图 render/refresh | 14 处 |
| 拖放操作（查找源任务） | 5 处 |
| 标签提取（工具栏/侧边栏） | 2 处 |
| 状态栏统计 | 1 处 |

假设 vault 中有 10,000 个任务，每次视图刷新需要：
- `Array.from(taskCache.values())` — O(N) 遍历，分配 10,000 个引用的新数组
- 每个视图独立执行过滤（`filter(task => matchDate(task, target))`）— 再次 O(N)
- 排序（`sortTasks`）— O(N log N)

### 瓶颈 2：同文件内所有任务无条件标记为 updated

**严重程度：高**

`MarkdownDataSource.detectChangesByIds()`（第584-596行）在文件被修改后，将**所有**存在于旧解析结果和新解析结果中的 taskId 全部放入 `updated` 数组，**不检查字段是否实际变更**。

```typescript
// 第584-596行：所有同ID任务一律标记为updated
for (const [id, newTask] of newIdMap) {
    if (oldIdSet.has(id)) {
        changes.updated.push({ id, changes: {}, task: newTask });
    }
}
```

实际上存在另一个方法 `detectChanges()`（第610行）使用 `areTasksEqual()` 进行字段级比较，但在热路径中未被调用。代码注释说明这是有意为之（"确保当用户修改任务属性后视图能正确刷新"），但代价是：
- 大文件中每次编辑产生 O(n) 个 EventBus 事件
- O(n) 次 `invalidateCache()` 调用
- 所有视图被通知 n 次（虽然 75ms 防抖会合并通知，但缓存已失效 n 次）

### 瓶颈 3：插件启动时全量重解析

**严重程度：中**

`scanAllFiles()` 在初始化时遍历 vault 中所有 markdown 文件，50 个一批进行解析。每批内部 `Promise.all` 并发读取 50 个文件并运行完整的 4 步解析管道。**没有任何持久化缓存**——每次插件启动都从零开始。

对于 1,000 个文件的 vault，这意味着 20 个批次的顺序处理，总耗时取决于最慢文件。

### 瓶颈 4：单个渲染周期内重复获取

**严重程度：中**

月视图和周视图在一次渲染中多次调用 `getAllTasks()`：
- 月视图 `render()`：第113行（拖放）+ 第170行（筛选检测）+ 第281行（`loadMonthViewTasks` 内部再次获取）
- 周视图 `render()`：第142行（检测）+ 第449/540行（拖放）+ 第577行（`loadWeekViewTasks`）

虽然 `cachedTasks` 在第二次调用时会命中缓存，但这是在同一个渲染周期内——如果中间发生过任何事件使缓存失效，就会出现不一致。

### 瓶颈 5：所有视图独立执行相同的过滤逻辑

**严重程度：中**

`TaskStore` 的 L1 缓存只是一个全量数组。每个视图拿到后自行执行：
1. `applyStatusFilter()` — 按状态筛选
2. `applyTagFilter()` — 按标签筛选（支持 AND/OR/NOT）
3. 日期范围过滤 — 按 `dateFilterField` 与目标日期比较
4. `sortTasks()` — 排序

这些过滤结果在各视图之间不共享。当日视图和侧边栏同时显示时，同样的全量数据被过滤两次。

### 瓶颈 6：飞书同步独立扫描全 vault

**严重程度：低**

`FeishuTaskSync.fetchObsidianTasks()` 自己遍历所有 markdown 文件并解析任务，完全绕过 `TaskStore`/`TaskRepository`。同步完成后写入文件触发的 Obsidian 事件会再次被 `MarkdownDataSource` 捕获并重解析。同一批任务被解析了两次。

### 瓶颈 7：防抖分层但无法减少核心开销

**严重程度：低**

存在三层防抖：
- MarkdownDataSource: 50ms（按文件）
- TaskStore 通知: 75ms（全局）
- SyncManager: 5000ms（自动同步触发）

在快速连续编辑时，50ms + 75ms 的防抖可以减少视图重渲染次数，但**无法减少重解析开销**——每次文件修改都会在 50ms 后触发完整的文件重解析和 EventBus 事件洪流。

---

## 四、内存占用分析

假设 10,000 个任务，每个 `GCTask` 对象约 500 字节（含描述、标签数组、多个日期字段等）：

| 结构 | 估算大小 |
|------|----------|
| `TaskRepository.taskCache` Map | ~5 MB（主存储） |
| `TaskRepository.fileIndex` Map | ~0.5 MB |
| `TaskStore.cachedTasks` 数组 | ~5 MB（引用数组） |
| 各视图过滤后的临时数组 | 取决于视图，每个 ~0.1-2 MB |
| 总计（所有视图激活） | 约 **15-25 MB** |

考虑到 Obsidian 本身的内存占用（通常 500MB-2GB），这个量级在 10,000 任务规模下尚可接受，但需要注意的是 `cachedTasks` 数组每次重建都是一次完整的引用复制。

---

## 五、量化评估

| 场景 | 10,000 任务 / 1,000 文件 | 1,000 任务 / 100 文件 |
|------|--------------------------|----------------------|
| 插件启动扫描 | 20 批次，预估 2-5 秒 | 2 批次，预估 0.2-0.5 秒 |
| 单文件修改（含 500 任务） | 500 次 EventBus emit | 同左（取决于文件任务数） |
| `getAllTasks()` 重建 | ~1-2ms（Map→Array） | ~0.1-0.2ms |
| 视图过滤 + 排序 | ~5-10ms（O(N log N)） | ~0.5-1ms |
| 编辑后到视图更新 | ~125ms（50ms+75ms 防抖） | 相同 |
| 拖放操作 | ~1-5ms（全量查找源任务） | ~0.1-0.5ms |

**核心结论**：在 1,000 任务以下，当前架构的性能完全可以接受。问题从 5,000+ 任务开始显现，主要表现为：
1. EventBus 事件洪流（瓶颈2）
2. 各视图重复过滤排序（瓶颈5）
3. 没有按日期索引导致每次都要全量扫描

---

## 六、优化方向建议（仅供讨论，非实施方案）

1. **TaskStore 暴露按日期/范围的查询接口**：利用 `TaskRepository.getTasksByDateRange()` 和 `fileIndex` 的 O(1) 查找能力，避免将所有任务传递给不需要它们的视图。

2. **文件修改时做字段级 diff**：将 `detectChangesByIds` 替换为 `detectChanges`（已存在但未使用），只对实际变化的字段发射 `updated` 事件。

3. **引入按日期的二级索引**：在 TaskRepository 中维护 `dateIndex: Map<number, Set<string>>`（时间戳→taskId 集合），类似现有的 `fileIndex`，使日期查询从 O(N) 降为 O(1)。

4. **视图层共享过滤结果**：对于相同筛选条件（如月视图和侧边栏 Timeline 都需要今天任务），可以引入一个短生命周期的请求级缓存。

5. **飞书同步复用 TaskRepository**：`FeishuTaskSync.fetchObsidianTasks()` 改为通过 `TaskRepository.getAllTasks()` 获取本地任务，避免重复解析。

6. **持久化解析缓存**：将扫描结果缓存到文件，启动时优先从缓存加载，仅重新扫描修改过的文件。

---

## 七、关键文件索引

| 文件 | 核心职责 |
|------|----------|
| `src/TaskStore.ts:49-50,177-200,257-274` | L1 缓存、getAllTasks、invalidateCache、防抖通知 |
| `src/data-layer/TaskRepository.ts:32-33,56-89,161-188` | L2 缓存、fileIndex、getAllTasks、handleSourceChanges |
| `src/data-layer/MarkdownDataSource.ts:60-71,86-106,199-241,267-306,548-596` | L3 缓存、scanAllFiles、文件监听、detectChangesByIds |
| `src/data-layer/EventBus.ts:23,47` | 发布订阅事件系统 |
| `src/tasks/taskParser/main.ts:51` | 4 步任务解析管道 |
| `src/views/MonthView.ts:113,170,281` | 月视图多次调用示例 |
| `src/views/GanttView.ts:158,238,424` | 甘特图调用与增量判断 |
| `src/data-layer/feishu-sync/FeishuTaskSync.ts` | 独立同步引擎（绕过 TaskStore） |
| `src/data-layer/sync/syncManager.ts` | 多源同步编排 |
