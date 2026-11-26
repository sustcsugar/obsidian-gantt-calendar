# Obsidian Gantt Calendar Tree

[English](./README.md)

基于 [obsidian-gantt-calendar](https://github.com/sustcsugar/obsidian-gantt-calendar)（基线 `v1.6.2`，commit `1d2f00e`）二次开发的本地独立版插件，专为 Obsidian 中的**多项目、多型号并行研发排期**场景打造。

本插件使用独立身份标识（`id: "gantt-calendar-tree"`，显示名 **Gantt Calendar Tree**），可与原版插件在同一个 Obsidian 库中**零冲突并存运行**，在保留原版日/周/月/年/任务/侧边栏视图、周期任务及飞书同步等全部能力的基础上，为甘特图引入了完整的树形分组、缩进父子任务、汇总括号条、进度百分比与原子联动顺延体系。

---

## 目录

- [核心扩展特性](#核心扩展特性)
- [推荐目录结构与 Markdown 书写契约](#推荐目录结构与-markdown-书写契约)
- [安装与并存说明](#安装与并存说明)
- [甘特图控制栏与设置项](#甘特图控制栏与设置项)
- [完整保留的原版能力](#完整保留的原版能力)
- [开发、测试与打包](#开发测试与打包)
- [致谢与许可证](#致谢与许可证)

---

## 核心扩展特性

### 1. 四级树形泳道与分组维度切换
- **四级树形分组**：原生支持 `项目文件夹 → 型号文档（.md） → 父任务 → 多级缩进子任务（无限层级）`，不同型号文档中的同名工序严格按所属型号聚拢，不再互相穿插。
- **分组维度一键切换**：支持在「**项目→型号**」与「**仅按型号**」两种维度之间自由切换（后者直接跨项目平铺所有型号便于横向对比工期），且文件与任务的折叠状态在切换维度时无损保留。
- **树形 / 平铺双模式与状态持久化**：支持在「**树形分组**」与「**原版平铺**」之间一键切换；显示模式、分组维度与全部节点折叠状态自动持久化至 `data.json`，切换视图或重启 Obsidian 后完整恢复。
- **确定性排序**：文件夹与文档按 `zh-CN` 自然序排布（确保 `Item-2 → Item-10 → Plan-B`）；同级任务按 `开始日期 → 截止日期 → 原文档行号` 严格升序排列。

### 2. 两阶段缩进解析器与虚拟父节点隔离
- **冷启动与实时编辑统一解析**：冷启动扫描、重命名、新建与实时编辑全部收口至 `parseTasksFromContent()` 两阶段解析器，自动跳过 YAML Frontmatter 及 `` ``` `` / `~~~` 围栏代码块内的伪任务；冷启动结合 `metadataCache.listItems` 预筛优化大库扫描速度。
- **单调缩进栈**：按 `1 Tab = 4 spaces` 归一化宽度，兼容 Tab/空格混用与跨级跳跃缩进（`0 → 6 → 2`）；空行与缩进备注不断开父子链，标题（`#`）、分割线或零缩进正文段落自动清栈防止跨章节误挂。
- **虚拟父节点保留与旧视图隔离**：开启全局筛选标记（如 `🎯 `）时，自身未带标记但包含合规子孙的父任务会被保留为虚拟容器（`isVirtualContainer = true`）用于支撑甘特图树结构；`TaskStore.getAllTasks()` 默认过滤虚拟容器，确保日/周/月/年/任务视图、侧边栏、状态栏与同步模块零脏数据。
- **有日期父任务下无日期子项继承**：有排期父任务下方的无日期缩进子检查项会自动保留并继承父任务时间跨度（右侧渲染为半透明虚线轮廓条，拖动即可为其单独写入显式排期）。

### 3. 汇总括号条与实时进度百分比
- **经典甘特汇总括号条**：项目文件夹、型号文档及无日期/虚拟父阶段以经典向下微尖角括号 `<path>` 渲染，支持单日/极窄宽度防畸变保护，并与左侧树形列的浅底色逐行横向对齐。
- **递归完成率与进度填充**：递归统计各级子树的 `已完成数 / 总任务数` 与完成率，在汇总括号条内部绘制实时进度填充层（100% 自动变为完成绿色）、尾部标注百分比（如 `60%`）、左侧项目/型号徽标显示 `已完成/总数`（如 `2/5`），并在悬停 Tooltip 中展示节点层级、起止跨度、含首尾天数、包含任务数与完成进度。
- **子任务越界微提醒**：自带手写日期的实体父任务若存在子任务跨度超出自身范围，不篡改用户手写日期且保持可拖拽，同时在条体显示细虚线警示描边、行尾显示 `⚠` 与 Tooltip 提示。

### 4. 筛选联动剪枝、实时搜索与视口防跳动
- **多维度实时搜索**：甘特图内嵌搜索框支持同时匹配任务文本、型号文件名与项目文件夹名，并与顶部状态筛选、层级标签筛选无缝联动。
- **祖先链保留与汇总重算**：搜索或筛选命中子任务时自动保留其完整 `项目 → 型号 → 父任务` 路径，各级汇总括号条自动收缩至当前可见匹配项跨度。
- **列宽截断与滚动位置保持**：左侧树列支持拖动分割线实时同步 `<foreignObject>` 宽度，单行省略号截断绝不折行撑高行高；折叠、展开或输入搜索词重绘时保持当前 `scrollLeft` / `scrollTop`，不再跳回「今天」。

### 5. 安全防漂移回写与父任务原子顺延
- **汇总条双层只读保护**：汇总括号条无拉伸手柄、不绑定拖拽事件，并在事件回调与更新处理器双层拦截，绝不触发误写。
- **虚拟父节点无破坏复选框回写**：勾选/取消勾选不带 `globalFilter` 的虚拟父节点时，在 `withFileLock()` 下按原文校验定位并原地替换 `[ ]` ↔ `[x]`，100% 保留缩进、列表标记与原文，**绝不强行注入 `globalFilter` 标记**。
- **严格防漂移与 Windows CRLF 保留**：`locateTaskLineStrict()` 在同名歧义或目标行丢失时安全拒绝写入，防止错行覆盖；写回时严格保留原文件 `\r\n` 行尾。
- **父任务拖拽原子顺延（可选开关）**：在设置中开启「**拖拽父任务时联动平移子任务**」后，整体平移有日期的父任务时通过 `app.vault.process()` 单次原子更新父任务与全部带日期的后代，并提供一键「**撤销**」（撤销前逐行预校验，防止覆盖外部编辑）。

---

## 推荐目录结构与 Markdown 书写契约

```text
Projects/                          # 可在设置中填为「甘特图树形根目录」（留空则按全库分组）
├── 项目Alpha/                      # Level 0：项目文件夹
│   ├── Model-A.md                 # Level 1：子项目 / 文档
│   ├── Model-B.md
│   └── Model-C.md
└── 项目Beta/
    └── Release-1.md
```

单个文档（如 `Projects/项目Alpha/Model-A.md`）书写示例：

```markdown
## 节点排期
- [ ] 设计阶段
  - [ ] 方案评审 🛫 2026-09-10 📅 2026-09-17
  - [ ] 核心实现 🛫 2026-09-18 📅 2026-09-25
- [ ] 验证阶段 🛫 2026-09-20 📅 2026-10-05
  - [ ] 集成联调 🛫 2026-09-20 📅 2026-09-28
  - [ ] 验收评审 🛫 2026-09-29 📅 2026-10-05
  - [ ] 评审前资料归档（无日期子项自动继承父任务日期）
```

> 100% 兼容纯文本标准 Markdown（Tasks emoji 与 Dataview 行内字段双格式），不引入任何私有语法。

---

## 安装与并存说明

### 环境要求
- **Obsidian**：`1.13.0` 及以上（桌面端与移动端均支持，`isDesktopOnly: false`）。

### 手动安装步骤
1. 本地构建（`npm install && npm run build`）或直接获取 `dist/gantt-calendar-tree/` 文件夹（或解压 `dist/gantt-calendar-tree-v1.6.2.zip`）。
2. 将三件套放入 Obsidian 插件目录：
   ```text
   <你的库>\.obsidian\plugins\gantt-calendar-tree\
   ├── main.js
   ├── manifest.json
   └── styles.css
   ```
3. 打开 Obsidian「**设置 → 第三方插件**」，点击刷新图标并启用 **Gantt Calendar Tree**。

> **并存说明**：本插件采用独立插件 ID（`gantt-calendar-tree`）、视图 ID（`gantt-calendar-tree-view` / `gantt-calendar-tree-sidebar-view`）与存储键（`gantt-calendar-view-filters-tree`），可直接与原版 `Gantt Calendar` 同时启用。
>
> **首次启用提示**：全新安装时「全局任务筛选标记」默认为 `🎯 `。如果你的笔记任务未以 `🎯 ` 开头，请在「**设置 → Gantt Calendar Tree → 任务**」中将其清空（或直接将原版 `.obsidian/plugins/gantt-calendar/data.json` 复制到 `.obsidian/plugins/gantt-calendar-tree/data.json` 后重载插件以一键继承配置）。

---

## 甘特图控制栏与设置项

### 甘特图顶部内嵌控制栏
- **树形分组 / 原版平铺**：在树形泳道与原版扁平甘特图之间切换。
- **项目→型号 / 仅按型号**：按项目文件夹分层，或直接跨项目平铺对比全部型号。
- **全部展开 / 收起至型号 / 全部折叠**：一键纵览多型号汇总大盘或展开明细。
- **关键词搜索框**：实时检索任务标题、型号名与项目文件夹名，带一键清空按钮。

### 甘特图专属设置（**设置 → Gantt Calendar Tree → 甘特图**）
| 设置项 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `ganttStartField` | `startDate` | 甘特条起始日期字段（缺省时统一按回退链解析 `createdDate` / `startDate`）。 |
| `ganttEndField` | `dueDate` | 甘特条结束日期字段。 |
| `ganttRootFolder` | `""` | 仅作用于甘特图树形模式的目录范围与前缀剥离（分段大小写不敏感，不影响日/周/月/年/任务视图的全库扫描）。 |
| `ganttCascadeParentDrag` | `false` | 开启后，整体平移有日期的父任务时通过 `vault.process` 原子顺延同文件内所有带日期后代，支持一键撤销。 |
| `ganttDisplayMode` / `ganttGroupMode` / `ganttCollapsedIds` | `'tree'` / `'project-model'` / `[]` | 自动持久化至 `data.json`，重启后自动恢复。 |

---

## 完整保留的原版能力

原版 `obsidian-gantt-calendar` 的全部核心能力均完整保留且零回归：
- **六大视图与右侧边栏**：日 / 周 / 月 / 年 / 任务 / 甘特图 + 侧边栏（任务列表 + 每日时间线）。
- **双格式兼容**：原生读写 Tasks emoji 与 Dataview 行内字段，支持分钟级时间精度（`HH:mm`）。
- **连续时间画布与移动端适配**：点击创建、15 分钟吸附拉伸（`Alt` 5 分钟微调）、触屏长按手势与底部导航 Dock。
- **农历节日与年热力图**：公历/农历节日、二十四节气与 8 种热力图配色。
- **周期任务与飞书双向同步**：跨视图虚拟周期实例与 OAuth 2.0 飞书任务双向同步。

---

## 开发、测试与打包

```bash
# 安装依赖
npm install

# 开发监听模式（esbuild）
npm run dev

# 仅执行 TypeScript 类型检查
npx tsc --noEmit

# 生产构建（输出根目录 main.js 与 styles.css）
npm run build

# 代码规范检查（ESLint + eslint-plugin-obsidianmd）
npm run lint

# 运行 Jest 单元测试
npm test
```

- 架构规格书：[SPEC_gantt_calendar_tree.md](./SPEC_gantt_calendar_tree.md)
- 树形甘特核心模块：
  - [src/constants.ts](./src/constants.ts) — 独立插件/视图/存储常量
  - [src/tasks/taskParser/main.ts](./src/tasks/taskParser/main.ts) — 两阶段缩进解析器
  - [src/gantt/dateRangeResolver.ts](./src/gantt/dateRangeResolver.ts) — 统一甘特图日期范围与回退解析器
  - [src/gantt/treeBuilder.ts](./src/gantt/treeBuilder.ts) — 纯函数树构建、筛选剪枝、汇总进度与展平引擎
  - [src/gantt/wrappers/rollupGeometry.ts](./src/gantt/wrappers/rollupGeometry.ts) — 汇总括号条与进度填充层几何计算
  - [src/tasks/taskUpdater.ts](./src/tasks/taskUpdater.ts) 与 [src/tasks/taskUndo.ts](./src/tasks/taskUndo.ts) — 严格防漂移回写、虚拟父节点无破坏勾选及 `vault.process` 原子顺延撤销

---

## 致谢与许可证

- 基于 [Sugar](https://github.com/sustcsugar) 的开源项目 [obsidian-gantt-calendar](https://github.com/sustcsugar/obsidian-gantt-calendar) 扩展开发。
- 遵循上游仓库相同的开源协议（见 [LICENSE](./LICENSE)）。
