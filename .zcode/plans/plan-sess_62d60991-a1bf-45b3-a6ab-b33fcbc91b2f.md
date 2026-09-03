# 点任务锚定方向体系：前向/后向点任务 + 快速创建完整预填 + ghost 坍缩修复

## 〇、语义总纲

**时刻字段的角色决定块的朝向**：起点角色（🛫/SF 带时刻）→ 前向点任务 `[t, t+60)`；终点角色（📅/EF 带时刻，闭包）→ 后向点任务 `[t-60, t)`，块结束边严格压在截止时刻上。

## 一、渲染行为矩阵（最终版，SF=🛫，EF=📅，DF=筛选字段）

| # | 数据形态 | 行为 |
|---|---|---|
| 1 | SF时刻+EF时刻 <24h | 真实区间分段块（不变） |
| 2 | SF时刻+EF时刻 ≥24h | 全天横跨条 "H:mm → H:mm"（不变） |
| 3 | **SF时刻 + EF同日仅日期** | **改为前向点任务 [SF, SF+60)**，仅渲染不写回 |
| 4 | SF时刻 + EF跨日仅日期 | 全天横跨条 "H:mm →"（不变，≥24h） |
| 5 | **SF仅日期 + EF同日时刻** | **改为后向点任务 [EF-60, EF)** |
| 6 | SF仅日期 + EF跨日时刻 | 全天横跨条 "→ H:mm"（不变） |
| 7 | SF仅日期+EF仅日期 | 全天横跨条无标注（不变） |
| 8 | **仅 DF 时刻，DF 为终点角色**（=EF 或 dueDate） | **后向点任务 [t-60, t)**（与 #5 一致） |
| 9 | 仅 DF 时刻，DF 为起点/计划角色（startDate/scheduled） | 前向点任务 [t, t+60)（不变） |
| 10 | 仅日期/无时刻 | 全天行单日卡（不变） |

**午夜钳制（两端对称）**：后向锚点在 00:00–01:00 → 块起点钳在 00:00（时长缩短）；前向锚点在 23:00–24:00 → 块终点钳在 24:00。

## 二、快速创建（点击空白）——按你的实测反馈修正

- **数据预填**：点击处 = 开始时刻，弹窗预填 **createdDate=当日、startDate=点击时刻、dueDate=点击时刻+60min**（三个字段齐全，不留空开始时间）；保存后是双时刻区间任务，渲染与 hover 虚拟框**完全重合**。实现上 point 分支复用 `targetRange={[t, t+60)}` 预填通道。
- **ghost 坍缩修复**：mousedown 瞬间 ghost 保持 1 小时块（仅切换为激活样式），**不**再坍缩为 15 分钟；当且仅当拖动超过一个吸附步长后才切换为选区模式 `[min(a,cur), max(a,cur)]`。
- 拖拽选区创建（range）行为不变。
- hover 时段占用判定（isTimeBusy）随 ghost 保持 [t, t+60) 前向不变。

## 三、交互镜像语义

| 手势 | 前向点任务（锚=块起点） | 后向点任务（锚=块终点） |
|---|---|---|
| 拖动整块 | 锚点落到指针，写 pointField=drop | 截止落到指针，写 pointField=drop（渲染 [drop-60, drop)） |
| 拉上边缘 | SF=新起点、EF=原锚点 → 升级区间 | SF=新起点、EF=原锚点 → 升级区间 |
| 拉下边缘 | SF=原锚点、EF=新终点 → 升级区间 | SF=原虚起点落盘、EF=新截止 → 升级区间 |

（两方向的 resize 升级统一为：新边缘写字段 + 原锚点字段确保 time 精度。）

## 四、实现改动点

1. **timelineModel.ts**
   - `TaskInterval`/`TimeBlock` 增加 `pointDirection: 'forward' | 'backward'`。
   - `getTaskInterval`：#3 前向点（SF 时刻+EF 同日 day）；#5/#8 后向点（EF 时刻锚，start=max(dayStart, anchor-60)）；#9 前向点（非终点角色 DF）；前向 end=min(t+60, 24:00) 钳制。
   - 终点角色判定：`field === endField || field === 'dueDate'`。
2. **WeekTimelineGrid.tsx**
   - `commitResize`：按 `pointDirection` 镜像写回（上表）。
   - `handleQuickCreate` point 分支改传 `targetRange={[t, t+60)}`（弃用 targetHour/targetMinute 路径，modal 侧接口保留不删）。
   - `handleMouseDown` ghost 初始显示 [anchor, anchor+60) 激活态；`handleMouseMove` create 分支在未超步长前维持 1 小时预览。
3. **冒烟用例**：#3/#5/#8/#9 四形态、前向 23:30 钳制、后向 00:30 钳制、双时刻区间无回归。

## 五、验证与提交

- `npm run build` 零 warning + eslint 不高于基线 + 模型冒烟通过后提交（feat 分支，1-2 个提交：模型/语义一个、快速创建交互一个）。
- Obsidian 重载手测：点击创建三字段齐全且块与 ghost 重合、按下不坍缩、遗留截止任务显示在截止时刻左侧、resize 升级方向正确、午夜钳制。
