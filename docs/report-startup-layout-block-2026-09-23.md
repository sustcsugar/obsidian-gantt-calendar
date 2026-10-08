# 启动期「Workspace → Layout → Load layout ≈ 10s」根因分析

**日期**: 2026-09-23
**范围**: Obsidian 1.13.7（安装器 1.11.7）启动；工作区中存在 Gantt Calendar 主区域视图（v1.6.2）
**参照环境**: Fedora 44 / 内核 7.2.5，库 399 文件，21 个社区插件，总启动 12,048ms
**模式**: 只读研究（未修改仓库任何代码；压测产物全部落在系统临时目录）
> **✅ 落地记录（2026-09-29）**：P0 与 P0'' 已实现——
> ① `GCMainView`/`GCSidebarView` 的 `onOpen` 不再 `await whenReady()`，改为「骨架先行（`tasksReady=false` 渲染 `CalendarSkeleton`）→ 订阅先行 → `whenReady().then(setTasks)` 后推数据」，循环依赖就此打断；
> ② `TaskStore` 初始化失败时 reject 门闩，`whenReady()` 不再永久挂起，视图以空任务集解除骨架；
> ③ 新增 4 个测试文件（8 用例）覆盖 store 标志、视图非阻塞、失败兜底与 App 骨架门控。
> P1（消除 `refreshCalendarViews()` 造成的二次渲染）与 P2 尚未实施。
**置信标注**: `[已验证]` = 代码或官方 `.d.ts` 可直接证明；`[实测]` = 本机对真实 vault 的压测数据；`[待确认]` = 需一条运行时日志才能判定

---

## 0. 结论摘要（TL;DR）

> **⚠️ 2026-09-23 结论修正（v2）**：拿到运行时数据后，v1 的核心论断「首扫耗时被记入 layout」**被证伪**——插件全库首扫实测只有 **990.90ms**（2224 个文件 / 2410 个任务）。`await whenReady()` 的等待上限因此也只有约 1 秒，**它解释不了 10,040ms**。10 秒的真正位置见 §2.6 的「区间 A / 区间 B」。以下摘要已按实测重写。

**一句话根因（v2）**：`main.ts` 把全库首扫钉在 `onLayoutReady` **之后**才启动，而 `GCMainView.onOpen()` 又必须 `await` 这次首扫——两者叠加成**一个循环依赖**：

```
        layout 恢复  ──需要等──▶  该视图的 onOpen
              ▲                        │
              │                        ▼
   onLayoutReady  ◀──需要等──  whenReady() ◀──等── 全库首扫
```

扫描本身只要 1 秒，但这个环把等待放大到约 10 秒（`10,040ms` 近乎整十秒，**很像一个超时的形状**）。**打断环上任意一处**——让 `onOpen` 不等数据，或让首扫不再依赖 `onLayoutReady`——都能立即解除阻塞。

六个关键事实：

| # | 事实 | 位置 | 性质 |
|---|------|------|------|
| 1 | **插件全库首扫实测 990.90ms**（2224 文件 / 2410 任务），其中 repository 处理 135.80ms、缓存重建 0.60ms | 港哥提供的运行时日志 | [已验证] |
| 2 | 因此 `await whenReady()` 的等待上限只有 ~1s，**扫描不是 10 秒的原因** | 同上 | [已验证] |
| 3 | `onOpen()` 等的那次首扫被钉在 `onLayoutReady` 之后的 `setTimeout(0)`；而 layout 恢复又在等这个视图 | `main.ts:227-248`、`GCMainView.ts:43-47` | [已验证] |
| 4 | 官方 `Defer views.md`：v1.7.2+ 所有视图先建为 `DeferredView`，**只有 tab 被选中（可见）才升级为真实 View** → 主区域活动 tab 必被立即加载，**插件无法声明"可延迟"** | 官方文档 | [已验证] |
| 5 | 首屏渲染至少做**两遍**：`onOpen` 里 `mountReact` 一遍；首扫结束后 `refreshCalendarViews()` → `settingsVersion++` → `key` 变化 → `AnimatePresence(mode="wait")` 卸载重挂又一遍 | `App.tsx:62-72`、`main.ts:240` | [已验证] |
| 6 | `defaultView = "week"`（实测 `data.json`），2410 个任务全量参与 `buildWeekTimelineModel` 与两轮排序 | `data.json`、`WeekView.tsx:63-80` | [已验证] |
| 7 | 排除项：解析 75.9ms、年视图日历（含农历）7.2ms；IO 冷读 2518ms vs 热读 197ms（**12.7×**），且 **89.6%** 的文件都要读 | 本机压测 | [实测] |

**用户报告里「此时视图甚至还没显示出来」的观察依然准确**——但原因不是"在扫描"（那只有 1 秒），而是视图卡在循环等待与随后的首屏渲染上。

---

## 1. 完整证据链

### 1.1 视图把「加载完成」押在全库扫描上

`src/GCMainView.ts:43-67`：

```ts
async onOpen(): Promise<void> {
	// 等待任务缓存准备完成
	if (this.plugin?.taskCache?.whenReady) {
		await this.plugin.taskCache.whenReady();      // ← 关键：第一个 await
	}
	...
	mountReact(this.contentEl, ...);                  // ← 直到扫描完成才执行
```

`src/GCSidebarView.ts:42-46` 是同一份逻辑（侧栏视图同样受影响，与用户观察一致）。

`whenReady()` 的实现 `src/TaskStore.ts:126-128` 与 `src/TaskStore.ts:211-214`：

```ts
async whenReady(): Promise<void> {
	await this.initPromise;          // 门闩
}

// initializeInternal 末尾
this.isInitialized = true;
this.initResolve?.();              // 只有全库扫描走完才放行
```

`initPromise` 在 `TaskStore` 构造时创建（`TaskStore.ts:68` → `createInitGate()`，`:131-135`），**只有** `initializeInternal` 成功跑完才会 resolve。

**因此 `onOpen()` 返回的 Promise，其 resolve 时刻 = 全库首扫结束时刻。** [已验证]

### 1.2 Obsidian 确实会等 `onOpen`，而且不会帮我们延迟这个视图

`node_modules/obsidian/obsidian.d.ts` 两处直接证据：

```ts
// :4529（View 基类）
onOpen(): Promise<void> | void;

// :7639（ItemView）
protected onOpen(): Promise<void>;
```

返回值类型允许 Promise，Obsidian 的加载流程会等待它。

延迟机制是 Obsidian 单方面决定的（:8273-8285）：

```ts
/**
 * Returns true if this leaf is currently deferred because it is in the background.
 * A deferred leaf will have a DeferredView as its view, instead of the View that
 * it should normally have for its type (like MarkdownView for the `markdown` type).
 * @since 1.7.2
 */
get isDeferred(): boolean;

/**
 * If this view is currently deferred, load it and await that it has fully loaded.
 */
loadIfDeferred(): Promise<void>;
```

以及 `revealLeaf` 的注释（:8025）：

> `await this function to ensure your view has been fully loaded and is not deferred.`

三条推论 [已验证]：

1. **`DeferredView` 是 Obsidian 内部的占位视图，不是插件可实现的接口**——插件没有 API 去说「请把我延迟」。判定权完全在 Obsidian 手里，标准是「这个 leaf 是不是在后台」。
2. 用户日志里的 **「12 个标签，10 个延迟」** 正是这个机制：10 个后台标签被换上 `DeferredView` 跳过加载，剩下 2 个（主区域活动视图 + 被 `activateSidebarView` 打开的侧栏）必须真实加载。
3. **只要 Gantt 视图在主区域处于活动/可见状态，它就一定会被立即完整加载**——这正是用户「把它移走或禁用插件就恢复正常」的原因。

### 1.3 首扫的起跑时刻被钉在 `onLayoutReady` 之后

`main.ts:227-248`：

```ts
private scheduleTaskCacheInit(): void {
	this.app.workspace.onLayoutReady(() => {
		this.initTimeout = window.setTimeout(() => {
			this.initTimeout = null;
			this.taskCache.initialize(                       // ← 全库首扫在此才开始
				this.settings.globalTaskFilter,
				this.settings.enabledTaskFormats
			).then(async () => { ... })
		}, 0);
	});
}
```

而 `onload` 里只有两行相关（`main.ts:76-77`）：

```ts
this.taskCache = new TaskStore(this.app);
this.scheduleTaskCacheInit();        // 只是"登记"，并未开始扫描
```

**把 1.1 和 1.3 拼起来，启动期的实际时序是：**

```
layout 恢复开始
   │
   ├─ 创建 GCMainView leaf（主区域活动标签 → 非 deferred）
   │     └─ onOpen() 被调用 → await whenReady() → 挂起
   │
   ├─ 10 个后台 leaf 被 DeferredView 跳过（几乎不耗时）
   │
   ├─ onLayoutReady 触发
   │     └─ setTimeout(0) → taskCache.initialize() 全库扫描开始
   │
   ├─ 扫描进行中 ……（GCMainView.onOpen 的 Promise 一直未 resolve）
   │
   └─ 扫描完成 → initResolve() → onOpen 继续 → mountReact → layout 恢复结束
                                                        ↑
                                        "Load layout" 的计时到这里才停
```

**关键点：这里存在循环依赖，而它的性质取决于 `onLayoutReady` 的触发时机。**

- 若 `onLayoutReady` **早于**「等待视图 onOpen」触发 → 扫描能启动，`onOpen` 的等待 ≈ 扫描耗时（**实测仅 990.90ms**，见 §2.6）；
- 若「等待视图 onOpen」**早于** `onLayoutReady` → 就是**真死锁**，只能靠超时解开。

v1 曾断言「这不是死锁」，但拿到 `990.90ms` 的实测后，这个解释不再成立——**0.99 秒解释不了 10 秒**。所以必须承认：**大概率是后者，即靠超时解开**（`10,040ms` 那个近乎整十秒的形状支持这一点）。

无论落在哪种，用户的时间分解都要重新解释：

- 「库 (399 个文件): 127ms」→ 那是 Obsidian 自己的 vault 索引，**不是**插件的扫描；
- 「社区插件 (21 个): 1,346ms」→ 那是 21 个插件的 `onload`，插件的扫描**不在**这一项里（被 `onLayoutReady` 推后了）；
- 「布局: 10,040ms」→ 这段与插件的 CPU 工作量基本无关（扫描只占 0.99s），而是**等待环 + 首屏渲染**占据的墙钟时间。 [机制已验证 / 区间归属见 §2.6]

---

## 2. 那 10 秒到底花在哪个计算上？

### 2.1 本机压测：解析与农历已被排除 [实测]

我在本机对**真实 vault**（沿用插件自身的打包产物，劫持 `obsidian` 模块，未修改仓库）跑了首扫的两大 CPU 环节：

| 指标 | 数值 |
|---|---|
| 扫描文件数 | 2,245 个 `.md` |
| 总体积 / 总行数 | 6.91 MB / 181,984 行 |
| 识别出的任务数 | **6,556 个** |
| **纯文件读取**（顺序读全部内容） | **2,518 ms** |
| **任务解析**（`parseTasksFromListItems` 全量） | **75.9 ms** |
| **年视图 12 个月日历**（含农历/节气，504 天） | **7.2 ms** |

结论 [实测]：

- **解析不是瓶颈**。6,556 个任务只用 76ms —— 正则、`extractTicktick`、日期解析都很干净（`RegularExpressions.ts` 通读未见灾难性回溯模式；`recurrenceCalculator.ts:278` 的 `while (count < maxCount)` 有硬上界，不会失控）。
- **农历不是瓶颈**。`calendarGenerator.ts` 里对每天调了两次农历转换（`:52/:59`、`:68/:75`，`solarToLunar` + `getShortLunarText` 各一次，可以合并成一次），但 504 天合计仅 7.2ms，属"可以顺手优化、但不值得为启动性能动刀"的量级。
- **IO 是唯一的实质成本**。2245 个文件顺序读 2.5s ≈ **1.12 ms/文件**。

按此口径，用户的 399 文件库若体积相当，读取应在**数百毫秒**量级——与观察到的 10 秒差一个数量级。

### 2.2 两个待判定分叉（需要一条日志）

| 分叉 | 含义 | 若成立，优化方向 |
|---|---|---|
| **A. 扫描本身在这台机器上真的花了 ~10s** | IO 被放大：vault 位于网络盘/加密盘/Flatpak 沙箱路径；或存在个别超大 `.md`；或与 Obsidian 启动期的后台全库索引争抢 IO | IO 层：`cachedRead`、并发度、跳过策略 |
| **B. 扫描只要 < 1s，10s 主要是"等待与调度"** | `onOpen` 的 `await` 把扫描 + 事件瀑布 + React 首挂载串成一条链，而启动期主线程被其他插件/CSS/索引占满，使每一段异步步骤都被反复推迟 | 调度层：**§4 的 P0 解耦** |

**一次性判定方法**（插件自带埋点，无需改代码）：开启 `enableDebugMode`，重启后看控制台这三条 `Logger.stats`：

```
[GanttCalendar][MarkdownDataSource] Scanning N markdown files
[GanttCalendar][MarkdownDataSource] initialize() completed in Xms   ← 扫描真实耗时
[GanttCalendar][TaskStore] Initial scan completed in Xms
```

`X ≈ 10000` → 走 A；`X ≪ 1000` → 走 B。
（注：`Logger.debug` 默认关闭，`Logger.stats` 恒定输出，`logger.ts:49-51`。）

**另一个必须问清的问题**：移除视图后，**总启动时间**是否真的从 12,048ms 降下来了？
如果只有 `Load layout` 那一项变正常、总时间仍约 12s，说明扫描照样在跑（只是不再被计入布局），问题性质就是"账目搬家"；如果总时间真的降到 2s 左右，则说明扫描的耗时与被 `await` 强相关，指向分叉 B。**这个差别直接决定 §4 该做 P0 还是 P0'。**

### 2.3 第二轮实测：IO 的真实成本由「缓存状态 + 竞争」决定，而非文件数 [实测]

第一轮压测（§2.1）测得「读全部 2245 个文件 = 2518ms」。**紧接着用同一份数据重跑，只要 197ms。**

| 轮次 / 阶段 | 耗时 |
|---|---|
| 冷缓存（首次读）· 读全部 2245 个 md | **2,518 ms** |
| 热缓存（立即重跑）· 读全部 2245 个 md | **197 ms** |
| 热缓存 · 只读「含列表项」的 2012 个文件 | 158.6 ms |
| 热缓存 · 完整首扫（读 + 解析 + 40 次批间让出） | 574.6 ms |

**同一份工作，冷热之间差 12.7×。** 结合港哥运行时日志确认的规模（本机 vault：2224 个 md / 45 批 / 2410 个任务 / `globalTaskFilter: '🎯 '`），可以给出这次启动卡顿的完整解释：

1. 插件实际要读 **89.6%** 的文件（2012/2245 都含列表项），即近乎整个库——`parseFileForScan` 的 listItems 前置过滤（`MarkdownDataSource.ts:464-469`）**几乎没有起到减负作用**；
2. 这件事被安排在 `onLayoutReady` 之后的 `setTimeout(0)`（`main.ts:233`），而 Obsidian 自己的 vault / metadataCache 索引在此时**仍在后台进行**；
3. **两者同时读同一批文件 → 冷缓存 + 磁盘队列竞争**，每次 `read` 的实际延迟被放大一个数量级；
4. `Load layout` 的计时器正挂在 `await whenReady()` 上，于是这段被放大的 IO 时间**原样计入布局耗时**。

**⚠️ 但真正的运行时数据终结了这个方向**：`MarkdownDataSource initialize() completed in 988.90ms`。也就是说——**即使把冷缓存和 CPU 竞争全部算进去，插件首扫也只有 0.99 秒**。冷/热 12.7× 的差异只决定它落在哪个数量级，而无论落在哪，都远够不到 10 秒。

→ **§2.2 的分叉判定：A（IO 被放大）排除，B（等待与调度）成立。** 10 秒的位置见 §2.6。

**顺带澄清用户那句推断**：「库 (399 个文件) 只要 127ms，所以不是 I/O 问题」——**方向对，理由不对**。127ms 是 Obsidian 自己的 vault 索引（热缓存下的轻量扫描，且不阻塞启动），它**不是**插件读取成本的替代测量。插件的真实首扫成本是 0.99 秒（含冷读与竞争）。

### 2.4 日志的观测者效应（必须先排除）

港哥日志里出现了 2410 条 `[TaskStore] Event: task:created from ...`——说明抓日志时 `enableDebugMode` 已开启。这些来自 `Logger.debug`（`logger.ts:56-60`）的逐任务 `console.debug`：

- devtools 打开时，每条 console 输出都要跨进程序列化 + IPC 到 devtools 前端；
- 2410 条落在**同一次同步循环**里（`TaskRepository.ts:175-189` 的 for 循环内逐条 emit，且 `handleSourceChanges` 内部没有 await 让出），等于在启动最繁忙的时刻额外压上几千次 console IPC；
- 每条之间还夹着 `invalidateCache()` 和一次「clearTimeout + setTimeout」（`TaskStore.ts:96-102`、`:363-370`）。

**结论：开着 `enableDebugMode`（尤其 devtools 可见）测出的启动耗时不能代表正常模式**，它自己就可能贡献 1-3 秒。后续所有计时都必须**关掉 debug 后再测一次**。

### 2.5 运行时实测结果（已拿到）

港哥提供的日志给出了决定性的三条：

```
[TaskRepository]     Changes processed in 135.80ms
[MarkdownDataSource] initialize() completed in 988.90ms     ← 全库首扫（读 + 解析）
[TaskStore]          Cache rebuilt in 0.60ms (2410 tasks)
[TaskStore]          Initial scan completed in 990.90ms {totalFiles: 2224, tasksFound: 2410, dataSources: 1}
```

| 环节 | 实测 |
|---|---|
| 全库首扫（2224 个文件 → 2410 个任务） | **988.90 ms** |
| 其中 repository 处理 2410 个任务 | 135.80 ms |
| 缓存重建 | 0.60 ms |

**注意这还是开着 `enableDebugMode`（2410 条 console 输出）测出来的**，正常模式只会更快。**结论：插件全库首扫 ≈ 1 秒 → 分叉 A 排除。**

### 2.6 10 秒的真正位置：区间 A / 区间 B

`990.90ms` 这个数字把 `10,040ms` 切成两个必须分别解释的区间：

| 区间 | 范围 | 区间内容 | 嫌疑 |
|---|---|---|---|
| **A** | `onOpen` 被调用 → `initialize()` 真正开始 | "等待被调度"的真空 | **循环依赖 / 超时**（主嫌疑） |
| **B** | `onOpen` resolve → layout 计时结束 | `setTasks` + `mountReact` + React 首屏渲染；以及首扫结束后的二次渲染 | 渲染成本 + 调度 |

**区间 A 的机制**：`main.ts:227-248` 把 `initialize()` 钉在 `onLayoutReady` 的 `setTimeout(0)` 里，而 `GCMainView.ts:43-47` 的 `onOpen()` 又 `await` 这次 `initialize()` 的完成。结合 §0 表格第 4 条（主区域活动 tab 必然被立即加载），形成闭环：

```
layout 恢复 → 等视图 onOpen → 等 whenReady → 等 initialize → 等 onLayoutReady → 等 layout 恢复
```

**扫描只要 1 秒，这个环却让等待变成约 10 秒**——`10,040ms` 的整十秒形状强烈提示**这是超时**。

**区间 B 的机制（两遍首屏渲染 + 全量数据参与建模）**：

1. **第一遍**：`onOpen` 里先 `setTasks(2410 个任务)`、再 `mountReact`（`GCMainView.ts:55-67`）→ `App.tsx` 渲染 `WeekView`；
2. **第二遍**：首扫结束 → `main.ts:240` 的 `refreshCalendarViews()` → `bumpSettings()` → `settingsVersion++` → `App.tsx:63` 的 `` key={`${viewType}-${settingsVersion}`} `` 变化 → `AnimatePresence mode="wait"` 先播 exit 动画、再重挂整个视图 → **完整渲染第二次**；
3. 两遍都建立在**全量 2410 个任务**上：`WeekView.tsx:63-80` 依次跑 `applyStatusFilter` → `applyTagFilter` → `applySort` → `sortTasks` → `buildWeekTimelineModel`，每步都是 O(N)，但目标只是"本周"那几条任务。

### 2.7 判别实验（只需一条时间戳）

在 devtools 里看 `[GanttCalendar][TaskStore] ===== Starting initialization =====` 这条日志出现的**时间戳**：

- **~1s 出现** → 区间 A 不存在 → 10 秒在区间 B（渲染）或 Obsidian 侧 → 做 P0（骨架先行）+ 消除二次渲染；
- **~10s 才出现** → 区间 A 成立（循环依赖/超时）→ **P0 解耦一击即除**。

---

## 3. 同一路径上顺带发现的缺陷

按严重度排序，都与这条启动路径直接相关：

### 3.1 `whenReady()` 无超时兜底——初始化失败会导致视图永久挂起 [已验证]

`main.ts:242-245`：

```ts
}).catch(error => {
	Logger.error('Main', 'Failed to initialize task cache:', error);
	new Notice('任务缓存初始化失败');
});
```

catch 里**只打日志和弹提示，没有调用 `initResolve`**。一旦 `initialize` 抛异常（或 `initializeInternal` 在 `retryCount` 用尽后仍未拿到文件），`initPromise` 永不 resolve：

- `GCMainView.onOpen()` 永久挂起 → 视图永远空白；
- 若该 leaf 是主区域活动视图，Obsidian 的布局加载也永远等不到它。

`TaskStore.ts:286-299` 的 `clear()` 会 `createInitGate()` 重新开门闩，但**旧的那批 `whenReady()` 等待者已经永久失联**（旧 promise 无人 resolve）——插件卸载/重载路径上会踩到。

建议：在 `initializeInternal` 的失败分支显式 `initResolve?.()`，或让 `whenReady()` 走 `Promise.race([initPromise, timeout])`。

### 3.2 扫描期逐任务发事件 → O(N) 定时器 churn [已验证]

`TaskRepository.ts:175-189` 对 `created` 数组**逐个任务** `eventBus.emit('task:created')`：

```ts
for (const task of changes.created) {
	...
	this.eventBus.emit('task:created', { task });
}
```

而 `TaskStore.ts:96-102` 的监听器每次都执行：

```ts
this.invalidateCache();
this.notifyListenersDebounced(filePath);   // 内部 clearTimeout + setTimeout
```

6,556 个任务 = 6,556 次 `invalidateCache()` + 6,556 次「清一个定时器、建一个定时器」（`TaskStore.ts:363-370`）。单次开销小，但在启动期是整段的定时器 churn，且这正是被 §1.3 钉在最繁忙窗口里的那段代码。首扫本可以走"批量提交"路径而不是逐条 emit。

### 3.3 `pruneTagFilters` 每次都重建标签数组 [已验证]

`calendarStore.ts:113-117`：

```ts
const kept = tag.selectedTags.filter((sel) => {
	const s = sel.toLowerCase();
	if (tagSet.has(s)) return true;
	return Array.from(tagSet).some((t) => t.startsWith(s + '/'));   // 每次重建数组
});
```

复杂度 O(scope 数 × selectedTags × tagSet)，且 `Array.from(tagSet)` 在**每个** `selectedTag` 上重复构建。`setTasks`（`:152`）与 `notifyTasksUpdated`（`:138`）都会调它，启动期至少各一次。标签多的时候是明确的浪费。

### 3.4 批次间 `setTimeout(0)` 把扫描切成 8 段 [已验证]

`MarkdownDataSource.ts:394-396`：

```ts
if (batchIndex < batches.length - 1) {
	await new Promise(resolve => window.setTimeout(resolve, 0));
}
```

让出主线程本身是好意（避免长任务），但在"被 `await` 的启动窗口"里，每次让出都可能被主线程上其他启动任务推迟——把一个连续任务拆成了 **44 个**互相不相邻的碎片（实测日志：`Processing in 45 batches of 50 files`）。当前实测下这部分总成本有限（首扫整体 0.99s），但在窗口期把它拆碎只会放大调度不确定性。

### 3.5 首屏让全量任务参与建模与排序 [已验证]

`WeekView.tsx:63-80`：`scoped` 与 `combined` 都是从**全部 2410 个任务**出发的，依次经过 `applyStatusFilter` → `applyTagFilter` → `applySort` → `sortTasks` → `generateVirtualInstances` → `buildWeekTimelineModel`。而 `WeekView` 真正要展示的只是**本周**那几条。

每步都是 O(N)、实测量级也不大（§2.1 已证明解析与计算绝非瓶颈），但配合 §2.6 的"两遍渲染"，等于一次启动要跑 4 遍全量排序 + 2 遍全量建模。属于典型的"本可先按日期范围裁剪、再排序"的浪费。

---

## 4. 修复建议

### P0 · 让「视图加载完成」与「数据就绪」解耦（治本，同时打断循环依赖）

这一步同时解决两件事：① **打断 §2.6 区间 A 的循环依赖**——`onOpen` 立即返回，layout 恢复不再被这个视图拖住，`onLayoutReady` 得以按时触发、首扫随即开始；② 视图先出骨架，用户感知从"启动卡住"变成"立刻可用"。

把两个视图的 `onOpen` 改成**不 await 数据**，先挂骨架、后推数据：

```ts
async onOpen(): Promise<void> {
	// 1) 先挂载 React，onOpen 立即返回 → Layout 恢复不再被扫描拖住
	if (!this.unmountReact) {
		this.unmountReact = mountReact(this.contentEl, createElement(/* ... */));
	}

	// 2) 订阅先行，避免数据在订阅之前到达而丢失
	this.cacheUpdateListener = (filePath?: string) => {
		if (this.containerEl.isConnected) {
			useCalendarStore.getState().notifyTasksUpdated(
				this.plugin.taskCache.getAllTasks(), filePath
			);
		}
	};
	this.plugin?.taskCache?.onUpdate(this.cacheUpdateListener);

	// 3) 数据就绪后推入（不阻塞 onOpen）
	void this.plugin.taskCache?.whenReady?.().then(() => {
		useCalendarStore.getState().setTasks(this.plugin.taskCache.getAllTasks());
	});
}
```

配套：store 加一个 `tasksReady` 标志，视图在未就绪时渲染骨架/加载态（现有 `updateSeq` 机制已能驱动更新，改动面很小）。

**效果**：无论扫描要 0.5s 还是 10s，`Load layout` 都立刻结束，用户感知从「启动卡 10 秒」变成「瞬时打开 + 短暂骨架」。

### P0' · 调整首扫的起跑时机（收益取决于 §2.2 分叉）

`main.ts:233` 的 `setTimeout(0)` 让扫描正好撞上启动高峰。可选：

- 改用 `requestIdleCallback(fn, { timeout: 2000 })`（Electron 支持），把 IO 让到其他插件初始化之后；
- 或保留 `setTimeout` 但把首扫的批次间让出改为 `requestIdleCallback`，使扫描主动避让；
- 若处于分叉 A（IO 真慢），再考虑并发度调优：`vault.cachedRead`（有缓存层）替代 `vault.read`、或把 `BATCH_SIZE` 与并发上限做成按机器可调。

> ⚠️ 注意：`MARKDOWN 数据源` 的 mtime 跳过逻辑（`MarkdownDataSource.ts:377-381`）依赖 `cache` 内存态，重启后必然全量首扫，这条路暂时没有捷径。

### P1 · 消除首屏的第二次全量渲染（§2.6 区间 B）

`main.ts:240` 在首扫完成后调 `refreshCalendarViews()` → `bumpSettings()` → `settingsVersion++`，而 `App.tsx:63` 把它拼进了 `key`，导致 `AnimatePresence(mode="wait")` 把刚挂好的视图**整个卸载重挂一遍**。

而 `onOpen` 里已经 `setTasks()` 过一次（`GCMainView.ts:55`），首扫完成后的 `onUpdate` 也会推数据——**这次 bump 是多余的**。建议首扫完成时只推数据（`notifyNow()` / `setTasks()`），不再 bump `settingsVersion`；`bumpSettings` 留给真正的设置变更使用。

### P2 · 按日期范围裁剪再排序（§3.5）

`WeekView` 先把 2410 个任务全部排序/建模，再挑出本周那几条。改成先按 `weekStart` / `weekEnd` 过滤、再排序建模，可省掉绝大部分无效工作。

### P0″ · `whenReady()` 失败兜底（§3.1）

必须修——这是「永久白屏 + 布局永不结束」级别的问题，与本次性能问题同源（都在那条 `await` 链上）。

### P2 · 顺手清理

- 首扫改用批量提交，避免逐任务 emit（§3.2）；
- `pruneTagFilters` 把 `Array.from(tagSet)` 提到循环外（§3.3）；
- `calendarGenerator.ts` 每天合并成一次农历转换（`:52/:59`、`:68/:75`），省掉一半农历调用（量级小，属于代码整洁收益）。

### 不建议的做法

**不要试图用「延迟视图」绕开**。官方 `Plugins/Guides/Defer views.md` 原文：

> As of Obsidian v1.7.2, When Obsidian loads, all views are created as instances of **DeferredView**. Once a view is visible on screen (i.e. the tab is selected within its containing tab group), the `leaf` will rerender and the view will be switched out to the correct `View` instance.

判定标准是**所在 tab group 里该 tab 是否被选中**——主区域的活动 tab 必然满足这个条件，插件没有任何 API 能把这句话改成"稍后再加载"。而官方对 `loadIfDeferred()` 的警告是：

> Manually calling `loadIfDeferred`, your plugin is removing this performance optimization from the given views. Use this *sparingly*.

唯一正确的解法就是**不在 `onOpen` 里 await 重活**。

---

## 5. 还差的一条时间戳

`Xms` 已经拿到（**990.90ms**），分叉 A/B 已判定。现在只差**一条时间戳**来锁定区间 A 还是区间 B：

**在 devtools 里看 `[TaskStore] ===== Starting initialization =====` 出现的时刻**：

- **~1s 出现** → 区间 A 不存在 → 10 秒在区间 B（首屏渲染）→ 先做 P0（骨架先行）+ 消除二次渲染；
- **~10s 才出现** → 区间 A 成立（循环依赖/超时）→ **P0 解耦一击即除**。

另外请顺手确认：**这台 2224 文件的 Windows 机器上，`Load layout` 那一项是多少**——用来判断问题是否与 Fedora 那台 399 文件的机器强相关。

⚠️ 测量时请**关掉 `enableDebugMode`**（§2.4）：2410 条 console 输出自身就是秒级开销。

---

## 附录 A · 本机压测口径

- 脚本：系统临时目录（`%TEMP%\gc-bench\bench.cjs` = 解析/农历；`bench2.cjs` = IO 量与批次让出），**均未写入仓库**。
- 方法：用仓库自带 `esbuild@0.17.3` 将 `src/tasks/taskParser/main.ts` 与 `src/calendar/calendarGenerator.ts` 打包为 CJS，运行时劫持 `require('obsidian')` 为桩对象；遍历真实 vault 的 `.md`，按「行首为列表项标记」构造 `listItems`（近似 Obsidian `metadataCache.listItems`），再调用插件自身的解析函数。
- **冷/热对照**：两次运行之间未清理系统 page cache，故第一轮为冷缓存、紧随其后的第二轮为热缓存。**两轮差异（2518ms → 197ms）本身就是本次最重要的发现**——它说明 IO 成本高度依赖缓存状态与并发竞争，而非文件数。
- 规模对照：本机 vault（2245 md / 6.91MB / 181,984 行 / 空 filter 下 6556 任务）与港哥日志环境（2224 md / 45 批 / `🎯 ` filter 下 2410 任务）一致，可视为同一量级。
- 局限：`fs.readFileSync` 顺序读 ≠ Obsidian `Vault.read()` 的异步并发路径，也**无法复现「与 Obsidian 索引任务争抢磁盘队列」这一核心条件**，故读取耗时只能作为**量级参照**。这正是 §2.5 需要真实 `Xms` 的原因。

## 附录 B · 引用位置汇总

| 文件 | 行 | 作用 |
|---|---|---|
| `src/GCMainView.ts` | 43-47, 55, 59 | `onOpen` await `whenReady` → 阻塞布局 |
| `src/GCSidebarView.ts` | 42-46, 52, 56 | 同上（侧栏） |
| `src/TaskStore.ts` | 126-128 | `whenReady()` = `await initPromise` |
| `src/TaskStore.ts` | 211-214 | 扫描完成才 `initResolve()` |
| `src/TaskStore.ts` | 96-102, 363-370 | 逐任务 invalidate + 防抖定时器 churn |
| `src/TaskStore.ts` | 286-299 | `clear()` 重开门闩，旧等待者失联 |
| `main.ts` | 76-77, 227-248 | 首扫被钉在 `onLayoutReady` + `setTimeout(0)` |
| `main.ts` | 242-245 | catch 未 resolve 门闩（§3.1） |
| `src/data-layer/MarkdownDataSource.ts` | 335-404 | 批次扫描（50/批，批间让出） |
| `src/data-layer/TaskRepository.ts` | 175-189 | 逐任务 emit |
| `src/ui/store/calendarStore.ts` | 113-117, 138, 152 | `pruneTagFilters` 重复建数组 |
| `src/calendar/calendarGenerator.ts` | 52/59, 68/75 | 每天两次农历转换 |
| `node_modules/obsidian/obsidian.d.ts` | 4529, 7639 | `onOpen(): Promise<void>` |
| `node_modules/obsidian/obsidian.d.ts` | 8025, 8273-8285 | 延迟视图机制（`isDeferred`/`loadIfDeferred`） |
| 官方 `Plugins/Guides/Defer views.md` | — | 延迟加载判定标准（tab 是否被选中）；`loadIfDeferred` 性能警告 |
| 官方 `Plugins/Guides/Optimize plugin load time.md` | — | `onload` 只放注册逻辑；视图构造函数须轻量 |
| `main.ts` | 240 | 首扫结束后的 `refreshCalendarViews()` → 触发二次渲染 |
| `src/ui/App.tsx` | 62-72 | `key={viewType-settingsVersion}` + `AnimatePresence(mode="wait")` |
| `src/ui/views/WeekView.tsx` | 63-80 | 全量 2410 个任务参与排序与时间线建模 |
| `data.json` | — | `defaultView: "week"`、`enableDebugMode: true`（实测取值） |

