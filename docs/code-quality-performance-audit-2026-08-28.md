# 代码质量审查与性能评估报告

**日期**: 2026-08-28
**范围**: 156 个源文件，约 35,000 行 TypeScript/TSX
**基线**: tsc 通过、312 测试全绿、lint 0 error
**场景**: 2322 任务 vault

---

## 综合评分

| 维度 | 得分 | 一句话评语 |
|------|------|-----------|
| 代码质量 | **7.5/10** | 零 any、错误隔离好；死代码 ~10 处未清 |
| 安全 | **8.5/10** | 无 XSS 面（零 innerHTML + 协议白名单） |
| 内存泄漏 | **8.5/10** | 监听器/定时器清理纪律优秀 |
| 数据延迟 | **6/10** | 快速路径只覆盖 Week/Day，Month/Gantt/勾选 ~150ms |
| 视图刷新 | **7/10** | 双订阅者去重正确；侧栏内联 onClick 一处破口 |
| 缓存一致性 | **8/10** | 三层同步与 rename 修复到位 |
| 缓存命中率 | **7/10** | L1/L3 设计好；ID 绑行号导致行漂移时全换血 |
| 性能(2322任务) | **4.5/10** | 甘特 40K 节点无虚拟化、增量路径 O(n×subtree) |
| **综合** | **7.0/10** | 工程纪律优于平均；性能短板集中且可定点拆除 |

---

## 1. 关键性能场景（2322 任务，中端桌面）

| 场景 | 当前预估 | 主导因素 |
|------|---------|---------|
| 启动→首屏数据就绪 | 0.3–1s | 全库分批扫描 |
| 首次打开甘特视图 | **1.5–4s** | ~40,000 DOM 节点全量构建，无虚拟化 |
| 甘特拖拽(视觉) | 即时 | SVG 乐观更新 |
| 甘特拖拽→其他视图同步 | **150–200ms** | 双防抖 + 无快速路径 |
| 勾选完成→卡片变色 | 130–180ms | 同上 |
| 文件中部回车一行 | **0.5–4s** | 行号漂移→ID 全换→全量重绘+卡片重挂 |
| 侧栏打开时保存文件 | **200–600ms** | TaskListPanel memo 失效全量重渲 |

---

## 2. P0 — 直接对应用户卡顿

### 2.1 任务 ID 与行号耦合（影响面最广）
- `generateTaskId`(MarkdownDataSource.ts:36) 和 `taskKey`(ui/utils/taskKey.ts:18) 都用 `filePath:lineNumber`
- 文件上方插一行 → 下方所有任务行号+1 → 全部 ID 失效 → deleted+created
- 后果：L2 缓存大换血、React key 全变（TaskCard 卸载重挂）、甘特全量重绘
- **修复**：ID 改为内容哈希或稳定 GUID

### 2.2 甘特无虚拟化（最重 DOM 场景）
- 行高 40px 固定(svgGanttRenderer.ts:68)但全量渲染所有行
- 2322 任务 → 任务列表 ~23,000 节点(含 foreignObject) + 甘特 ~17,000 SVG 节点
- **修复**：按 scrollTop 只渲染可视行 ±10，DOM 从 40K → <1.5K

### 2.3 侧栏 memo 破口 + 无虚拟化
- `TaskListPanel.tsx:441-443` 内联 `onClick={() => {...}}` 使 TaskCard memo 完全失效
- 2322 条时每次数据更新侧栏全部卡片重跑 render 函数体
- **修复**：onClick 改为 useCallback 按 taskId 分发 + 列表虚拟化

---

## 3. P1 — 明显体感

### 3.1 写回快速路径覆盖不全
- WeekView/DayView 已接入 `refreshFile`（跳过防抖，~10-40ms）
- **缺失**：MonthView `handleDayDrop`(MonthView.tsx:130)、GanttView `handleDateChange`、TaskCard 勾选
- 这三处仍走 130ms+ 的防抖回流

### 3.2 processFileModification 无 catch
- `MarkdownDataSource.ts:264-306` 只有 try/finally 无 catch
- `vault.read` 或解析抛错时变成 unhandled rejection
- 该文件缓存不更新且用户无感知

### 3.3 选择器未转义
- `svgGanttRenderer.ts:1377,1384,1444,1450` 用模板拼接 task.id
- 路径含 `"` 或 `\` 时 querySelector 抛 SyntaxError

### 3.4 增量更新 O(n×subtree)
- `updateTaskListIncremental`(svgGanttRenderer.ts:1383-1409) 对 allTasks 全量 forEach
- 每任务 1-3 次 querySelector 在 ~23K 节点子树中扫描 → ~100-400ms/次

---

## 4. P2 — 技术债务

### 4.1 死代码（~10 处）
| 位置 | 内容 |
|------|------|
| TaskStore.ts:331 | `notifyNow()` 零调用 |
| MarkdownDataSource.ts:661 | `updateFileCache()` 遗留 |
| MarkdownDataSource.ts:757 | `detectChanges()` 已被指纹 diff 取代 |
| TaskRepository.ts:69 | `getTasksByDateRange/getTasksByFilePath` 零调用 |
| taskDragController.ts:39,83 | `require()` 解构后未使用 |

### 4.2 代码重复
- `addSvgClass` 两份（svgGanttRenderer.ts:36 与 gridRenderer.ts:13）
- 行高亮清除/恢复逻辑逐字重复两遍（~60 行）
- Tooltip 两套系统（命令式单例 + 声明式 React）
- 日期格式化 `formatDate` 手写版两处

### 4.3 类型安全
- `as unknown as` 共 40 处（高风险 1 处：TaskStore.ts:320 穿透 private 方法）
- 非空断言 `!` 约 14 处（多数安全）

### 4.4 安全加固项
- `linkRenderer.ts:77` `href='javascript:void(0)'` 反模式
- `linkRenderer.ts:93-104` markdown 链接先创建后校验
- 凭据明文存储 data.json（插件生态惯例但需告知）

---

## 5. 修复优先级

| 优先级 | 任务 | 预期效果 |
|--------|------|---------|
| **P0-1** | 任务 ID 与行号解耦 | 最坏场景从秒级拉回百毫秒级 |
| **P0-2** | 甘特任务列表虚拟化 | 首开 1.5-4s → <300ms |
| **P0-3** | 侧栏虚拟化 + memo 修复 | 侧栏刷新 200-600ms → <50ms |
| **P1-1** | 统一写回快速路径（Month/Gantt/勾选） | 消除 150ms 回流 |
| **P1-2** | processFileModification 补 catch + CSS.escape | 防止静默失败 |
| **P1-3** | 增量更新去掉全行遍历 | 增量刷新 <50ms |
| **P2** | 死代码清理、代码去重、Tooltip 收敛 | 可维护性提升 |
