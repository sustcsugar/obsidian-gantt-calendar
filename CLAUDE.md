# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此代码库中工作时提供指导。

## 构建命令

```bash
npm install              # 安装依赖
npm run dev             # 开发构建，支持热重载
npm run build           # 生产构建（运行 tsc + esbuild）
```

**重要**：构建完成后，需将 `main.js`、`manifest.json` 和 `styles.css` 复制到 `<Vault>/.obsidian/plugins/obsidian-gantt-calendar/`，然后重新加载 Obsidian 进行测试。

## 项目概述

这是一个 Obsidian 插件，提供带有甘特图功能的日历视图和任务管理。支持 Tasks 插件（emoji 格式）和 Dataview 插件（field 格式）两种任务格式。

## 架构

### 入口点
- `main.ts` - 插件生命周期（onload/onunload），注册视图、命令和事件监听器
- `GCMainView.ts` - 主视图容器，管理所有子视图

### 视图系统
插件使用基类模式构建视图：
- `BaseViewRenderer` - 所有视图的共享方法（任务渲染、工具提示、链接解析）
- 各视图继承此基类：`YearView`、`MonthView`、`WeekView`、`DayView`、`TaskView`、`GanttView`

### 工具栏系统
`src/toolbar/` 中的三区域布局：
- **左侧**：视图切换（日历 ↔ 任务）
- **中间**：日期范围/标题显示
- **右侧**：导航按钮（因视图而异）

### 任务管理
- `src/tasks/taskParser.ts` - 解析 Tasks（emoji）和 Dataview（field）格式
- `src/tasks/taskSearch.ts` - 按日期/状态过滤任务
- `src/data-layer` - 负责任务缓存的管理

### 任务格式兼容性

**Tasks 格式（emoji）**：
```
- [x] 🎯  任务全格式 🔺 🔁 every day ➕ 2026-01-15 🛫 2026-01-19 ⏳ 2026-01-17 📅 2026-01-21 ✅ 2026-01-15
```

**Dataview 格式（field）**：
```
- [x] 🎯  dataview任务格式  [priority:: highest]  [repeat:: every day]  [created:: 2026-01-15]  [start:: 2026-01-16]  [scheduled:: 2026-01-16]  [due:: 2026-01-15]  [completion:: 2026-01-15]
```

优先级：`🔺`（最高）、`⏫`（高）、`🔼`（中）、`🔽`（低）、`⏬`（最低）
日期 emoji：`➕`（创建日期）、`🛫`（开始日期）、`⏳`（计划日期）、`📅`（到期日期）、`✅`（完成日期）、`❌`（取消日期）
重复任务: `🔁` every day

## 代码统一管理规范
DOM类名统一使用 ./src/utils/bem.ts 进行管理, 新建类名需在此文件中进行定义并引用
正则表达式统一使用 ./src/utils/RegularExpression.ts 进行管理.
全局任务悬浮窗统一复用 ./src/utils/tooltipManager.ts
任务条目更新统一复用 updateTaskProperties函数进行.

## Git 提交规范

**重要规则**：
- ❌ **禁止自动提交**：完成代码修改后，不要自动执行 `git commit` 或 `git push`
- ✅ **等待用户指示**：仅当用户明确要求提交时，才执行 Git 提交操作
- ✅ **可以运行构建**：修改代码后可以运行 `npm run build` 进行验证
- ✅ **可以查看状态**：可以使用 `git status`、`git diff` 等命令查看修改状态
