# UI 现代化改造调研报告（feat/modern-ui）

> 日期：2026-09-03
> 目标：月视图/年视图视觉现代化——圆角、柔和阴影、层次感（扁平 + 阴影的"现代圆润风"），对标现代日历软件与生产力 SaaS。
> 结论：**不引入重型 UI 组件库**，主路线为"保留现有 React 结构 + 视觉层（CSS/token）重构"；年视图热力图可选 `react-activity-calendar`（MIT、~23KB）或自研 SVG。

---

## 一、现状诊断（为什么显"生硬"）

代码层面已具备不错的底子：`src/styles/tokens.css` 已有完整设计 token（圆角 4-12px、四级 elevation 阴影、4px 间距网格、动效曲线），技术栈 React 19 + zustand 5 + **motion（framer-motion 后继，动画能力现成）**。问题集中在视图层 CSS：

### 月视图（`src/ui/views/MonthView.tsx` + `src/styles/components/tooltip.css` / `theme.css` / `base.css`）
| 问题 | 位置 | 现状 |
|---|---|---|
| 铁丝网格线 | `.gc-month-view__day-cell` | `border-top/right: 2px solid` 硬拼表格线，无 gap、无圆角 |
| 今天高亮过重 | `.gc-month-view__day-cell--today` | 整格刷成红色 `#ff6b6b`，视觉噪音大 |
| 日期头部生硬 | `.gc-month-view__day-header` | `border-bottom` 分隔线 + 硬编码的 4px 圆点分隔元素 |
| 字号失衡 | day-number / lunar-text | 均为 18px，数字与农历同权重 |
| 网格容器 | `.gc-view--month` | `gap: 0`，格子完全贴边 |

### 年视图（`src/ui/views/YearView.tsx` + `src/styles/components/heatmap.css` / `views/month-view.css`）
| 问题 | 现状 |
|---|---|
| 热力图填色 | 9 色 × 5 级硬编码 rgba 平铺填充，无描边、无 hover 反馈 |
| "3D 效果" | `heatmap-3d-*` 用 inset 白/黑阴影模拟凸起，拟物风过时 |
| 今天标记 | 红色虚线圆圈（`::before` + `border: 2px dashed`），与整体风格脱节 |
| 月卡片 | `border-radius: 6px` + 1px gap，密度高、无层次 |
| 文件错位 | `month-view.css` 里装的实际是年视图月卡片样式（注释也标错为 "Year View"） |

---

## 二、月视图 React 日历组件对比（Obsidian 场景）

Obsidian 插件约束：全局 CSS 需前缀隔离、bundle 敏感、需适配深浅主题（优先桥接 Obsidian 400+ CSS 变量）、license 宽松。

| 候选 | 体积(gzip) | 强依赖 | License | 月视图事件条/拖拽 | Obsidian 适配 |
|---|---|---|---|---|---|
| **react-day-picker v9** | ~19KB | date-fns(可选) | MIT | ❌ 需自建事件层 | **低**（class/CSS 变量全控） |
| **FullCalendar Standard** | 35-50KB | 无（模块化） | **MIT**（Standard 部分） | ✅ 开箱即得 | 中（`.fc` scoped + `--fc-*` 变量） |
| **Schedule-X** | 数十 KB | 无 | 核心 MIT，高级付费 | ✅（社区版） | 中（生态年轻，无先例） |
| react-big-calendar | ~53KB | localizer 必装 | MIT | ✅ | 中高（默认观感即"生硬"风） |
| MUI X | 58KB + MUI/Emotion ~100KB | Material 体系 | 部分商业 | ✅ | 高难度（Scheduler 仍在 beta，有已知 bug） |
| antd / Arco / Semi Calendar | 单组件实际增量 100KB+ | rc-*/dayjs/cssinjs | MIT | 有 | 高难度（为一个组件引整套设计系统不值） |
| react-calendar | 7.7KB | 零依赖 | MIT | ❌ 纯日期网格 | 低（`tileContent` 可塞自定义内容） |
| HeroUI Calendar | 42.8KB | **Tailwind 强依赖**（v2 还要 framer-motion） | MIT（Pro Agenda 商业） | ❌（在付费 Pro） | 中高（Tailwind 进 Obsidian 坑多） |

**关键判断**：本插件月视图深度耦合农历/节日/节气、周数、重复任务虚拟实例、TaskCard、跨日拖拽写回——任何第三方日历都只提供"空白格子底座"，这些内容层仍要自己叠。而我们已有等价的格子生成（`calendarGenerator.ts`）与拖拽链路，**换库只增加体积与适配层，解决不了视觉问题（视觉问题 90% 在 CSS）**。故月视图推荐：保留现有结构，按 Google Calendar / Notion Calendar / shadcn Calendar blocks / Semi 的设计规格重写视觉层。shadcn 的"copy-paste 源码"模式值得借鉴思路，但其 Calendar 是 Tailwind class 写的，直接拷需手动改写为普通 CSS。

## 三、年视图热力图组件对比

| 库 | 体积(min) | 运行时依赖 | 圆角格子 | 结论 |
|---|---|---|---|---|
| **react-activity-calendar 3.2.1** | ~23KB（gzip ~8KB） | date-fns、@floating-ui/react | ✅ `blockRadius` 可调 | **首选**：GitHub 官方同款观感，`colorScheme` 5 级深浅两套、`renderBlock` 完全接管格子、内置 tooltip/深色跟随/reduced-motion |
| @visx/heatmap | 本体 1.7KB | @visx/group | ✅ `rx` 透传 + `gap` 内建 | 备选：极小但 tooltip/标签/图例全自建 ≈ 半自研 |
| cal-heatmap v4 | ~155KB | dayjs/d3 系/lodash-es/@observablehq/plot | ✅ | 不推荐（重 + 命令式 API 与 React 有摩擦） |
| @nivo/calendar | 实际 100KB+ | d3-scale/lodash 等 12 个 | ❌ 源码 0 处 rx | 排除（无圆角，硬伤） |
| recharts | 561KB | @reduxjs/toolkit 等 11 个 | ❌ 无 heatmap | 排除 |

**GitHub 热力图视觉基准（2024-2025）**：
- 浅色 L0-L4：`#ebedf0 → #9be9a8 → #40c463 → #30a14e → #216e39`
- 深色 L0-L4：`#161b22 → #0e4429 → #006d32 → #26a641 → #39d353`（**亮度方向反转：越亮=越多**，深色热力图最关键的细节）
- 几何：12px 方格 + 4px 间距 + rx=2；深色模式靠"表面提亮"而非描边区隔空格子
- 现代化：圆角提到 3-4px、空格子用 surface 色不用纯灰、色阶从主题 accent 派生、hover scale 1.1 + tooltip

注意：现年视图是"12 张迷你月卡片 + 格子填色"布局，与 GitHub 贡献图是两种形态。两条路：① 保留月卡片布局，只重做格子视觉（圆角、色阶、描边、去 3D）；② 顶部加一条 GitHub 式年度贡献图（引入 react-activity-calendar 或自研 53×7 SVG）作为总览，下方保留月卡片。路线 ② 视觉冲击更强，路线 ① 改动最小。

## 四、开源 SaaS 设计语言要点（可抄的规范）

- **cal.com（coss.com/ui，token 全开源）**：`--radius` 基准 10px，calc 派生 6/8/10/14px + 药丸 9999px；浅色 border=黑 8%、muted=黑 4%；深色 card=背景混 2% 白、popover=4%、border=白 6%——**背景 → 卡片(+2% 提亮) → 弹出层(+4%)** 的层级公式。
- **Linear**：深色界面投影几乎不可见，elevation 靠**半透明 hairline 边框 + 微内阴影 + 表面逐层提亮**；LCH 色彩空间从三个变量生成整套主题。
- **Huly / Plane / AFFiNE**：卡片圆角 10-14px、低饱和点缀色、hairline 分层。
- **Notion Calendar**：极简克制；反面教材是深色模式层次偏平——提醒我们**深色要靠表面梯度而不是纯黑/纯投影**。

### 阴影体系（浅色用，深色基本弃用）
```
shadow-xs: 0 1px 2px rgb(0 0 0 / 0.05)
shadow-sm: 0 1px 3px rgb(0 0 0 / 0.08), 0 1px 2px rgb(0 0 0 / 0.04)
shadow-md: 0 4px 8px -2px rgb(0 0 0 / 0.10), 0 2px 4px -2px rgb(0 0 0 / 0.06)
shadow-lg: 0 12px 24px -6px rgb(0 0 0 / 0.12), 0 8px 12px -6px rgb(0 0 0 / 0.07)
```

### 日历 UI 通用模式
- 格子分隔：**格子间 1-2px gap 让背景透出**，每格自身小圆角 4-6px（替代铁丝网格线）
- 事件条：药丸形（全圆角，高 20-24px，左侧 2-3px 强色条）或 4px 圆角小方块；每格最多 2-3 条，溢出 "+N"
- 今天：**accent 实心圆/圆角方块反白数字** + 当日列 4-8% accent 淡底（Apple Calendar 式）
- 非当月日期：文字 30-40% 透明度弱化；周末可加 2% 灰底

### 可直接落地的 token 骨架（挂 `.theme-light/.theme-dark` 作用域，桥接 Obsidian 变量）
```css
.gc-plugin {
  --gc-radius: 10px;
  --gc-radius-sm: calc(var(--gc-radius) - 4px);  /* 6px chip */
  --gc-radius-md: calc(var(--gc-radius) - 2px);  /* 8px 输入框 */
  --gc-radius-lg: var(--gc-radius);              /* 10px 卡片 */
  --gc-radius-xl: calc(var(--gc-radius) + 4px);  /* 14px 大卡/弹窗 */
  --gc-radius-pill: 9999px;
}
.theme-light .gc-plugin {
  --gc-border: rgb(0 0 0 / 0.08);
  --gc-heat-0: var(--background-secondary);
  --gc-heat-1: hsl(from var(--interactive-accent) h s 88%);
  --gc-heat-2: hsl(from var(--interactive-accent) h s 72%);
  --gc-heat-3: hsl(from var(--interactive-accent) h s 55%);
  --gc-heat-4: hsl(from var(--interactive-accent) h calc(s * 0.85) 38%);
}
.theme-dark .gc-plugin {
  --gc-border: rgb(255 255 255 / 0.06);
  --gc-shadow-xs: none; --gc-shadow-sm: none;  /* 深色靠边框分层 */
  --gc-heat-0: rgb(255 255 255 / 0.04);
  --gc-heat-1: hsl(from var(--interactive-accent) h s 25%);
  --gc-heat-2: hsl(from var(--interactive-accent) h s 42%);
  --gc-heat-3: hsl(from var(--interactive-accent) h s 62%);
  --gc-heat-4: hsl(from var(--interactive-accent) h s 78%);
}
```
（注意：`hsl from` 相对色语法需 Chromium 119+，Obsidian 新版满足；需验证目标环境，否则退化为预置色板。）

## 五、推荐实施路线

- **Phase 1 — token 升级**：`tokens.css` 增补/替换为上述深浅双套 token（surface 层级、hairline border、新版阴影、热力色阶）。
- **Phase 2 — 月视图视觉重构**：CSS 为主 + 少量 TSX。格子 gap 化 + 圆角、去 2px 铁丝线、今天改 accent 圆徽标、任务条药丸化（motion 已有，可加入场动画）、日期头部去分隔线改悬浮层次。
- **Phase 3 — 年视图重构**：月卡片圆角 + 柔和阴影 + gap 网格、热力格子圆角 + 新色阶（深浅两套）、去掉拟物 3D 选项、今天改 accent 环。
- **Phase 4（可选）— 年度贡献图**：引入 react-activity-calendar（或自研 SVG）加 GitHub 式年度总览条。

## 六、调研 Sources（节选）

- react-day-picker: https://www.npmjs.com/package/react-day-picker · shadcn Calendar: https://ui.shadcn.com/docs/components/base/calendar
- FullCalendar license: https://fullcalendar.io/pricing · Schedule-X: https://schedule-x.dev/
- react-activity-calendar: https://github.com/grubersjoe/react-activity-calendar · @visx/heatmap: https://visx.dev/
- cal.com 设计系统: https://coss.com/ui/docs · token 实测: https://github.com/cosscom/coss/blob/main/packages/ui/src/styles/globals.css
- Linear UI 重设计: https://linear.app/now/how-we-redesigned-the-linear-ui
- GitHub 热力图色阶: https://gist.github.com/phixion/41ed0d052c58b674dc77cc4dfdd10651
- 日历 UI 模式: https://www.eleken.co/blog-posts/calendar-ui · https://uxpatterns.dev/patterns/data-display/calendar · https://demo.mobiscroll.com/eventcalendar/event-labels
