# UI 风格指南（feat/modern-ui 视觉重构总结）

> 日期：2026-09-03 · 覆盖 commit `1c1b08b`（tokens/月视图/年视图）与 `6b45258`（Plane 风格落地）
> 设计北极星：Plane / Linear 的"边框优先、中性交互态"体系 + 现代圆润风（圆角、柔和阴影）
> 禁忌清单：不用 2px+ 铁丝网格线；不用整块 accent 刷底色做高亮；hover/active 不用 accent（accent 只做语义强调：今天、选中筛选、状态色）；深色模式不依赖投影做层次。

---

## 0. 设计原则（一句话版）

扁平为底，hairline 半透明边框承担层级，阴影只做极轻的"呼吸感"，交互态用中性灰洗色（wash）而不是彩色，accent 色只出现在有语义的地方（今天、当前时间、激活筛选、主按钮）。深浅主题双套：浅色靠"灰画布 + 白浮层 + 黑系 hairline"，深色靠"表面逐档提亮 + 白系 hairline"，同一套 token 自动适配。

## 1. 设计 Token（tokens.css）

### 圆角（全局上调一档）
| token | 旧 | 新 | 用途 |
|---|---|---|---|
| --gc-radius-xs | 4px | **6px** | 药丸/小按钮/任务条 |
| --gc-radius-sm | 6px | **8px** | 任务卡/输入框/侧边栏卡 |
| --gc-radius-md | 8px | **10px** | 月视图日期格 |
| --gc-radius-lg | 12px | **14px** | 年视图月卡片/大卡片 |
| --gc-radius-full | 999px | 不变 | 圆徽标/圆形元素 |

### 阴影（现代分层式：低透明度、大模糊、小偏移）
- elev-1 `0 1px 2px / 5%` 贴面 · elev-2 `0 1px 3px + 0 1px 2px` 卡片悬浮 · elev-3 双层下拉 · elev-4 双层模态
- 深色主题整体加重（35%-55%），但层次主要不靠它
- Plane raised 系列：`--gc-card-shadow`（rest，极轻）与 `--gc-card-shadow-hover`（微升），用于列表卡片

### 边框与交互洗色
- `--gc-border-hairline`：黑 8%（浅）/ 白 9%（深），一切"分隔与描边"的默认
- 中性 wash 三态（Plane 语法）：hover 4%/5%、active 8%/7%、selected 10%，深色自动翻白系
- accent 家族：`--gc-accent-soft`（8%/12%）、`--gc-accent-wash`（14%/18%）只用于语义强调

### 热力基色
9 色 `--gc-heat-*`（blue #3b82f6 / green #22c55e / red #ef4444 / purple #a855f7 / orange #f97316 / cyan #06b6d4 / pink #ec4899 / yellow #eab308），档位由 heatmap.css 用 color-mix 与主题背景现场混合。

## 2. 月视图（gc-month-view）

- **网格容器**：`gap: 4px` 的软网格（原 gap 0 + 2px 铁丝边框），容器内边距 8/10/10
- **星期表头**：12-13px / 600 / muted，居中，无边框，微字距；周数列 xxs / faint
- **日期格**：10px 圆角卡片，1px hairline 边框，primary 底；hover = 边框加深 + elev-2 + accent 3% 染色；键盘 focus 有 accent 描边环
- **今天**：accent 6% 洗色整格 + accent 40% 边框；日期数字变 accent 实心圆徽标（22px、反白、700）——旧版是整格刷红
- **日期头部**：左对齐（原居中 + 下边框 + 圆点分隔符，分隔元素已从 TSX 删除）；数字 13px/600 圆形徽章形制；农历走设置字号、muted 色、超长省略
- **非当月格**：secondary 底 + 0.55 整格弱化，数字 faint
- **任务药丸**：3px 8px 内边距、12px 字号、6px 圆角（修复了被修饰符压回 3px 的 bug）、2px 状态色左条、hairline 描边；"+N 更多"为 faint 小 chip，hover 有 wash
- **节日/节气**：红色（阳历节日）/ 橙色（农历）/ 绿色（节气）、600 字重——修复了被特异性覆盖导致从未生效的存量 bug

## 3. 年视图（gc-year-view，保留月卡片形态）

- **月卡片**：14px 圆角"纸面"，hairline 边框 + elev-1 贴面投影，内边距 10/12/12，卡片间距 12px；hover = elev-2 + 边框加深；标题 13px/600 正常字色（原 12px muted）
- **日期格**：5px 圆角、2px 间距软网格（原 1px）、min-height 35px；hover = 上浮 1px + 放大 1.06 + elev-2（原 1.08 + 原始阴影 + z-10）
- **热力图**：`color-mix(基色, 主题背景)` 五档 22/40/58/76/100%——浅色"越深=越多"、深色"越亮=越多"（GitHub 同款行为），4px 圆角 + 1px 内描边环（浅黑 5% / 深白 7%）；拟物"玻璃 3D"（inset 高光 + ::after 渐变）改为：一档 = 顶部微光，二档 = 微光 + 轻投影（**类名未变，设置项无需迁移**）
- **今天**：2px accent 实线圆环（贴格圆角），数字与农历 accent 色——旧版是红色虚线圆圈
- **非当月格**：0.35 弱化；任务计数 9px faint
- **设置面板**：9 套色板的 40 个预览色值同步重生成，与新色阶一致

## 4. 侧边栏（gc-sidebar，Plane 化）

- **Tab 栏**：去掉底部分隔线，Tab 改为 Plane 导航药丸——12px/500、图标文字间距 6px、6px 圆角、5px 10px 内边距；hover = 中性 wash + 文字提亮；**active = 中性背景块 + 文字 600，不用 accent 底色**（旧版是 text-accent + secondary 底的"浏览器标签"）
- **搜索框**：8px 圆角、hairline 边框、focus 时 accent 描边
- **筛选栏**：图标按钮 6px 圆角、hover 中性 wash；**激活筛选 = accent 图标 + accent-soft 洗色**（功能性强调，保留 accent）
- **下拉菜单**：hairline 边框 + 8px 圆角 + elev-3 双层投影；菜单项 6px 圆角、hover 中性 wash；选中项 = 中性背景块 + 文字提亮（操作符小按钮选中保留 accent）
- **任务列表**：间距 6px；**任务卡 = Plane kanban 卡解剖**——8px 圆角 + 1px hairline 边框 + 极轻 rest 投影；hover = 上/右/下边框加深 + 投影微升，**背景不变**（Plane 的"边框优先"手感）
- **今日时间线**：小时分隔线换 hairline；当前小时 = 中性 wash 染色；全天区 = secondary 底 + hairline 边框 + 8px 圆角；当前时间指示线保持 accent（语义强调）；拖拽落点 = wash + accent 虚线框；空档 "+" 按钮 hover 浮现

## 5. 任务卡（gc-task-card，全局基座）

- **基座**：8px 圆角 + 1px hairline 边框（上/右/下）+ 左侧 3px 状态色条（透明为默认），secondary 底
- **hover**：上/右/下边框 → border-strong + raised 投影微升（刻意只动三边，永不覆盖左侧状态色）
- **变体**：侧边栏卡见上；日视图/任务视图卡加 rest 投影；周视图硬编码阴影 token 化；月视图药丸见 §2；甘特条自带边框体系未动
- **状态语义（全部未动）**：完成 = 绿左条 + 降透明度；待办 = 橙左条；重复任务实卡 = accent 左条；虚拟实例 = 虚线左条 + 降透明度；自定义状态色 = task-with-status 变量

## 6. 明确未动的部分

字体（尊重 Obsidian 用户界面字体设置）、周/日视图布局结构、甘特视图、工具栏、标签药丸、复选框、模态框结构（仅随 token 圆角/阴影自然变圆润）、所有拖拽与交互逻辑。

## 7. 文件归位

月视图样式从 tooltip.css 迁回 `views/month-view.css`；年视图月卡片样式迁入 `views/year-view.css`；tooltip.css 只留 tooltip 与周视图——文件名与内容一致。
