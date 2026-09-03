# Plane UI 设计语言研究（feat/modern-ui）

> 日期：2026-09-03 · 方式：抓取 makeplane/plane 仓库（preview 分支）+ 官方设计系统 npm 包 @makeplane/propel@0.3.0 dist + plane.so 官网 CSS 交叉验证。所有 hex 由源码 oklch 换算。
> ⚠️ Plane 现行许可证为 **AGPL-3.0**：只可借鉴设计值（颜色/尺寸/结构），不可复制代码。本项目所有样式为自写 CSS，合法。

## 核心结论：Plane 的层级公式

**深色**：近纯黑画布 `#0E0F10` → 侧边栏/表面 `#141515` → 卡片 `#1D1F20`，hover 逐档 +1（`#181A1B/#1D1F20/#222425`）。层级靠 **表面提亮 + 1px 实色 hairline 边框**，阴影几乎不用（保留极轻投影）。
**浅色**：灰画布 `#F2F2F3` → 纯白表面/卡片，边框 `#EAEBEC`（hover `#D5D7D9`）。
灰阶色相锚定 230.8（青蓝灰），比 Linear（~255 紫蓝）更中性。

## 关键实测值

### 颜色
| token | 浅色 | 深色 |
|---|---|---|
| canvas | #F2F2F3 | #0E0F10 |
| surface（侧栏/主区） | #FFFFFF | #141515 |
| card（layer-2） | #FFFFFF | #1D1F20 |
| layer-1（内嵌块） | #F9F9F9 | #181A1B |
| fill-soft（layer-3） | #F2F2F3 | #222425 |
| 导航 hover / active / selected | 黑 4% / 6% / 8% | 白 5% / 7% / 10% |
| 文字 primary / secondary / tertiary | #0F0F10 / #313435 / #494D50 | #E4E6E7 / #CACDCE / #AFB3B6 |
| placeholder | #5D6265 | #959A9D |
| border subtle / strong | #EAEBEC / #D5D7D9 | #222425 / #36393A |

### 侧边栏
- 宽 250px（236-350 可拖拽）；背景 surface-1，右侧 1px border-subtle
- 导航项：高 28px（px-2 py-1）、圆角 6px、文字 13px/20px/500、图标 16px 间距 6px
- **active = 中性背景块（深色白7%/浅色黑8%）+ 文字升为 primary，不用 accent 色条/底色**（Linear 同款）
- 分组标题 13px/600 placeholder 灰，不 uppercase、无 letter-spacing
- 底部区：高 48px + border-top hairline

### 卡片（kanban block 实测 class）
- 圆角 8px + **1px border-subtle（边框是主层级手段）** + bg-layer-2 + padding 12px + 卡距 8px
- 阴影极轻：rest `0 1px 6px -1px rgb(41 47 61/.03), 0 1px 4px rgb(41 47 61/.04)`；hover = **边框加深到 strong + 阴影微升，背景不变**
- 标题 14px/500 primary（单行截断）；元信息行 mt-6px gap-8px 12-13px tertiary
- 标签 Badge：高 20px、padding 0 6px、圆角 4px、12px/500、软底同系字色、**无边框**
- hover 快捷操作按钮仅 hover 出现

### 控件（28px 锚定）
- 高度阶 20/24/28/32；padding=(h-16)/2；图标 14-16px；圆角 xs4/sm6
- Checkbox 16px、圆角 4px、未选靠 inset box-shadow 画框、选中 accent 实心白勾
- 按钮 secondary = shadow + border-strong + bg-layer-2；ghost 透明底 hover wash
- 优先级色：urgent #CE433C / high #E57525 / medium #E9B035 / low #3B73E3 / none #848D92

### 字体
Inter Variable；**regular 字重=450**（微重观感）、medium 500、semibold 600；行高 1.54。

## 本项目落地映射（feat/modern-ui 实施）

| Plane 概念 | 本项目落点 |
|---|---|
| surface/layer 分层 | Obsidian `--background-primary/secondary` 桥接（已有 --gc-bg-*） |
| hover/active/selected wash | 新增 `--gc-hover-wash`(4%/5%) `--gc-active-wash`(8%/7%) 中性洗色 token |
| 卡片 raised-100/200 阴影 | 新增 `--gc-card-shadow(-hover)` token，侧边栏/日视图/任务视图卡片采用 |
| 侧边栏导航项 28px+中性 active | `gc-sidebar__tab-btn` 从"浏览器标签"改为 Plane 导航药丸 |
| kanban 卡解剖 | `gc-task-card--sidebar` 加 1px hairline 边框 + 8px 圆角 + hover 边框加深 |
| Badge 4px 软底无边框 | `gc-task-card__time-badge` / 标签药丸对齐 |
| 控件 28px 锚定 | 搜索框/筛选按钮/下拉项尺寸对齐 |

字体（Inter/450 字重）不引入——Obsidian 用户自选界面字体，尊重之。

## Sources
- 仓库: https://github.com/makeplane/plane （packages/propel、packages/tailwind-config/index.css、packages/constants/src/sidebar.ts、apps/web/core/components/sidebar/*、apps/web/core/components/issues/issue-layouts/kanban/block.tsx）
- 设计系统包: https://www.npmjs.com/package/@makeplane/propel
- 官网: https://plane.so/
