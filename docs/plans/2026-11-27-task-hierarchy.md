# 任务父子关系（Task Hierarchy）实现方案

> 日期：2026-11-27
> 状态：**已实施**（P0–P4，分支 `dev/task-hierarchy`）；13 项决策全部经用户确认
> 范围：数据层 + 悬浮提示面板 + 甘特图聚合；**不含**外部同步、导入导出、任务视图、拖拽建关系
> 验证：549 个 Jest 用例全过（新增 108）、tsc 通过、eslint 0 error、`npm run build` 成功；Obsidian 内手验待做

## 实施记录（与方案的差异）

1. **「父任务已被筛选隐藏」标注未在 React 视图接入**：`TooltipHierarchyContext.isVisible` 是可选参数，当前只有构造方显式传入时才标注。React 端 tooltip 拿不到「当前视图筛选后的任务集」（5 个视图各自过滤），甘特端也未接入——本轮先保证不误标，后续可在各视图把可见集合注入 store 后打开。
2. **创建模式的父子写入**：新建任务没有稳定身份，用「目标文件 + 描述 + 最大行号」定位刚追加的那一行再写 `parent`；定位失败仅提示，不影响任务创建本身。
3. **折叠 = 过滤行**：符合 §7.3 的约束；副作用是折叠切换会触发引擎全量重建（§7.4 已认账）。
4. **父行只读的落地**：checkbox `disabled` + `title` 提示；聚合行不创建左右拖拽手柄。
5. **进度填充**：底条改浅色（opacity 0.35）、进度矩形改实色后置追加，两端（全量/增量）都补了「由 0 变正时创 build 矩形」的分支。
6. **总开关**：`enableTaskHierarchy` 同时控制甘特分组与 tooltip 父子区块；关闭时甘特走原 `toGanttChartTasks`，画面与改造前一致。
7. **左列缩进对齐（2026-11-27 手验修复）**：折叠箭头只画在父行时，父行内容被「箭头 14px + 间距 8px」右推 22px，而子行只多 16px，导致父行看起来比子行更深。改为**每行都预留 14px 箭头槽位**（叶子行为 `collapse-toggle--placeholder`，`visibility: hidden`），层级缩进统一 16px/级：父行内容左缘 = 8 + 14 + 8 = 30px，一级子行 = 8 + 16 + 14 + 8 = 46px。padding 也改为单值简写 `0 8px 0 {8 + level*16}px`，去掉 `padding`/`paddingLeft` 的覆盖顺序依赖。

---

## 0. 决策摘要

| # | 决策 | 结论 |
|---|---|---|
| D1 | 关系存储 | 子任务行写 `%%[parent:: <tid>]%%`；父任务首次被引用时懒写入 `%%[tid:: xxxxxxxx]%%`；`children` 不落盘，运行时反查 |
| D2 | 层级约束 | 单父；允许跨文件；写入时检测环并拒绝；嵌套层数不限 |
| D3 | 进度语义 | 等权：已完成叶子数 / 叶子总数；父任务勾选框只读 |
| D4 | 甘特呈现 | 分组可折叠：父行聚合条 + 缩进子行；默认展开 |
| D5 | 时间聚合 | 父任务显式日期优先，缺哪侧才由子任务推导；提示面板标注「推导」 |
| D6 | 接口范围 | 只做数据层 ↔ UI 契约，不碰飞书/CalDAV/导入导出 |
| D7 | 交付 | 本文件 + `TODO.md` 登记 |
| D8 | 提示面板粒度 | 父任务 1 行 + **直接**子任务列表；超过 6 条折叠为「还有 N 个」 |
| D9 | 提示面板交互 | 只展示，不可点击 |
| D10 | 关系入口 | `TaskFormModal` 加父任务选择器（建立）+ 右键菜单「取消父子关系」（解除） |
| D11 | 甘特行序 | 父子作为整块参与现有排序，子任务紧跟父行 |
| D12 | 父勾选框 | 禁用，悬停提示「由子任务进度决定」 |
| D13 | 断链 | 当顶层显示，提示面板标红「父任务已不存在」，**不自动改文件** |
| D14 | 折叠态 | 会话内记忆（zustand），重启重置为全展开 |
| D15 | 筛选交互 | 父被筛掉、子命中 → 子提升为顶层，提示注明「父任务已被筛选隐藏」 |
| D16 | 重复任务 | 不能当父；可以当子 |
| D17 | 任务视图 | 本轮不做，维持平铺 |
| D18 | 文本位置 | 建立关系不动文本位置，只写 metadata 字段 |
| D19 | 总开关 | `enableTaskHierarchy`，默认 `true` |
| D20 | 索引策略 | 每次任务变更全量重算纯函数 O(n)；验收阈值 3000 任务 < 20ms |
| D21 | 进度徽标 | 甘特左列显示 `3/5` 形式徽标 |

---

## 1. 现状与约束（已核实）

| 事实 | 位置 | 对本方案的影响 |
|---|---|---|
| `GCTask` 无层级/进度字段，但有通用内联元数据 `metadataFields` | `src/types.ts:108-139` | 新字段零解析成本 |
| `%%[key::value]%%` 解析**无白名单**，任意 key 保留、允许重复键 | `src/utils/RegularExpressions.ts:525`、`src/tasks/taskParser/utils.ts:169` | 不需要改正则 |
| 写回只有整数组入口 `updates.metadataFields`，且**整行重建** | `src/tasks/taskUpdater.ts:223`、`src/tasks/taskSerializer.ts:117` | 需 `setMetadataField()` 辅助；写回会重排 emoji/tags |
| serializer 的 guid fallback **只在 metadataFields 为空时生效** | `src/tasks/taskSerializer.ts:207-215` | 现存 bug，见 §7.1，必须一并修 |
| 任务身份 `filePath:lineNumber`，行号漂移 | `src/data-layer/MarkdownDataSource.ts:36`、`TaskRepository.ts:27` | `tid` 必须写在行内容里才免疫 |
| 数据层有指纹 diff，指纹含 `metadataFields` JSON | `src/data-layer/MarkdownDataSource.ts:60-78` | tid/parent 变更自动触发 `task:updated`，无需新事件 |
| `getAllTasks()` 返回缓存数组本体，UI 拿同一引用 | `TaskStore.ts:246-269`、`calendarStore.ts:146`（引用相等短路） | **红线**：禁止在任务对象上挂 `children` |
| `EventBus` 非类型化，payload 靠 `as` 断言 | `src/data-layer/EventBus.ts:47`、`TaskStore.ts:105` | 不新增事件类型，避免再欠一笔债 |
| 甘特模型已有死字段 `progress` / `dependencies` | `src/gantt/types.ts:25-27` | 进度填充是「修通」而非新建 |
| adapter 进度只产 0/100 | `src/gantt/adapters/taskDataAdapter.ts:190` | 改成聚合进度注入 |
| 甘特行 y 全部内联 `index * rowHeight`（3 处） | `svgGanttRenderer.ts:807 / 1118`、`gridRenderer.ts:67` | 折叠只能靠**过滤行**，不改行几何 |
| 行高硬编码 40，无分组/折叠/缩进 | `svgGanttRenderer.ts:68` | 缩进只作用于文本列 padding |
| 新增任意一行 → 实际等价全量重绘 | `svgGanttRenderer.ts:1429-1441 / 1473-1508` | 折叠切换会重建引擎，需在方案里认账 |
| tooltip 内容单点构建、两套渲染端 | `src/components/tooltip/tooltipSections.ts:33`、`TooltipProvider.tsx:138`、`tooltipManager.ts:137` | 改 1 处内容 + 同步 2 处渲染 |
| 任务视图 tooltip 关闭 | `TaskView.config.ts:34` | 与 D17 一致 |
| 飞书无父子能力（无 parent_guid / subtask 端点） | `FeishuConstants.ts:14-29`、`FeishuTaskApi.ts:67` | D6 的依据 |
| 远程任务 `filePath` 伪造、`lineNumber=0` | `APIDataSource.ts:268-286` | 必须排除在层级外 |

测试基线：`npx jest` 270 用例（`src/data-layer/__tests__/` 等）。

---

## 2. 磁盘格式与语义

### 格式

```markdown
- [ ] 开发登录模块 %%[tid:: k3m9x2qa]%%
  - [ ] 设计接口 %%[parent:: k3m9x2qa]%%
  - [ ] 写单元测试 %%[parent:: k3m9x2qa]%%
- [ ] 另一个顶层任务
```

- **只存单向 `parent`**。`children` 通过反查索引得到，不落盘。
- 缩进只是人的排版，**解析不依赖缩进**。
- 两个保留 key：`tid`、`parent`。其余 key 语义不变。

### 规则

| 项 | 规则 | 理由 |
|---|---|---|
| tid 形态 | 8 位 `[a-z0-9]`（base36） | value 不能含 `]`；`[a-z0-9]` 最安全，且肉眼可读 |
| tid 生成 | `randomBytes` 式伪随机 + 建库时冲突检测；冲突则重生成 | 8 位 base36 ≈ 2.8e12，配合冲突检测足够 |
| 写入时机 | **懒写入**：某任务第一次被选为父时才写 `tid` | 存量库零改动 |
| 写入失败 | 父任务文件只读 / 加锁失败 → 中止整个操作并 Notice，**不写子任务**，避免半成品关系 | 原子性 |
| 单父 | 已有 `parent` 时再设父 = 覆盖（表单里显示现父 + 可更换） | 简单可预期 |
| 跨文件 | 允许 | D2 |
| 环 | `parent` 指向自身或自身子孙 → 拒绝 + Notice | D2 |
| 深度 | 不限 | D2 |
| 重复任务 | 带 `repeat` 的任务不能当父（选择器里排除）；已是父则子任务提升为顶层并注明 | D16 |
| 远程任务 | `lineNumber === 0` 或 `filePath.startsWith('api:')` 类 → 不参与层级 | 无真实行可写回 |

### 解析派生

在 `GCTask` 上新增两个**只读派生字段**（与 `feishuGuid` 同法，解析时从 metadata 派生）：

```ts
// src/types.ts
tid?: string;        // 派生自 %%[tid:: x]%%
parentTid?: string;  // 派生自 %%[parent:: x]%%
```

派生点两处（与 `feishuGuid` 同一行代码附近）：
- `src/tasks/taskParser/main.ts:99-114`（`parseTasksFromListItems`）
- `src/tasks/taskParser/main.ts:299-312`（`parseSingleTaskLine`）

---

## 3. 数据层设计

### 3.1 元数据辅助模块（新增）

`src/tasks/taskMetadata.ts`

```ts
export const HIERARCHY_KEYS = { tid: 'tid', parent: 'parent' } as const;
export const RESERVED_METADATA_KEYS = new Set(['tid', 'parent']);

/** 读取首个同名 key（大小写敏感，与解析器一致） */
export function getMetadataValue(fields: MetadataField[] | undefined, key: string): string | undefined;

/** 幂等 upsert：存在则替换首个，多余重复项删除；返回值是新数组（不可原地改） */
export function setMetadataField(fields: MetadataField[] | undefined, key: string, value: string): MetadataField[];

/** 删除全部同名 key；返回新数组 */
export function removeMetadataField(fields: MetadataField[] | undefined, key: string): MetadataField[];

/** 供 tooltip 用：从展示列表里剔除保留 key，避免 tid/parent 以原始形态露出 */
export function visibleMetadataFields(fields: MetadataField[] | undefined): MetadataField[];
```

**红线**：全部返回新数组。`GCTask` 对象数组在数据层缓存中共享，原地修改会污染缓存（见 §7.2）。

### 3.2 关系写入器（新增）

`src/tasks/taskHierarchyUpdater.ts`

```ts
export interface HierarchyWriteResult {
	tid?: string;          // 父任务最终 tid（懒写入后）
	changed: boolean;      // 是否需要刷新
}

/** 确保任务有 tid；没有则生成并写回。已存在直接返回。 */
export async function ensureTaskTid(
	app: App, task: GCTask, formats: string[]
): Promise<string>;

/** 建立/更换父子关系。内部：环检测 → ensureTaskTid(parent) → 写 child.parent */
export async function assignParent(
	app: App, child: GCTask, parent: GCTask, allTasks: GCTask[], formats: string[]
): Promise<HierarchyWriteResult>;

/** 解除父子关系（删除 parent 字段，保留 tid） */
export async function clearParent(
	app: App, child: GCTask, formats: string[]
): Promise<HierarchyWriteResult>;

/** 校验：parentTid 是 childTid 的子孙 → 拒绝 */
export function wouldCreateCycle(
	allTasks: GCTask[], childTid: string, parentTid: string
): boolean;
```

实现要点：
- 每次写入都走 `updateTaskProperties(app, task, { metadataFields: next }, formats)`，**不手写 markdown**（`CLAUDE.md` 硬约定）。
- 写 `parent` 时基于 `task.metadataFields ?? []` 做 `setMetadataField`，其余字段原样保留。
- 写 `tid` 时同理；写入后该任务对象上的 `tid` 由下一次刷新带回，不手工赋值。
- 错误处理：环/重复任务父/写锁失败 → `new Notice(i18n.t(...))`，不抛到 UI。
- 撤销：成功后在调用侧（表单/右键菜单）注册 `taskUndo.registerProperty` 语义的撤销项，撤销内容 = 原来的 `metadataFields` 数组。与现有 `setTaskStatus` 等命令保持一致（`src/contextMenu/commands/setTaskStatus.ts:18-43` 的四步范式）。

### 3.3 serializer 修复（必修）

现存两处缺陷（已静态确认，`src/tasks/taskSerializer.ts:207-215`）：

1. `updates.feishuGuid` 只在 `metadataFields` 为空时才输出 → 任务已有任意 `%%[..]%%` 时**新增 guid 被静默丢弃**。
2. 清除 guid 时 `task.metadataFields` 里仍有 guid，序列化照写 → `feishuGuid: null` **清不掉**。

修复方式（最小爆炸半径）：

```ts
// 输出 metadata 前，先按 updates.feishuGuid / task.feishuGuid 归一
let meta = updates.metadataFields ?? merged.metadataFields ?? [];
if (updates.metadataFields === null) meta = [];
if (updates.feishuGuid === null) {
	meta = removeMetadataField(meta, 'guid');
} else if (updates.feishuGuid) {
	meta = setMetadataField(meta, 'guid', updates.feishuGuid);
}
// 危险 fallback 分支删除，统一走上面的 meta 输出
```

**必须补 2 个回归用例**（当前缺陷的真实复现）：
- 任务已有 `%%[foo:: bar]%%` 时写 `feishuGuid` → 输出同时含 foo 与 guid。
- 任务已有 `%%[guid:: x]%%` 时传 `feishuGuid: null` → guid 被移除。

### 3.4 派生索引（新增，纯函数）

`src/tasks/hierarchy/taskHierarchy.ts`

```ts
export interface HierarchyNode {
	task: GCTask;
	tid: string | null;
	depth: number;
	childTids: string[];
	parentTid: string | null;
	hasChildren: boolean;
	/** 父存在但父任务不在索引里（被删除 / tid 被改） */
	orphan: boolean;
	/** 自身或祖先成环（手工编辑造成的非法数据），视为顶层并记标志 */
	cyclic: boolean;
}

export interface TaskHierarchyIndex {
	byTid: Map<string, HierarchyNode>;
	childrenOf: Map<string, string[]>;
	roots: HierarchyNode[];      // 无父 / 断链 / 环
	/** gantt / 卡片查询用：按任务行号+文件定位 */
	nodeOfTask: Map<string, HierarchyNode>;  // key = `${filePath}:${lineNumber}`
	invalid: number;             // 断链 + 环 的数量，供日志/调试
}

export function buildTaskHierarchy(tasks: GCTask[]): TaskHierarchyIndex;
```

规则：
- 无 `parentTid` → 顶层（`roots`）。
- `parentTid` 在 `byTid` 里找不到 → `orphan = true`，仍进 `roots`（D13）。
- 手工构造出环 → 检测到即 `cyclic = true`，环内第一个被访问者进 `roots`，环断开，**不抛异常、不死循环**。
- 重复任务（`task.repeat`）若被引用为父（历史数据/手工写）→ 子任务当顶层，父节点标 `invalidParent`。
- 远程任务（`lineNumber === 0`）直接跳过，不参与索引。

复杂度 O(n)，无递归深度风险（用迭代 + 访问标记；ES6 target 下避免深递归爆栈）。

### 3.5 聚合计算（新增，纯函数）

`src/tasks/hierarchy/aggregate.ts`

```ts
export interface GroupStats {
	leafTotal: number;
	leafDone: number;
	progress: number;            // 0-100 向下取整
	hasChildren: boolean;
}

/** 等权：递归到叶子计数。父任务自身 completed 在 hasChildren 时被忽略。 */
export function computeGroupStats(index: TaskHierarchyIndex, tid: string): GroupStats;

export interface AggregateDates {
	start?: Date;
	end?: Date;
	startDerived: boolean;   // true = 由子任务推导，提示面板要标注
	endDerived: boolean;
}

/** 显式优先、缺侧推导；候选日期来自叶子任务的有效日期 */
export function computeAggregateDates(
	index: TaskHierarchyIndex,
	tid: string,
	getField: (task: GCTask, field: DateFieldType) => Date | undefined,
	startField: DateFieldType,
	endField: DateFieldType
): AggregateDates;
```

语义细节（写进单测）：
- 叶子 = 无子任务的任务。
- `cancelled` 任务计入**分母**、不计入分子（与"已完成"语义分离）。
- 父任务自己勾了 `completed` 但仍有未完成子任务 → 进度仍按叶子算（D12 只读）。
- `hasChildren === false` 时 `progress` 退化为 0/100（沿用旧行为，保证无子任务时不变）。
- 日期聚合只看**叶子**的有效日期；父任务显式值覆盖对应侧。
- 一个子任务都没有有效日期 → 该侧 `undefined`（不强凑）。

### 3.6 索引的生命周期（放 store，不放视图）

`TaskHierarchyIndex` 在 `calendarStore` 里算一次，供全部视图消费：

```ts
// src/ui/store/calendarStore.ts
hierarchy: TaskHierarchyIndex | null;

// notifyTasksUpdated / setTasks 内部：
const hierarchy = buildTaskHierarchy(tasks);   // 纯函数，O(n)
```

理由：视图层全是 `useMemo` 现算、无缓存（已核实）；5 个视图各算一遍是白烧。store 里每次任务变更算一次即可，天然跟随 `updateSeq`。
`notifyTasksUpdated` 的引用相等短路（`calendarStore.ts:146`）不受影响——索引是由数组派生的新对象，不参与短路判断。

性能保护：`buildTaskHierarchy` 用一次遍历建 Map；若实测超阈值（3000 任务 20ms），再加「按 `updateSeq` 记忆化」一层，不改调用方。

---

## 4. UI：悬浮提示面板

### 4.1 内容构建（单点改造）

`src/components/tooltip/tooltipSections.ts` 扩签名（保持向后兼容，第二参可选）：

```ts
export interface TooltipHierarchyContext {
	index: TaskHierarchyIndex;
	/** 判断某任务当前是否被视图筛掉（用于 D15 的「父任务已被筛选隐藏」） */
	isVisible: (task: GCTask) => boolean;
	maxChildren?: number;   // 默认 6
}

export function buildTooltipSections(task: GCTask, hierarchy?: TooltipHierarchyContext): TooltipSection[];
```

新增两个 section，位置：**time 之后、priority 之前**（关系比优先级更结构化）：

| section key | 行 | 内容 |
|---|---|---|
| `parent` | 1 行 | label = 「父任务」；value = 父任务描述（含 `✓`/`○` 前缀）；断链 → value = 「父任务已不存在」+ 红色 valueClass；父被筛选隐藏 → 追加「（已隐藏）」 |
| `children` | 汇总 1 行 + 子任务每行 | 汇总 label = 「子任务」value = `3/5` + `60%`；子行 label = `✓`/`○`，value = 子任务描述；超过 `maxChildren` → 末尾加「还有 N 个」 |

其它调整：
- metadata section 改用 `visibleMetadataFields()`，**不再把 `tid`/`parent` 当普通元数据显示**（否则每张卡片都多两行噪音）。

### 4.2 渲染端（两处同步，不许漂移）

| 端 | 文件 | 改动 |
|---|---|---|
| React | `src/ui/components/TooltipProvider.tsx:138-191` | 新增 `parent` / `children` 两个 section 的 JSX 分支；子行复用现有 `property-row` 结构，勾选态用 `done` 修饰类 |
| 命令式 | `src/utils/tooltipManager.ts:137-207` | 同样两个分支，纯文本节点（**不加 innerHTML**，不加交互） |

上下文注入：
- React 端：`TooltipProvider` 已有插件上下文，从 `calendarStore` 取 `hierarchy` 与当前视图的可见任务集合（用于 `isVisible`）。
- 命令式端：`TooltipManager.getInstance(plugin)` 通过 `plugin` 上的新访问器 `getTooltipHierarchyContext()` 取（内部读 store），**不新增第二套数据通道**。

### 4.3 样式与类名

`src/utils/bem.ts` 的 `TooltipClasses` 增：`childItem`、`childItem--done`、`childMore`、`propertyValue--missing`。
对应 `src/styles/components/tooltip.css` 追加（颜色走现有 token/变量，不硬编码）。
子行不做点击态样式（D9）。

---

## 5. UI：甘特图

### 5.1 模型扩展

`src/gantt/types.ts` → `GanttChartTask` 增：

```ts
/** 稳定身份（来自任务行），用于跨渲染保持父子引用，不要用 gantt id 交叉引用 */
tid?: string;
/** 父行的 gantt id（仅当父行本次真的渲染时给出） */
parentId?: string;
/** 层级深度，0 = 顶层 */
level?: number;
/** 本行是否为聚合父行 */
isAggregate?: boolean;
/** 是否有（未被折叠掉的）子行 */
hasChildren?: boolean;
/** 子任务进度，"3/5" 徽标与悬浮提示用 */
childProgress?: { done: number; total: number };
/** 折叠态（决定是否画折叠箭头） */
collapsed?: boolean;
```

### 5.2 行序列构建（新函数，不改动既有排序语义）

`src/gantt/adapters/hierarchyOrder.ts`

```ts
export interface OrderOptions {
	collapsedTids: ReadonlySet<string>;
	/** 视图已筛选出来的任务集，用于 D15 */
	visibleTaskKeys: ReadonlySet<string>;
}

/** 输入：已排序的 GCTask[]；输出：按「父子整块」重排后的行序 + 层级信息 */
export function orderTasksWithHierarchy(
	sorted: GCTask[],
	index: TaskHierarchyIndex,
	opts: OrderOptions
): Array<{ task: GCTask; level: number; parentKey: string | null; hasChildren: boolean; collapsed: boolean }>;
```

算法（一次 DFS）：
1. 以 `sorted` 的**现有顺序**为准，为每个任务记 rank。
2. 顶层 = 无 `parentTid`，或 `parentTid` 不在当前 `sorted` 集合内（D15：父被筛掉/父不满足 gantt 日期条件）。
3. 按 rank 顺序遍历顶层，DFS 输出子树；同一父下的子任务也按 rank 排序。
4. `collapsedTids` 含该父的 `tid` → 不展开其子（子行完全不进结果数组，**不是 display:none**）。
5. 环保护：访问过的节点不再进入（复用 `cyclic` 标志），保证不死循环。

### 5.3 适配器改造

`src/gantt/adapters/taskDataAdapter.ts`：

- 新增 `toGanttChartTasksHierarchical(tasks, startField, endField, index, opts)`：
  - 先 `orderTasksWithHierarchy`，再逐行 `toGanttChartTask`；
  - 父行日期用 `computeAggregateDates` 的结果覆写 `start`/`end`（**显式优先**，D5）；
  - 父行 `progress` 用 `computeGroupStats().progress`（修通 `calculateProgress` 的 0/100 死路）；
  - 父行即使自身没有任何日期，只要子任务能推出 start+end，也要**能够渲染**（放宽现有「必须有 end 且 start 可解析」的早退）；
  - `parentId` 只在父行本次被渲染时填；`level`、`hasChildren`、`collapsed`、`childProgress` 直接透传。
- 保留现有 `toGanttChartTasks` 不动（开关关闭时走它，D19），保证可回退。

### 5.4 渲染侧

| 改动 | 位置 | 做法 |
|---|---|---|
| 缩进 | `svgGanttRenderer.ts:862`（content cell） | `padding-left: 8 + level * 16px`；**只影响文本列，不移动时间轴上的条**（日期对齐不能被缩进破坏） |
| 折叠箭头 | `renderTaskList`（`:785-914`） | 有子任务的行在文本前加一个 `<span>`，点击回调 `config.on_toggle_collapse?.(tid)`；类名走 `GanttClasses` |
| 进度徽标 `3/5` | 同上，文本列行尾 | 新增 `GanttClasses.elements.progressBadge`；`hasChildren` 才画 |
| 父勾选框禁用 | `:948-960`（checkbox） | `task.hasChildren` → `disabled` + `title`（i18n），不绑 `onProgressChange` |
| 聚合条样式 | `:1096-1293` | 父行条加 `isAggregate` 类：斜纹/双色描边 + 加粗；子行条维持现状 |
| 进度填充修通 | `:1177-1190` + `:1284-1287` | ① 进度 rect **后置追加**（现在被主条盖住）；② 颜色改更深而非更浅；③ 条件 `progress > 0`（含 100 时整条填充）；④ 同步 `updateTaskBarElement:1514` |
| 行斑马纹 | `gridRenderer.ts:67-80` | 折叠后行数变少，只需跟随新行数组，无需改算法 |
| 父行不响应拖拽 | `:1206-1250`（手柄） | 聚合行只读：不画左右手柄（拖父行改日期会让聚合值与子任务矛盾） |

### 5.5 折叠状态

```ts
// calendarStore
ganttCollapsedTids: string[];           // 存 tid，不存 gantt id（行号会漂移）
toggleGanttCollapsed: (tid: string) => void;
```

- 会话内有效，重启丢失（D14），**不写 data.json**。
- 折叠切换会改变行集合 → `shouldFullRefresh` 返回 true → 引擎 `destroy + build` 重建。这是已知代价（§7.4），本轮接受；用户点击折叠是低频操作。

### 5.6 GanttView 接线

`src/ui/views/GanttView.tsx`：
- `filteredTasks`（`:57-65`）保持现状；
- 新增 `visibleKeys`（筛选后任务的 `filePath:lineNumber` 集合）；
- `ganttTasks` 的 `useMemo`（`:80-82`）按 `settings.enableTaskHierarchy` 分流：开 → `toGanttChartTasksHierarchical`，关 → 原 `toGanttChartTasks`；
- `config` 增 `on_toggle_collapse`；
- `tasksSignature`（`:249`）把 `level`/`collapsed`/`progress` 纳入签名，否则折叠状态变化不会触发刷新。

---

## 6. UI：入口与设置

### 6.1 父任务选择器（新组件）

`src/ui/modals/ParentTaskSelector.tsx`，参照 `TagSelector.tsx:19-70` 的「搜索 + 列表」范式：

- 候选来源：`calendarStore` 全量任务；
- 排除：自身、自身子孙（环）、重复任务（D16）、远程任务、当前已选父；
- 行内容：描述 + `文件名:行号`；超 50 条只渲染前 50（输入过滤后再截断）；
- 空态文案：i18n。

### 6.2 TaskFormModal

`src/ui/modals/TaskFormModal.tsx`：在 `RepeatSection` 与 `TagSelector` 之间插入一节「父任务」：
- 无父：显示「选择父任务…」按钮 → 打开选择器；
- 有父：显示父任务描述 + `×` 移除（走 `clearParent`）；
- 保存时：父子变更**不放进 `TaskUpdates`**（它不是单行字段更新，涉及父任务写入），而是在 `updateTaskProperties` 成功后依次调用 `assignParent` / `clearParent`，并 refresh；
- 失败（环/写锁）→ Notice，表单保持打开。

### 6.3 右键菜单

新增 `src/contextMenu/commands/clearTaskParent.ts`（范式照 `setTaskStatus.ts:18-43`）：
- 仅在 `task.parentTid` 存在时显示；
- 执行 `clearParent` → `refreshTaskView` → 撤销注册 → Notice。

`TaskCard.tsx:124-250` 的 `menuSections` 增加一项，位置在「编辑/建笔记」之后。

### 6.4 设置项

| 文件 | 改动 |
|---|---|
| `src/settings/types.ts` | `enableTaskHierarchy: boolean` |
| `src/settings/constants.ts` | `enableTaskHierarchy: true` |
| `src/settings/builders/GeneralSettingsBuilder.ts` | `addToggle`（照 `enableDebugMode` 的写法，`:58-68`） |
| `src/i18n/locales/{en,zh}.json` | 同键同路径新增 |

### 6.5 i18n 键清单（en / zh 必须同时加）

```
taskCard.parentTask            父任务
taskCard.childTasks            子任务
taskCard.parentMissing         父任务已不存在
taskCard.parentHidden          父任务已被筛选隐藏
taskCard.moreChildren          还有 {{count}} 个
taskCard.childProgress         {{done}}/{{total}}
modals.taskForm.parentTask     父任务
modals.taskForm.selectParent   选择父任务…
modals.taskForm.clearParent    移除
modals.taskForm.parentSearchPlaceholder  搜索任务…
modals.taskForm.parentEmpty    没有可选的父任务
modals.taskForm.parentCycleRejected   不能把任务挂到自己的子任务下
modals.taskForm.parentRepeatRejected  重复任务不能作为父任务
modals.taskForm.parentWriteFailed     父任务写入失败，请检查文件是否可写
modals.taskForm.parentChanged  父子关系已更新
contextMenu.clearParent        取消父子关系
settings.general.taskHierarchy.name        启用任务父子关系
settings.general.taskHierarchy.description 在悬浮提示与甘特图中聚合父子任务
gantt.parentCheckboxHint       进度由子任务决定
```

---

## 7. 冲突与风险（实施时逐条对照）

### 7.1 serializer 的 metadata 分支有 bug —— 必须先修

见 §3.3。**不要照抄 guid 的现有写法**作为 `tid`/`parent` 的样板。补 2 个回归用例后再动其它。

### 7.2 缓存对象共享 —— 禁止在任务对象上挂派生字段

`getAllTasks()` 返回缓存数组本体（`TaskStore.ts:246`），store 用引用相等短路（`calendarStore.ts:146`）。任何 `task.children = [...]` 式的原地挂载会静默污染缓存、跨视图串味。
**规则**：派生数据一律放 `TaskHierarchyIndex`（新对象），任务对象只保留解析期派生的 `tid`/`parentTid` 两个字符串。

### 7.3 甘特行几何是内联的 `index * rowHeight`

三处坐标（左侧列表、斑马纹、任务条）各自内联计算，没有共享函数。所以：
- **折叠必须靠过滤行**，不能靠 `display:none`/`opacity:0`（否则三处坐标全错）；
- 若将来要支持「分组标题行更高」，必须先把三处抽成 `computeRowOffsets()`，本轮不做。

### 7.4 新增一行 = 全量重绘

`updateTaskListIncremental` / `updateGanttAreaIncremental` 在 `added > 0` 时清空重建（`:1429-1441`、`:1473-1508`）。因此：
- 折叠/展开 → 行集合变化 → 全量重建，**接受**；
- 认领一个父任务的 tid（懒写入）会触发该任务行 `updated` → 增量路径，代价小；
- 但**首次**给一批任务建立父子关系（如批量导入）会连续触发全量重绘，需在 UI 上做「一次操作、一次刷新」（表单保存后统一 `refreshTasks()`，不要逐条刷新）。

### 7.5 写回是整行重建，不是原地改字段

`serializeTask` 按固定顺序重排 tags/emoji/元数据（`taskSerializer.ts:117-279`）。影响：
- 用户手写的字段顺序会在第一次写父子关系时被规范化 —— 属于既有行为，但要在 `CHANGELOG`/提示里说清；
- 每个写操作都要注册撤销，否则「点一下父任务选择器，整行格式变了」会被当成 bug。

### 7.6 行号漂移

`tid` 免疫，但甘特 id 仍是 `文件名-行号-路径哈希`（`taskDataAdapter.ts:151`）。因此：
- **父子引用一律按 `tid` 解析**，`parentId`（gantt id）只用于同一帧内的视觉连线/缩进，不跨帧存储；
- `ganttCollapsedTids` 存 `tid`，不存 gantt id（否则插一行折叠态全丢）。

### 7.7 无效数据不自动修复

断链（D13）、环、重复任务当父 —— 全部「显示上降级 + 提示」，**不自动删除用户字段**。清理只由用户显式操作（右键「取消父子关系」）。

### 7.8 i18n 无双语对齐测试

zh 959 叶 / en 957 叶（已知差异 2 键）。新增键务必两边同加；en 是兜底，缺失会直接露 key。

### 7.9 远程/API 任务

`filePath` 是伪造的（`APIDataSource.ts:268-286`），写回语义不成立。索引里直接排除；选择器里也不出现。

---

## 8. 改动文件清单

### 新增

| 文件 | 职责 |
|---|---|
| `src/tasks/taskMetadata.ts` | metadata 读/写/删纯函数 + 保留键 |
| `src/tasks/taskHierarchyUpdater.ts` | `ensureTaskTid` / `assignParent` / `clearParent` / `wouldCreateCycle` |
| `src/tasks/hierarchy/taskHierarchy.ts` | `buildTaskHierarchy` + 类型 |
| `src/tasks/hierarchy/aggregate.ts` | `computeGroupStats` / `computeAggregateDates` |
| `src/gantt/adapters/hierarchyOrder.ts` | `orderTasksWithHierarchy` |
| `src/ui/modals/ParentTaskSelector.tsx` | 父任务搜索选择器 |
| `src/contextMenu/commands/clearTaskParent.ts` | 右键解除关系 |
| `src/tasks/__tests__/taskMetadata.test.ts` 等 | 单测（见 §10） |

### 修改

| 文件 | 改动 |
|---|---|
| `src/types.ts` | `GCTask.tid` / `parentTid` |
| `src/tasks/taskParser/main.ts` | 两处派生（`:99-114`、`:299-312`） |
| `src/tasks/taskSerializer.ts` | 修 metadata/guid 归一（`:207-215`） |
| `src/components/tooltip/tooltipSections.ts` | 新签名 + parent/children section + 过滤保留键 |
| `src/ui/components/TooltipProvider.tsx` | 渲染两个新 section |
| `src/utils/tooltipManager.ts` | 同上（DOM 端） |
| `src/utils/bem.ts` | `TooltipClasses` 子行/缺失态；`GanttClasses` 聚合条/折叠箭头/进度徽标 |
| `src/styles/components/tooltip.css`、`src/styles/views/gantt.css` | 对应样式 |
| `src/gantt/types.ts` | `GanttChartTask` 扩字段；`GanttChartConfig.on_toggle_collapse` |
| `src/gantt/adapters/taskDataAdapter.ts` | 层级版批量转换 + 聚合日期/进度注入 |
| `src/gantt/wrappers/svgGanttRenderer.ts` | 缩进、折叠箭头、徽标、父勾选禁用、聚合条、进度填充修通、父行不画手柄 |
| `src/gantt/wrappers/gridRenderer.ts` | 跟随新行数组（无需改算法，核对即可） |
| `src/ui/views/GanttView.tsx` | 分流、`visibleKeys`、`on_toggle_collapse`、签名纳入层级字段 |
| `src/ui/store/calendarStore.ts` | `hierarchy`、`ganttCollapsedTids`、`toggleGanttCollapsed` |
| `src/ui/modals/TaskFormModal.tsx` | 「父任务」区块 |
| `src/ui/components/TaskCard.tsx` | 右键菜单项 |
| `src/settings/{types,constants}.ts`、`builders/GeneralSettingsBuilder.ts` | 开关 |
| `src/i18n/locales/{en,zh}.json` | §6.5 键 |
| `main.ts` | `plugin.getTooltipHierarchyContext()` 访问器 |

---

## 9. 分阶段实施与验收

### P0 数据契约与写回（前置，必须最先）
1. `GCTask` 扩字段 + 两处解析派生
2. `taskMetadata.ts`
3. serializer 修复 + 2 个回归用例
4. `taskHierarchyUpdater.ts`（含环检测）

**验收**
- 手写 `%%[parent:: x]%%` 能在解析结果里读到 `parentTid`。
- 设父 → 父任务自动获得 `tid`、子任务获得 `parent`；重复执行幂等（不产生重复键）。
- A→B→A 被拒绝且有 Notice。
- 已有 `%%[foo:: bar]%%` 的任务设置 guid 不再丢失（回归）。
- `npx jest` 全绿（270 + 新增），`npx tsc --noEmit` 通过。

### P1 派生索引与聚合
1. `taskHierarchy.ts` / `aggregate.ts`
2. `calendarStore` 接入

**验收**
- 单测覆盖：顶层/单层/三层/跨文件/断链/环/重复任务当父/取消任务计分母。
- 进度：10 个子任务完成 3 → 30%；含孙任务时只数叶子。
- 日期：父显式值优先；缺侧推导；两侧都缺 → `undefined`。
- 基准：3000 任务建索引 < 20ms（打印耗时，超阈值即回退到记忆化方案）。

### P2 悬浮提示面板
1. `tooltipSections.ts` + 两端渲染
2. metadata 过滤保留键

**验收**
- 日/周/月/年/侧栏/甘特六处都能看到父与子（任务视图按 D17 不看）。
- 断链任务显示「父任务已不存在」；父被筛掉显示「（已筛选隐藏）」。
- 子任务 > 6 条时折叠为「还有 N 个」。
- 提示面板里不再出现 `tid` / `parent` 原始行。
- 无父子关系的任务，提示面板与改动前**完全一致**（快照对比）。

### P3 甘特图
1. 行序、折叠、缩进、聚合条、进度填充、徽标、父勾选禁用
2. 折叠态进 store

**验收**
- 父行在子行之上，子行缩进；折叠后子行消失、父行保留、下方行 y 正确上移。
- 父条 = 最早开始 ~ 最晚结束；父条内部进度填充可见（0<progress<100 时肉眼可辨）。
- 左列父行显示 `3/5`；父行 checkbox 置灰且点击无效。
- 关闭 `enableTaskHierarchy` 后，画面与改动前逐像素一致（截图比对）。
- 跨文件父子在甘特里成块显示。
- 父被筛掉时子任务提为顶层（不消失）。
- 增量路径：仅改描述时仍走局部更新，不全量重绘。

### P4 入口与设置
1. `ParentTaskSelector` + 表单
2. 右键「取消父子关系」
3. 设置开关

**验收**
- 表单里能搜到候选父任务，选完保存 → 文件出现两个字段，UI 立即刷新。
- 候选列表排除自身/子孙/重复任务/远程任务。
- 右键菜单项仅在存在父时出现；执行后字段被删、甘特分组消失。
- 撤销能恢复原 `metadataFields`。
- 开关关闭 → 甘特回到平铺、提示面板隐藏父子 section，但磁盘字段保留不动。

---

## 10. 测试计划

### 单元（Jest）
| 文件 | 用例 |
|---|---|
| `taskMetadata.test.ts` | upsert 幂等、删除全部同名、保留键过滤、返回新数组 |
| `taskSerializer.test.ts`（扩充） | guid 丢失回归、guid 清除回归、metadata 顺序稳定 |
| `taskHierarchy.test.ts` | 8 类拓扑（见 P1）+ 4000 层深链不爆栈 |
| `aggregate.test.ts` | 进度等权/递归/取消计分母/父自身 completed 忽略；日期显式优先/单侧推导/无日期 |
| `hierarchyOrder.test.ts` | 整块排序、跨文件、父被筛掉提顶层、折叠过滤、环不死循环 |
| `taskHierarchyUpdater.test.ts` | 环拒绝、幂等、写锁失败不写子任务 |

### 手验
- 真实 vault：建 3 层任务、跨文件父子、折叠展开、筛选后子的表现。
- 移动端：提示面板不溢出屏幕（tooltip 已有定位逻辑，只需确认内容变高时不越界）。

---

## 11. 本轮不做（明确排除）

| 项 | 原因 |
|---|---|
| 飞书/CalDAV 同步父子映射 | 上游无 parent_guid / subtask 端点（D6） |
| 对外 JSON / Markdown 导入导出 | 无现存格式，需单独设计 |
| 任务视图父子缩进 | 需重构列表层级渲染（D17） |
| 甘特拖拽建立父子 | 引擎无嵌套拖拽能力，需从零做 |
| 提示面板点击跳转 / 直接勾选子任务 | 两套渲染端 + tooltip 悬停即消失（D9） |
| 多父 / DAG | 进度与时间聚合失去唯一解（D2） |
| 父任务手动进度覆盖 | 与自动聚合的冲突规则未定 |
| 折叠态持久化到 data.json | 需清理机制（D14） |
| 自动把子任务行移动到父任务下方 | 会重写用户笔记（D18） |
| 批量「一键完成全部子任务」 | 需批量写锁 + 批量撤销 |

---

## 12. 后续可接的迭代（不在本方案）

1. 任务视图的层级树 / 折叠。
2. 甘特拖拽建立/解除父子，父行拖动整体顺延子任务（需批量日期写回）。
3. 父任务手动进度覆盖 + 冲突规则（自动 vs 手动谁优先）。
4. 飞书子任务映射（先扩 provider 端点）。
5. 折叠态跨会话持久化 + 任务删除后的清理。
6. 依赖关系（`GanttChartTask.dependencies` 至今是死字段）—— 与父子是两套语义，可复用本方案的 SVG 增量元素模式。
