# Obsidian Gantt Calendar — 全面代码质量审查报告

> **审查日期**: 2026-04-30
> **审查工具**: Claude Code (DeepSeek V4 Pro)
> **项目版本**: v1.5.18
> **审查范围**: 全项目 ~155 个 TypeScript 文件，~16,700 行 TS + ~4,200 行 CSS

---

## 目录

1. [项目概况](#1-项目概况)
2. [架构评估](#2-架构评估)
3. [重复代码分析](#3-重复代码分析)
4. [死代码分析](#4-死代码分析)
5. [CSS/UI 质量评估](#5-cssui-质量评估)
6. [TypeScript 代码质量](#6-typescript-代码质量)
7. [逻辑 Bug 与运行时问题](#7-逻辑-bug-与运行时问题)
8. [视图渲染器分析](#8-视图渲染器分析)
9. [模态框系统分析](#9-模态框系统分析)
10. [农历与日期工具分析](#10-农历与日期工具分析)
11. [同步系统与数据层分析](#11-同步系统与数据层分析)
12. [安全与数据完整性](#12-安全与数据完整性)
13. [测试覆盖分析](#13-测试覆盖分析)
14. [项目工程化分析](#14-项目工程化分析)
15. [Obsidian 官方规范合规性](#15-obsidian-官方规范合规性)
16. [综合评分与优先级行动项](#16-综合评分与优先级行动项)

---

## 1. 项目概况

| 指标 | 数值 |
|------|------|
| TypeScript 源文件 | ~155 个 |
| TypeScript 代码行 | ~16,700 行 |
| CSS 代码行 | ~4,200 行 |
| npm 运行时依赖 | 3 个（其中 `frappe-gantt` 已废弃） |
| npm 开发依赖 | 10 个 |
| 测试文件 | 2 个（无法运行） |
| 有效测试覆盖率 | 0% |
| CI/CD 流程 | 无 |
| Git 标签 | v1.5.0 ~ v1.5.12（v1.5.13~v1.5.18 缺失） |

### 代码量分布

| 模块 | 估算行数 | 占比 |
|------|---------|------|
| 视图渲染器 (views/) | ~4,500 | 27% |
| 甘特图 (gantt/) | ~2,500 | 15% |
| 数据层 (data-layer/) | ~3,000 | 18% |
| 设置 (settings/) | ~2,000 | 12% |
| 任务系统 (tasks/) | ~2,000 | 12% |
| 工具栏 (toolbar/) | ~1,500 | 9% |
| 其他 (utils, modals 等) | ~1,200 | 7% |

---

## 2. 架构评估

### 2.1 整体架构

```
main.ts (插件入口)
├── GCMainView (主视图容器, ItemView)
│   ├── YearViewRenderer (extends BaseViewRenderer)
│   ├── MonthViewRenderer (extends BaseViewRenderer)
│   ├── WeekViewRenderer (extends BaseViewRenderer)
│   ├── DayViewRenderer (extends BaseViewRenderer)
│   ├── TaskViewRenderer (extends BaseViewRenderer)
│   └── GanttViewRenderer (extends BaseViewRenderer)
├── GCSidebarView (侧边栏容器, ItemView)
│   ├── TaskListTab (搜索+筛选+排序)
│   └── DailyTimelineTab (今日时间轴+拖拽)
├── TaskStore (数据门面, Facade 模式)
│   ├── EventBus (发布-订阅事件系统)
│   ├── TaskRepository (仓库模式, 内存 Map 缓存 + 文件索引)
│   │   └── MarkdownDataSource (扫描 vault, 50个一批, metadataCache 解析)
│   └── SyncManager (可选, 通过 SyncManagerBridge 连接)
│       ├── FeishuTaskSync (飞书双向同步引擎)
│       ├── CalDAVDataSource (CalDAV 数据源)
│       └── APIDataSource (API 数据源模板)
├── SettingsManager (设置加载/保存/迁移)
├── ViewManager (视图激活/刷新)
├── ThemeManager (主题变化检测)
└── SyncManagerBridge (同步管理器桥接)
```

### 2.2 评分

**7.5/10 (B+)**

**优点：**
- 分层清晰，关注点分离良好
- `BaseViewRenderer` 抽象基类正确提取了共用逻辑
- 数据层采用 Facade → Repository → DataSource 三层架构
- 设置系统使用 Builder 模式，14 个 Builder 各管一段
- 甘特图用自定义 SVG 渲染取代了废弃的 frappe-gantt 依赖

**缺点：**
- 基类抽取不彻底，大量重复代码残留在子类中
- `BaseViewRenderer` 和 `TaskCardRenderer` 之间有 6 个方法几乎完全相同
- `plugin: any` 类型在 20+ 文件中泛滥，丧失类型安全
- 18 处 `require()` 表明存在循环依赖问题
- `BaseTaskModal.ts` 达 1258 行，严重违反单一职责

---

## 3. 重复代码分析

共发现 **24 处**重复代码。

### 3.1 严重重复

| # | 文件 | 行号 | 描述 |
|---|------|------|------|
| 1 | `BaseViewRenderer.ts` + `TaskCardRenderer.ts` | 多处 | **6 个方法几乎完全相同**：`getPriorityIcon`、`getPriorityClass`、`getStatusColors`、`renderTaskDescriptionWithLinks`、`openTaskFile`、`formatDateForDisplay`。其中 `BaseViewRenderer` 版 `getStatusColors` 缺少暗色主题参数——**是一个 bug** |
| 2 | `taskUpdater.ts` + `recurringTaskCompleter.ts` | 10-32 / 155-175 | `determineTaskFormat` 函数逐字重复，注释直言「从 taskUpdater.ts 复制」 |
| 3 | `DayView.ts`/`WeekView.ts`/`MonthView.ts`/`TaskView.ts` ×4 | 多处 | `initializeSortState` / `saveSortState` / `setSortState` / `getSortState` 在 4 个渲染器中几乎逐字重复，仅 `SETTINGS_PREFIX` 不同 |
| 4 | `DayView.ts`/`WeekView.ts`/`DailyTimelineTab.ts` ×3 | 多处 | 拖拽时间槽处理逻辑三者几乎完全相同 |
| 5 | `DayView.ts`/`WeekView.ts`/`DailyTimelineTab.ts` ×3 | 多处 | 快速创建按钮（空时间格悬停显示"+"）三者完全相同 |

### 3.2 中度重复

| # | 文件 | 描述 |
|---|------|------|
| 6 | 12+ 个 settings builder | `addSetting` 包装函数在每个 builder 中逐字重复，应提取到 `BaseBuilder` |
| 7 | `taskSerializer.ts` / `field-selector.ts` / `CalendarViewSettingsBuilder.ts` / `GanttViewSettingsBuilder.ts` ×2 | 6 个日期字段的 emoji 和字段名映射在 5 处硬编码，无统一来源 |
| 8 | `TaskListTab.ts` ×5 | 5 个 dropdown 方法有完全相同的 inline CSS 和 closeHandler 模式 |
| 9 | `svgGanttRenderer.ts` | `updateHighlight` 和 `clearHighlight` 是 40 行近重复函数 |
| 10 | `DayView.ts`/`WeekView.ts`/`MonthView.ts` ×5 | 日期匹配过滤回调逐字重复 |
| 11 | `DayView.ts`/`WeekView.ts` | `renderTimelineTaskItem` 几乎完全相同 |
| 12 | `MonthView.ts`/`WeekView.ts` | 虚拟任务实例过滤逻辑逐字重复 |
| 13 | `toolbar/components/` ×3 | `sort-button.ts`/`status-filter.ts`/`tag-filter.ts` 共享相同的 dropdown 创建模式 |
| 14 | `BaseTaskModal.ts` + `EditTaskModal.ts` | `renderRepeatSection` ~370 行几乎完全相同 |

### 3.3 CSS 重复

| # | 位置 | 描述 |
|---|------|------|
| 15 | styles.css:3284-3303 + 3452-3471 | `.gc-gantt-view__container` 和 `.gc-gantt-view__root` 完全相同的规则定义了两遍 |
| 16 | styles.css:2420-2466 | 56 条热力图规则（8 调色板 × 5 等级 × 1 属性 + background-image）全部相同，仅颜色不同 |

---

## 4. 死代码分析

共确认 **10 项可立即移除的死代码**。

### 4.1 完全无引用的源文件

| 文件 | 证据 |
|------|------|
| `src/data-layer/sources/api/providers/FeishuTaskBase.ts` | 全局搜索零导入 |
| `src/data-layer/sources/api/providers/feishu/FeishuCalendarApi.ts` | 全局搜索零导入 |
| `src/lunar/festival.ts` | 全局搜索零导入 |

### 4.2 无用的 Barrel 文件

| 文件 | 原因 |
|------|------|
| `src/calendar/calendarIndex.ts` | 所有调用者直接从 `calendarGenerator` 导入 |
| `src/settings/utils/index.ts` | 调用者直接从 `color.ts` 导入 |

### 4.3 未使用的 Settings Builder

| 文件 | 原因 |
|------|------|
| `src/settings/builders/FestivalColorBuilder.ts` | `YearViewSettingsBuilder` 中已有完全相同的阳历/农历/节气颜色选择器 |
| `src/settings/builders/TaskStatusSettingsBuilder.ts` | `TaskSettingsBuilder` 中已有完全相同的状态管理功能 |

### 4.4 未使用的 CSS 类（10+ 个，约 180 行）

| 类名 | styles.css 行号 |
|------|----------------|
| `.gc-tag--popup` | 3693 |
| `.gc-create-task-btn--toolbar` | 3831 |
| `.gc-nav` | 321 |
| `.gantt-control-panel` | 3666 |
| `.gantt-stats` | 3676 |
| `.gantt-stat-item` | 3681 |
| `.gc-status-bar-icon` | 4209 |
| `.sidebar-dropdown` | 3951 |
| `.sidebar-dropdown-item` | 3965 |
| `.gc-week-view__header-spacer` | 1956 |
| `.gc-week-view__empty` | 1934 |
| `.gc-week-view__row--drag-over` | 2014 |

### 4.5 废弃的 npm 依赖

| 依赖 | 原因 |
|------|------|
| `frappe-gantt@^1.0.4` | 代码中零引用，已被 `src/gantt/wrappers/svgGanttRenderer.ts` 自定义 SVG 引擎完全替代 |

### 4.6 其他死代码

| 项目 | 详情 |
|------|------|
| `src/commands/conditional.ts` | `registerConditionalCommands` 函数体为空，注释标注「预留」 |
| `src/tasks/taskParser.ts` | 已标记 `@deprecated`，保留仅为向后兼容层 |
| `bem.ts:505-589` | `EditTaskModalClasses.elements` 定义了大量从未引用的类名（repeatLabel, repeatHint 等 ~20 个） |
| `YearView.ts:230` | `currentYear` 变量声明但从未使用 |
| `YearView.ts:227-228` | `firstMonthCard` DOM 查询结果被获取但从未使用 |
| `YearView.ts:251-252` | `dayNum` 从 DOM 解析、验证、然后立即丢弃 |
| `tooltipManager.ts:451-455` | `escapeHtml` 方法在整个代码库中从未被调用 |

---

## 5. CSS/UI 质量评估

### 5.1 严重问题

| 问题 | 详情 |
|------|------|
| **81 个 `!important`** | 56 个仅用于热力图颜色，8 个用于覆盖 Obsidian 按钮样式 |
| **53 处硬编码 16 进制颜色** | 如 `#ff6b6b` 用于"今天"高亮、`#6366f1` 等紫色渐变为标签选中态。不随主题切换 |
| **全中文硬编码 UI 文本** | 所有菜单、提示、按钮、通知直接写死中文，零 i18n 支持 |

### 5.2 中等问题

| 问题 | 详情 |
|------|------|
| **BEM 系统执行不彻底** | `bem.ts` 定义了 18 个块，但大量文件直接使用硬编码类字符串绕过 BEM：`GCMainView.ts`、所有 View 文件、`TagSelector.ts`、`svgGanttRenderer.ts` |
| **~94 处内联 `.style.*` 赋值** | 分布在 20+ 文件中，部分可用 CSS 类替代 |
| **重复 CSS 规则** | `.gc-gantt-view__container` 和 `.gc-gantt-view__root` 在 styles.css 中定义了两遍 |
| **CSS 中未定义的类** | `TagSelector` 的样式通过 `BaseTaskModal.addStyles()` 内联 `<style>` 标签注入（250+ 行 CSS-in-JS） |
| **选择器过深** | 已完成任务删除线用了 5 层组合选择器: `.gc-day-view__task-list .gc-task-card--day.gc-task-card--completed:not(.task-with-status) .gc-task-card__text` |

### 5.3 轻微问题

| 问题 | 详情 |
|------|------|
| 媒体查询断点不一致 | 工具栏用 900/700/550 断点，其他组件用 768 断点 |
| `active` 类字符串硬编码 | 多个文件中直接使用 `'active'` 字符串而非 BEM 修饰符 |
| 旧类名 `calendar-toolbar` | 与新的 `gc-toolbar` BEM 类并存 |
| ~681 个硬编码像素值 | 而非使用 Obsidian CSS 变量 |

### 5.4 响应式设计

- `ToolbarResponsiveManager` 使用 `ResizeObserver` + 滞后机制 — 设计良好
- CSS 媒体查询 6 处但断点不统一（900/700/550/768）
- 年视图有 4×3 / 3×4 / 2×6 / 1×12 响应式布局切换

---

## 6. TypeScript 代码质量

### 6.1 严重问题

| 问题 | 数量 | 详情 |
|------|------|------|
| **`any` 类型泛滥** | 80+ 处 | 最严重：`plugin: any` 在 20+ 文件；`(task as any)[field]` 在 8+ 文件 |
| **循环依赖（`require()` 调用）** | 18 处 | `EditTaskModal.ts`、`taskParser/step3.ts`、`taskParser/step4.ts`、`svgGanttRenderer.ts`、`taskUpdateHandler.ts` 使用运行时 `require()` 打破循环依赖 |
| **超大文件** | 6 个 >500 行 | `BaseTaskModal.ts` 1258 行、`svgGanttRenderer.ts` 2000+ 行、`EditTaskModal.ts` 830 行、`bem.ts` 739 行、`MarkdownDataSource.ts` 680 行、`WeekView.ts` 651 行 |
| **`as any` 双重断言** | 60+ 处 | `(task as any)[dateField] as Date` 模式在 8+ 个视图文件中重复 |

### 6.2 中等问题

| 问题 | 详情 |
|------|------|
| **非空断言 `!`** | 30+ 处，主要风险在 `EventBus.ts:27`、`svgGanttRenderer.ts:607-621`、`FeishuTaskSync.ts:207` |
| **内存泄漏风险** | `svgGanttRenderer.ts` 中 scroll sync 和 resizer 监听器无 destroy 清理；`TaskListTab.ts` 中 5 个 dropdown 的 document click 监听器在快速切换 tab 时可能泄漏 |
| **fire-and-forget async** | 所有视图的 `saveSortState().catch(...)` 仅记录错误，调用者无感知 |
| **`GCMainView.ts` / `GCSidebarView.ts`**: `plugin: any` | 最核心的两个容器类使用了 `any` 类型 |

### 6.3 轻微问题

| 问题 | 详情 |
|------|------|
| `(error as Error).message` | 多处 catch 块假定抛出的必为 Error 实例 |
| 混合 `.then().catch()` 与 `async/await` | `syncManager.ts` 中两处混用风格 |
| `GanttView.ts:151` | `_retryCount` 参数从未使用，暗示的重试逻辑未实现 |
| `TaskView.ts:105` | `setTimeFilterField(value: any)` 应使用联合类型 |

### 6.4 代码风格合规

| 检查项 | 状态 |
|--------|------|
| 无 `var` 声明 | ✅ 全用 `const`/`let` |
| 无 `==` 宽松比较 | ✅ 全用 `===` |
| 无注释掉的代码块 | ✅ |
| 命名一致性 | ✅ camelCase 变量 / PascalCase 类 / UPPER_CASE 常量 |
| `.editorconfig` 一致性 | ✅ tab 缩进，4 空格宽度 |
| ESLint 配置 | ✅ `no-unused-vars` error，`ban-ts-comment` 关闭 |

---

## 7. 逻辑 Bug 与运行时问题

### 7.1 严重 Bug

| # | 文件 | 行号 | 描述 |
|---|------|------|------|
| **Bug-1** | `recurrenceCalculator.ts` | 228-239 | **月度重复 auto-rolls on 月末日期**。`setMonth()` 在日期边界限制前调用。1 月 31 日 +1 月 → 自动滚到 3 月，返回错误月份。影响全部 3 种月度重复子情况 |
| **Bug-2** | `recurrenceCalculator.ts` | 198-215 | **周度重复 interval>1 丢失匹配日**。interval>1 分支无条件覆盖正常的"下一匹配日"计算，直接用 `interval*7` 天跳跃。如 `"每 2 周的周一、周三"` 跳过周三 |
| **Bug-3** | `recurrenceCalculator.ts` | 275-285 | **月度错误随链式调用复合**。每次错误结果喂给下一次调用，整个重复序列被破坏 |
| **Bug-4** | `recurringTaskCompleter.ts` | 38-39 | **`whenDone` 使用 `new Date()`** 而非时区感知的 `getTodayInTimezone()`，跨时区可能差一天 |

### 7.2 中等问题

| # | 文件 | 行号 | 描述 |
|---|------|------|------|
| Bug-5 | `MarkdownDataSource.ts` | 655-679 | **`diffTasks` 用 Date 引用比较**。两个代表相同日期的不同 `Date` 实例比较 `!==` 始终为 true，每次文件重解析触发所有任务的虚假 `task:updated` 事件 |
| Bug-6 | `MarkdownDataSource.ts` | 584-596 | **`detectChangesByIds` 每个 ID 无条件标记更新**。相同 ID 的旧任务和新任务都被推入 updated 数组，不检查内容变化 |
| Bug-7 | `syncManager.ts` | 254 | **同步统计 `deleted` 始终为 0**。`toDelete` 数组被初始化但无任何代码向其添加条目 |
| Bug-8 | `syncManager.ts` | 368 | **`pushLocalChanges` 对 `updateTask` 传递空对象 `{}`** |
| Bug-9 | `versionTracker.ts` | 169-171 | **版本 0 被跳过**。`task.version ? ...` 中 `0` 是假值，版本 0 任务绕过版本检查 |
| Bug-10 | `syncState.ts` | 49-60 | **`load()` 在文件损坏时静默重置**。所有同步元数据丢失，触发全量重新同步 |
| Bug-11 | `syncState.ts` | 69-71 | **`save()` 静默吞下所有写入错误** |
| Bug-12 | `conflictResolver.ts` | 246-248 | **建议合并但无对应策略**。`suggestResolution` 可返回 `merge` 建议，但 `resolveConflict` 没有 `merge` case |
| Bug-13 | `syncManager.ts` | 347-354 | **`applyRemoteChanges` 是空存根**。双向同步的拉取方向完全未实现 |

### 7.3 低风险问题

| # | 文件 | 行号 | 描述 |
|---|------|------|------|
| Bug-14 | `solarTerm.ts` | 12-25 | 二十四节气用固定日期查表而非天文计算，约 30%-50% 年份差一天 |
| Bug-15 | `lunarUtils.ts` | 5-30 | 农历年份索引无边界检查，超出 1900-2100 范围静默返回错误结果 |
| Bug-16 | `week.ts` | 68 | `getWeekOfDate` 硬编码 `isCurrentMonth: true`，对跨月周边界错误 |
| Bug-17 | `GanttView.ts` | 465-481 | `shouldFullRefresh` 仅比较 ID 顺序，不检查任务内容变更（描述/进度/日期） |
| Bug-18 | `GanttView.ts` | 143-192 | `performRefreshWithRetry` 无重试逻辑但命名暗示有 |

---

## 8. 视图渲染器分析

### 8.1 严重渲染 Bug

| Bug | 文件 | 行号 | 描述 |
|-----|------|------|------|
| **渲染损坏-1** | `EmbeddedNoteEditor.ts` | 84-85 | **同一天导航时编辑器消失**。`same-file` 优化检查 `this.currentFilePath === file.path` 后直接 return，但不检查当前 DOM 容器是否已被 DayView 重新渲染销毁 |
| **渲染损坏-2** | `EmbeddedNoteEditor.ts` | 55 + `DayView.ts` | 530-552 | **容器引用失效**。编辑器在构造时存储 `this.container` 引用，DayView 每次 `render()` 创建新 DOM 后，旧容器被分离。编辑器 DOM 被附加到已不存在的页面上 |
| **渲染损坏-3** | `EmbeddedNoteEditor.ts` | 280 | **`overflow: hidden` 破坏滚动**。禁用嵌入编辑器的原生滚动，长笔记内容底部被裁剪 |
| **分类错误** | `DayView.ts` | 272-277 | **全天任务混入 00:00 时段**。无时间精度的全天任务被推入与午夜定时任务相同的 `tasksByHour.get(0)` 桶 |

### 8.2 功能性 Bug

| Bug | 文件 | 行号 | 描述 |
|-----|------|------|------|
| 永久时间线 | `WeekView.ts` | 144-145 | `timelineActive` 标志一旦设为 `true` 就永久保持，删除所有定时任务后也无法退出时间线模式 |
| dragend 未清理 | `MonthView.ts` / `WeekView.ts` / `DayView.ts` | 多处 | 取消拖放（Escape）不会清除高亮，无 `dragend` 事件监听器 |
| EmbeddedNoteEditor | `EmbeddedNoteEditor.ts` | 143-154 | `unwrapTabs` 在迭代期间变更 `children` 数组，可能导致索引偏移 |
| 甘特 taskId 不稳定 | `taskDataAdapter.ts` | 106-110 | ID 包含数组索引 `index`，任务重排后 ID 改变，迫使全量重渲染 |

### 8.3 代码异味

| 异味 | 文件 | 行号 |
|------|------|------|
| 死变量 `currentYear` | `YearView.ts` | 230 |
| 死查询 `firstMonthCard` | `YearView.ts` | 227-228 |
| 解析但未使用的 `dayNum` | `YearView.ts` | 251-252 |
| 全局 `document.querySelector` 在多窗格中不可靠 | `MonthView.ts` | 254-256 |
| 全重渲染被伪装为增量刷新 | `WeekView.ts` | 493-498 |

---

## 9. 模态框系统分析

### 9.1 BaseTaskModal.ts (1258 行)

| 问题 | 行号 | 描述 |
|------|------|------|
| CSS-in-JS | 997-1237 | 250 行 CSS 通过 `<style>` 标签注入 `document.head` |
| 样式泄漏风险 | 1236 | 若 `onClose()` 未执行（插件卸载/崩溃），style 标签泄漏 |
| 空日期 + 时间切换 | 296 | 空日期上点击"+time"生成 `"T00:00"` 无效值 |
| `validateRepeatRule` 宽松 | 941 | `every \w+ on .+` 匹配任意文本 |
| 类过大 | 全文 | 应提取 RepeatConfigEditor、DateFieldGroup 组件 |

### 9.2 EditTaskModal.ts (830 行)

| 问题 | 行号 | 描述 |
|------|------|------|
| 复制 370 行重复 | 352-727 | `renderRepeatSection` 几乎逐字从 BaseTaskModal 复制，仅加一行 `this.repeatChanged = true` |
| 内部 API 访问 | 821 | `(this.app as any).plugins.plugins['gantt-calendar']` |
| 变更追踪误报 | 221, 286, 343, 583 | 每次点击都设 `*Changed = true`，即使点击已选中的值 |
| 原始任务对象被修改 | 152 | `this.task.datePrecision = { ...this.datePrecision }` 在保存过程中修改了传入的任务引用 |
| 日期变更为全量 | 129-136 | 任一日期变更即输出全部 6 个日期字段 |

### 9.3 CreateTaskModal.ts (174 行)

| 问题 | 行号 | 描述 |
|------|------|------|
| 错误信息暴露 | 146 | `new Notice('创建任务失败: ' + error.message)` 暴露内部错误信息 |
| 无日期关系验证 | 118-162 | 除 createdDate <= dueDate 外，未验证其他日期关系 |

---

## 10. 农历与日期工具分析

### 10.1 农历模块

| # | 文件 | 描述 |
|---|------|------|
| 1 | `lunarData.ts` | 数据覆盖 1900-2100（201 年），编码格式标准。✅ |
| 2 | `lunarUtils.ts:5-30` | 无年份边界检查，超出范围静默返回错误结果 |
| 3 | `lunarConvert.ts:15` | 年份循环处理 1900-2099，2100 仅因巧合正常工作 |
| 4 | `lunarConvert.ts:56-57` | Ganzhi 使用 `(year-4)`，年份 < 4 得出负数索引 |
| 5 | `festival.ts:35` | 循环依赖：`getFestival` → `solarToLunar` → `getFestival`。当前安全但脆弱 |
| 6 | `solarTerm.ts:12-25` | 二十四节气用固定日期查表，非天文计算，30%-50% 年份差一天 |

### 10.2 日期工具

| # | 文件 | 描述 |
|---|------|------|
| 7 | `timezone.ts:81-94` | 固定时区偏移 + DST 不匹配可能使"今天"差一天 |
| 8 | `timezone.ts:58-68` | `createDate()` 缺输入验证，静默返回 Invalid Date |
| 9 | `format.ts:28-33` | `String.replace` 只替换首次出现（如 `"yyyy-yyyy"` 格式会错） |
| 10 | `week.ts:68` | `isCurrentMonth` 硬编码为 `true` |

---

## 11. 同步系统与数据层分析

### 11.1 SyncManager — 6 阶段同步算法

架构上合理（拉取→匹配→分离→冲突检测→计算→推送），但：

| 问题 | 行号 | 描述 |
|------|------|------|
| `applyRemoteChanges` 空存根 | 347-354 | 双向同步拉取方向完全未实现 |
| `pushLocalChanges` 空变更集 | 368 | `source.updateTask(task.syncId, {})` 发送空对象 |
| `isSyncing` 守卫静默丢弃 | 93-108 | 第二个并发同步请求被丢弃，无排队 |
| `updateConfiguration` 过激 | 71-87 | 任何配置变更都停止+重启自动同步 |
| 未处理 Promise | 406-413 | `setTimeout(() => this.sync())` 无 `.catch()` |
| `getDataSourceType` 默认错误 | 450-455 | 未识别的 sourceId 静默归类为 markdown |

### 11.2 飞书同步

| 问题 | 文件 | 行号 | 描述 |
|------|------|------|------|
| `hashTask` `|` 分隔符碰撞 | `FeishuTaskSync.ts` | 512-522 | 若字段含 `|` 会碰撞 |
| `newest-win` 有逻辑缺陷 | `FeishuTaskSync.ts` | 698-711 | 未使用 `task.lastModified` |
| N+1 API 问题 | `FeishuTaskApi.ts` | 多处 | 为每个清单单独获取任务，200 清单 = 200 次 API 调用 |
| 硬性 20 页限制 | `FeishuTaskApi.ts` | 175 | `pageCount < 20` 静默截断 2000+ 任务 |
| 优先级映射有损 | `taskMapper.ts` | 151-164 | Obsidian 6 级 → 飞书 3 级，`highest`/`lowest` 丢失 |

### 11.3 CalDAV

| 问题 | 文件 | 描述 |
|------|------|------|
| `generateUID()` 非 UUID | `CalDAVClient.ts:412-414` | `Date.now() + "@gantt-calendar"`，多设备可碰撞 |
| 无分页 | `CalDAVClient.ts` | 超过默认数（通常 100）的项目被静默截断 |
| 无 ETag 缓存 | `CalDAVClient.ts` | 每次都获取全部数据 |
| 日志中暴露凭据 | `FeishuOAuth.ts:143-163` | `client_secret`、`access_token` 记录到 `console.debug` |

### 11.4 安全重大发现

| 严重性 | 问题 | 文件 | 行号 |
|--------|------|------|------|
| **高** | javascript: URL 注入无净化 | `linkRenderer.ts` | 88-101 |
| **高** | OAuth `client_secret` + token 记录到 console | `FeishuOAuth.ts` | 143-163, 213-231 |
| **中** | `sanitizeFileName` 未过滤 `..` 路径遍历 | `createNoteFromTask.ts` | 303-309 |
| **中** | 令牌以明文存储于 `data.json` | `FeishuProvider.ts` | 74-79 |

---

## 12. 安全与数据完整性

### 12.1 XSS 风险

- **javascript: URL 注入**：`linkRenderer.ts:88-101` 直接使用任务描述中的 URL 设置 `link.href`，无净化。`[click](javascript:alert(1))` 会创建可执行链接
- **innerHTML**：仅在 `tooltipManager.ts:451-455` 使用，但该方法从未被调用（死代码）
- **用户输入渲染**：所有 `createEl()`/`createDiv()` 使用 `text`/`setText()` 设置 `textContent`，安全

### 12.2 认证与机密

| 问题 | 严重性 | 描述 |
|------|--------|------|
| OAuth 密钥日志泄露 | **高** | `FeishuOAuth.ts` 将完整 `client_secret`、授权码、access/refresh token 记录到 `console.debug` |
| 令牌明文存储 | 中 | `accessToken`、`refreshToken`、`clientSecret` 明文存于 `data.json`（Obsidian 平台限制） |
| 设置 UI 复制令牌 | 低 | `SyncSettingsBuilder.ts:389-403` 提供完整令牌复制按钮（设计选择） |
| HTTPS 强制 | ✅ | 所有飞书/CalDAV URL 使用 HTTPS，但自定义 CalDAV URL 无验证 |

### 12.3 数据完整性

| 问题 | 严重性 | 文件 | 描述 |
|------|--------|------|------|
| TOCTOU 竞态条件 | **高** | `taskUpdater.ts`, `deleteTask.ts`, `dailyNoteHelper.ts`, `recurringTaskCompleter.ts`, `FeishuTaskStorage.ts` | `vault.read()` + `vault.modify()` 非原子操作 |
| 同步状态丢失 | 中 | `syncState.ts` | `load()` 文件损坏时静默重置；`save()` 静默吞错误 |
| 任务删除不可逆 | 低 | `deleteTask.ts` | 无撤消/回收站 |
| taskUpdater 仅匹配 `-` 和 `*` | 中 | `taskUpdater.ts:149` | `+` 或 `1.` 列表项无法更新 |

### 12.4 DoS 风险

| 问题 | 风险 | 描述 |
|------|------|------|
| 正则 ReDoS | 低 | 所有正则为单行，长度固定或受限量词。无嵌套量词 `(a+)+` |
| 模糊匹配 O(n³) | 低 | `FeishuTaskSync.ts:410-429` 的 LCS 算法，对于 >10,000 任务的大型 vault 可能慢 |
| 无界循环 | 无 | 所有 while 循环有明确终止条件 |

---

## 13. 测试覆盖分析

### 13.1 现状

| 指标 | 值 |
|------|-----|
| 测试文件数 | 2 |
| 测试总行数 | ~308 |
| 可运行的测试 | 0（无测试框架） |
| 测试覆盖率 | 0% |
| Jest 已安装 | 否 |
| `@types/jest` | 否 |
| `jest.config` | 无 |
| `package.json test 脚本` | 无 |
| `tsconfig.json` 排除测试 | 是（`exclude: ["**/*.test.ts"]`） |

### 13.2 零覆盖的关键路径（约 34,000 行）

| 模块 | 估算行数 | 风险 |
|------|---------|------|
| `src/tasks/taskParser/` | ~670 | 所有任务解析逻辑，正则匹配、格式检测、属性解析 |
| `src/tasks/taskUpdater.ts` | ~184 | 文件读写任务更新，数据丢失最高风险路径 |
| `src/tasks/recurrenceCalculator.ts` | ~290 | 重复任务计算（已发现 3 个严重 bug） |
| `src/calendar/calendarGenerator.ts` | ~119 | 月历网格生成 |
| `src/lunar/` | ~1,600 | 农历转换、节气计算 |
| `src/views/` | ~4,500 | 全部 7 个视图渲染器 |
| `src/gantt/` | ~2,500 | 甘特图 SVG 渲染 |
| `src/data-layer/sync/` | ~600 | 同步编排、冲突解决 |
| `src/modals/` | ~2,200 | 任务创建/编辑模态框 |
| `src/settings/` | ~2,000 | 设置 UI 构建器 |
| `src/dateUtils/` | ~260 | 时区感知日期工具 |

### 13.3 现有测试质量

- `EventBus.test.ts` (157 行): 测试 `on/off/emit/once/clear/listenerCount/eventNames` 基础功能，但缺边界情况（无监听器时 emit、`once` 在 emit 中取消等）
- `TaskRepository.test.ts` (151 行): 仅测试 `registerDataSource`、`getAllTasks`、`getStats` 的最基本场景。`getTasksByDateRange`、`getTasksByFilePath`、`handleSourceChanges`（最长的核心方法）、`filterTasks` 全部零覆盖

---

## 14. 项目工程化分析

### 14.1 构建系统

- **esbuild**: 配置正确。外部依赖 `obsidian`/`electron`/`@codemirror/*`/`@lezer/*` 正确设置
- **TypeScript**: `tsc -noEmit -skipLibCheck` 仅做类型检查，esbuild 负责打包
- **产物**: `main.js`（单 CJS bundle），生产构建启用 minify + treeShaking
- **同步脚本**: `scripts/sync-to-example.js` 自动同步到 example vault

### 14.2 Git 管理

| 问题 | 详情 |
|------|------|
| **6 个版本缺 git tag** | v1.5.13 ~ v1.5.18 无对应标签，manifest 显示 1.5.18 |
| **changelog 停更** | `change.txt` 最后记录 v1.5.12 (2026-01-24) |
| **`.npmrc` tag 前缀冲突** | `tag-version-prefix=""` 但现有标签含 `v` 前缀 |
| **`data.json` 被忽略** | `.gitignore` 正确排除，未跟踪 ✅ |
| **`main.js` 被忽略** | `.gitignore` 正确排除，未跟踪 ✅ |

### 14.3 文档

| 目录/文件 | 状态 |
|-----------|------|
| `docs/plans/` | 3 个活跃计划（时区支持、嵌入式编辑器、设置 UI 重设计），部分已开始实施 |
| `docs/` 历史文档 | 30+ 分析/设计文档，部分可能已过时 |
| `README.md` | 详细、含截图、功能表、路线图 |
| `README.md` 合规性 | 缺少网络使用披露、外部账户要求披露 |
| `change.txt` | 停滞于 v1.5.12 |
| `LICENSE` | MIT，版权年份 2025，持有者格式 `[Sugar]` 不规范 |

### 14.4 CI/CD

**无 `.github/workflows/` 目录**。这是社区商店上架的硬性要求。需添加：

- 自动构建 Action（在 PR 和 tag 上触发）
- 发布 Action（构建并上传 `main.js`、`manifest.json`、`styles.css` 到 GitHub Release）
- 可参考 `obsidianmd/obsidian-sample-plugin` 模板

---

## 15. Obsidian 官方规范合规性

根据 [Obsidian Developer Policies](https://docs.obsidian.md/Developer+policies) 和 [Obsidian October Plugin Self-Critique Checklist](https://docs.obsidian.md/oo/plugin)：

### 合规项 ✅

| 规范 | 状态 |
|------|------|
| manifest.json 字段完整 | ✅ |
| 名称不含 "Obsidian" | ✅ |
| 包含 LICENSE 文件 | ✅ |
| 无 `var` 声明 | ✅ |
| 无 node.js 模块顶层引用 | ✅ |
| 正则无 lookbehind（iOS 兼容） | ✅ |
| 使用 `Plugin.loadData()/saveData()` | ✅ |
| 使用 `requestUrl` 而非 `fetch` | ✅ |
| 使用 `this.app` | ✅ |
| 在 `onLayoutReady()` 中延迟 UI 初始化 | ✅ |

### 不合规项 ❌

| # | 规范要求 | 本项目违反情况 |
|---|---------|---------------|
| 1 | 不得提交 `main.js` | ⚠️ 应只存在于 GitHub Release |
| 2 | README 必须披露网络使用 | ❌ 飞书同步 API 调用未说明 |
| 3 | README 必须披露外部账户 | ❌ 飞书 OAuth 注册要求未说明 |
| 4 | 偏好 `Vault.process()` 而非 `Vault.modify()` | ❌ 5 个文件用 read-modify-write |
| 5 | 避免 `as any` | ❌ 80+ 处 |
| 6 | 移除调试 `console.log` | ❌ `Logger` 生产构建中保留 debug 调用 |
| 7 | 设置标题用 sentence case | ❌ 中文 + "设置" 后缀 |
| 8 | 不用 `<h1>/<h2>` 做设置标题 | ❌ 2 个 builder 使用 `createEl('h2', ...)` |
| 9 | 不覆盖 Obsidian 核心 CSS | ❌ 81 个 `!important` |
| 10 | 提交 `node_modules` 锁文件 | ✅ 有 `package-lock.json` |

---

## 16. 综合评分与优先级行动项

### 16.1 综合评分

| 维度 | 评分 | 等级 |
|------|------|------|
| 架构设计 | 7.5/10 | B+ |
| 代码重复 | 4/10 | C |
| 死代码 | 5/10 | C |
| CSS/UI 质量 | 5/10 | C |
| TypeScript 类型安全 | 5.5/10 | C+ |
| 逻辑正确性 | 5/10 | C |
| 安全性 | 4/10 | D |
| 测试覆盖 | 0.5/10 | F |
| 文档完整性 | 6/10 | B |
| Obsidian 规范合规 | 5/10 | C |
| 项目工程化 | 4/10 | D |
| **总评** | **4.7/10** | **C+** |

### 16.2 必须修复（P0）

| # | 问题 | 影响 |
|---|------|------|
| 1 | **OAuth 密钥记录** — 移除 `FeishuOAuth.ts` 中 `client_secret`、token 的 console 输出 | 安全泄露 |
| 2 | **JavaScript URL 注入** — 在 `linkRenderer.ts` 中净化 href 值 | XSS |
| 3 | **月度重复 Bug** — 修复 `recurrenceCalculator.ts:228-239` 的 `setMonth` auto-roll | 数据错误 |
| 4 | **周度重复 Bug** — 修复 `recurrenceCalculator.ts:198-215` 的 interval>1 覆盖 | 数据错误 |
| 5 | **TOCTOU 数据丢失** — 5 个文件 `vault.read()+modify()` 改为 `vault.process()` | 数据丢失 |
| 6 | **添加 CI/CD** — `.github/workflows/` 自动构建和发布 | 商店上架 |
| 7 | **EmbeddedNoteEditor 消失** — 修复 `EmbeddedNoteEditor.ts:84-85` 和容器引用失效 | 功能损坏 |

### 16.3 应当修复（P1）

| # | 问题 |
|---|------|
| 8 | 删除死代码：3 个零引用源文件、2 个无用 barrel、2 个死 settings builder、`frappe-gantt` 依赖、`conditional.ts` 空函数 |
| 9 | 提取 6 个 `BaseViewRenderer` / `TaskCardRenderer` 重复方法 |
| 10 | 提取 sort state 管理到 `BaseViewRenderer`（4 个视图的重复） |
| 11 | 提取拖拽逻辑到共享工具（3 个视图的重复） |
| 12 | 替换 `plugin: any` 为正确类型导入（20+ 文件） |
| 13 | 消除 `(task as any)[field]` 双重断言（8+ 文件） |
| 14 | `svgGanttRenderer.ts` 添加 destroy 清理 scroll sync/resizer 监听器 |
| 15 | README 补充网络使用和外部账户披露 |

### 16.4 建议改进（P2）

| # | 问题 |
|---|------|
| 16 | BEM 合规：全项目统一使用 bem.ts 常量 |
| 17 | CSS 清理：删除 ~10 个未使用类、合并重复规则、替换 53 处硬编码颜色为 CSS 变量 |
| 18 | 提取 BaseTaskModal 中 `addStyles` 的 250 行 CSS-in-JS |
| 19 | 消除 12+ settings builder 中重复的 `addSetting` 包装函数 |
| 20 | 定义 6 个日期字段的统一来源 |
| 21 | 添加 i18n 基础（提取硬编码中文字符串） |
| 22 | 拆分 `BaseTaskModal.ts`（1258 行）、`svgGanttRenderer.ts`（2000+ 行） |
| 23 | 补充 v1.5.13 ~ v1.5.18 的 git tag |
| 24 | 修复 `solarTerm.ts` 用天文计算替代固定日期表 |
| 25 | 修复 `versionTracker.ts:169-171` 版本 0 被跳过的 bug |
| 26 | 实现 `syncManager.ts` 中 `applyRemoteChanges` 的空存根 |
| 27 | 修复 `week.ts:68` 的 `isCurrentMonth` 硬编码 |

---

> **审查结论**: 项目架构设计合理，功能丰富，但代码质量存在显著技术债。最紧迫的问题是：OAuth 安全泄露、3 个重复任务计算 bug、5 处数据丢失风险、嵌入式编辑器渲染损坏，以及社区商店上架所需 CI/CD 的完全缺失。测试覆盖率 0% 是最严重的工程缺陷——约 35,000 行代码无任何自动化验证保护。
