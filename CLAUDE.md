# CLAUDE.md

本文件为 Claude Code 在此代码库中工作时提供指导。

## 构建

```bash
npm run dev          # esbuild watch 模式
npm run build        # tsc 类型检查 + esbuild 生产打包 + 同步到 example vault
```

构建产物为 `main.js`（单文件 CJS bundle，外部依赖 `obsidian`、`electron`）。

**测试**：`src/data-layer/__tests__/` 下有少量 Jest 测试，`package.json` 未配置 test 脚本，直接 `npx jest` 运行。

## 架构

### 视图层级

- `main.ts` 注册 2 个 Obsidian ItemView：`GCMainView`（主日历视图）和 `GCSidebarView`（右侧栏）
- `GCMainView` 持有 6 个渲染器，均继承抽象类 `BaseViewRenderer`：`YearView`、`MonthView`、`WeekView`、`DayView`、`TaskView`、`GanttView`
- `GCSidebarView` 持有 `TaskListTab`（搜索筛选排序）和 `DailyTimelineTab`（今日时间轴+拖拽）
- `BaseViewRenderer` 提供过滤状态管理、DOM 清理注册、优先级/状态颜色渲染、工具提示复用

### 数据层（分层架构）

```
TaskStore（门面，供视图使用）
  ├── EventBus（发布-订阅事件系统）
  ├── TaskRepository（仓库模式，内存 Map 缓存 + 文件索引）
  │   └── MarkdownDataSource（扫描 vault 文件，50 个一批，metadataCache 解析）
  └── SyncManager（可选，通过 SyncManagerBridge 连接）
```

- `TaskStore.getAllTasks()` 返回缓存结果，缓存通过防抖（75ms）失效
- `MarkdownDataSource` 文件修改事件防抖 50ms，处理 create/modify/delete/rename
- 任务解析采用四步流水线：`step1` 正则匹配 → `step2` 全局筛选符 → `step3` 格式检测 → `step4` 属性解析

### 同步系统

支持飞书双向任务同步，CalDAV 基础设施已搭建：
- `src/data-layer/feishu-sync/FeishuTaskSync.ts` — 自包含双向同步引擎
- `src/data-layer/sources/api/providers/feishu/` — 完整飞书 API 客户端（OAuth、Task、Calendar、User API）
- `src/data-layer/sync/SyncManager.ts` — 多源同步编排（拉取→匹配→冲突检测→解决→本地应用→推送 共 6 阶段）
- `src/data-layer/sources/caldav/` — Google/Apple/Outlook CalDAV 提供者基础设施
- 同步配置位于 `plugin.syncConfiguration`，飞书状态持久化于 `.feishu-sync-state.json`

### 甘特图

**`frappe-gantt` npm 依赖已不再使用**。实际实现是自定义 SVG 渲染引擎 `src/gantt/wrappers/svgGanttRenderer.ts`，支持拖动整体/端点、导航按钮、增量刷新。

### 设置系统

`SettingTab.ts` 使用 Builder 模式，14 个 builder 各负责一个设置区域。`FestivalColorBuilder` 和 `TaskStatusSettingsBuilder` 已创建但**未接入**设置面板。

## 关键约定

**ALWAYS 遵守：**
- **DOM 类名**：在 `src/utils/bem.ts` 中定义 BEM 块常量并引用，禁止硬编码字符串
- **正则表达式**：在 `src/utils/RegularExpressions.ts` 中定义并引用，禁止内联正则
- **任务悬浮窗**：复用 `src/utils/tooltipManager.ts`，禁止自行实现
- **任务条目更新**：使用 `updateTaskProperties()` 函数，禁止直接操作 markdown 文本
- **修改 DOM/样式前**：先检查并移除已废弃的旧类名

**代码模式：**
- 各视图在 `src/components/TaskCard/presets/` 下有对应配置 preset
- 右键菜单命令在 `src/contextMenu/commands/`，通过 `contextMenuIndex.ts` 统一注册
- 视图过滤状态按键名 `${viewName}SelectedStatuses`/`${viewName}SelectedTags` 持久化

## 注意事项

- **Windows 环境**：Git Bash 中 `2>nul` 会创建实体文件而非重定向，始终使用 `2>/dev/null` 或专用工具（Glob/Grep）
- **TypeScript**：`strictNullChecks: true`、`noImplicitAny: true`、`importHelpers: true`、target ES6
- **ESLint**：`no-unused-vars` 为 error（允许 `args` 前缀），`ban-ts-comment` 关闭

## Git 规则

- **NEVER 自动 commit 或 push** — 仅当用户明确要求时执行
- 允许 `npm run build`、`git status`、`git diff` 等验证性操作
- `npm run version` 用于 bump manifest.json + versions.json
