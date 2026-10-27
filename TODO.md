# TODO — 项目待办与进度追踪

> **会话规则（每次会话必读必做）**
> 1. **会话开始**：先读取本文件，了解进行中事项与上次进度
> 2. **会话中**：用户新提出的需求/功能/修复 → 及时追加到本文件对应章节
> 3. **会话结束**：将本次实际完成的事项标记为 `- [x]`，并移入「已完成」区注明日期
> 4. 遵守项目 Git 规则：**绝不自动 commit 或 push**

---

## 📌 进行中

（暂无）

---

## ✅ 已完成（按日期倒序）

### 2026-10-27
- [x] dateFilterField 设置退场，单日期任务锚定改为内置回退链 due→scheduled→start：新增 resolveAnchorDateField（src/types.ts），timelineModel 三个模型构建器与 getTaskInterval 去 dateField 参数改为链内解析，拖拽写入目标 = 锚定字段 ?? ganttEndField，generateVirtualInstances 第 4 参改可选（任务视图仍传 taskViewTimeFieldFilter，甘特仍传 ganttStartField），TaskCard 重复任务完成写入走链；设置项/常量/i18n 键移除；tsc + 437 Jest 用例（新增回退链 6 例）+ build 全部通过

### 2026-10-16
- [x] T15.1 飞书同步日期+时间精度适配修复：完成 is_all_day 透传、双向精度检测、日期/完成时间归一化、哈希与合并适配；通过 tsc、431 个 Jest 测试和 npm run build

### 2026-10-15
- [x] T1 TypeScript 5.x + 全量 strict：升级 TypeScript，收紧 tsconfig/test 配置，删除 deprecated 转发层 `src/tasks/taskParser.ts`
- [x] T2 删除确认 + deleteTask 加固：确认交互、文件锁保护和删除后按原始行索引可靠恢复
- [x] T3 首扫批量事件：避免逐任务定时器刷新，首扫完成后统一发布批量事件
- [x] T4 状态栏统计防抖：合并高频刷新，通过值比对减少无效更新
- [x] T5 任务操作撤销：属性变更与删除任务支持 Notice 撤销按钮，采用单槽撤销策略

### 2026-10-13
- [x] `.gitattributes` 统一 LF，根治 CRLF 幻影修改（1210f51）
- [x] P1 性能：首扫完成后不再整视图重挂（300a5c1）
- [x] P0 性能：启动 Load layout ~10s 卡顿根治，骨架屏 + 异步首扫（11e458b）
- [x] 移动端导航 Dock + 桌面窄窗口日视图适配（d638089）
- [x] README 双语更新：秒开启动 / 导航 Dock / 窄窗口适配（本次会话）
- [x] 创建 AGENTS.md 会话协议：会话开始/结束必须读取 TODO.md
- [x] 创建本 TODO.md 追踪体系

### 2026-10-12 及更早
- [x] 1.6.2 发布，官方审查通过（9b437de）
- [x] 设置页 1.11/1.12 兼容层移除，minAppVersion → 1.13.0（a061309）
- [x] 任务弹窗打开卡顿三轮修复（5ea4dde）

---

## 📋 待办 — 全面改进计划（17 个有效任务，T12 已取消；详见 docs/plans/2026-10-12-full-improvement.md）

### Phase A — 基础设施与安全网
- [x] T1 TypeScript 5.x + 全量 strict
- [x] T2 删除确认 + deleteTask 加固
- [x] T3 首扫批量事件
- [x] T4 状态栏统计防抖 + 值比对
- [x] T5 任务操作撤销

### Phase B — 渲染性能
- [ ] T6 settingsVersion 退场：设置进 store
- [ ] T7 列表虚拟化 + 日期范围索引（react-virtuoso + 日期桶索引）

### Phase C — 视觉增强
- [ ] T8 CSS token 落地清扫（硬编码色 169 → <20）
- [ ] T9 优先级图标化（emoji → Lucide 单一映射源）
- [ ] T10 Modal focus trap

### Phase D — 交互增强
- [ ] T11 快捷键体系
- [ ] T13 自然语言日期轻解析
- [ ] T14 拖拽边缘自动滚动

### Phase E — 架构治理与交付
- [ ] T15 同步系统特征测试 + 口径 bug 修复
- [ ] T16 同步架构收敛：老引擎迁移至新框架
- [ ] T17 GitHub Actions CI
- [ ] T18 首次安装引导（空库示例卡）

---

## 🚫 已取消 / 不做

### T12 月格双击快速创建

- 2026-10-15：用户确认不需要，已从待办计划移除，不进入实施。

## 🔭 远期路线图（v2.0.0，来自 README Roadmap）
- [ ] 第三方日历订阅（飞书日历、Outlook 日历）
- [ ] Microsoft To Do 同步
- [ ] 通过 CalDAV 接入 Google / Apple 日历

---

## 💡 新需求（会话中提出，待排期）

### GitHub Issue #35 审查结论（2026-10-27，https://github.com/sustcsugar/obsidian-gantt-calendar/issues/35）
> 设计澄清（用户 2026-10-27）：任务视图定位是独立全功能筛选面板（自带 taskViewTimeFieldFilter，不跟 dateFilterField 联动是有意为之）；日/周/月/年时间线重设计后跨度任务由 ganttStartField/ganttEndField 驱动。#35 的「任务视图不跟设置走」部分属设计如此，非 bug，回复 issue 解释设计即可。
- [x] dateFilterField 设置退场：单日期任务改为内置回退链锚定（due→scheduled→start，resolveAnchorDateField），替代原 4 个残留角色（单日期可见性/锚定、时间线拖拽写入目标、重复任务展开字段、TaskCard 重复完成写入）；设置项与 i18n 键已移除，旧 data.json 残留键无害
- [ ] 子诉求·分视图打开命令：open-calendar-view 硬编码 switchView('month')（src/commands/common.ts:21），需增加日/周/月三条命令
- [ ] 子诉求·排序「保持原样」：SORT_OPTIONS（src/tasks/taskSorter.ts:12）无 original 项，需新增保序选项
- [ ] 子诉求·标签后置显示：extractTags 按全文匹配位置无关，预计解析层已支持，待端到端验证后回复用户
