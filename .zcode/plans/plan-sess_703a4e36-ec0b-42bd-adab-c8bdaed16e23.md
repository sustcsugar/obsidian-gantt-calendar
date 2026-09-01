# 甘特图渲染器拆分重构

## 目标
将 `svgGanttRenderer.ts` (2242行, 53方法) 拆分为 13 个功能模块，主编排层缩减至 ~300 行。

## 拆分模块

| 模块 | 文件 | 职责 | 行数 |
|---|---|---|---|
| 日期几何 | dateGeometry.ts | parseLocalDate、findStart/GridUnitIndex、getGridUnitX 纯函数 | ~100 |
| Header 渲染 | headerRenderer.ts | renderHeader 时间轴 | ~65 |
| Corner 渲染 | cornerRenderer.ts | renderCorner 左上角 | ~55 |
| TaskList 渲染 | taskListRenderer.ts | renderTaskList、复选框、链接 | ~200 |
| Grid 渲染 | ganttGridRenderer.ts | renderGrid、renderTodayLine | ~100 |
| TaskBar 渲染 | taskBarRenderer.ts | renderTaskBars、引导条、手柄 | ~220 |
| 拖拽控制器 | taskDragController.ts | 拖拽状态机 + 视觉更新 | ~280 |
| 分隔条 | columnResizerController.ts | 分隔条拖动 | ~100 |
| 行高亮 | rowHighlightController.ts | 行悬停高亮 | ~130 |
| 拖放接收 | dropReceiverController.ts | 侧边栏拖入 | ~65 |
| 滚动同步 | syncScrollController.ts | 三向滚动同步 | ~50 |
| 增量更新 | incrementalUpdater.ts | updateTasks、updateTaskBarElement | ~280 |
| 主编排层 | svgGanttRenderer.ts | 构造、render、destroy | ~300 |

## 共享状态方案
各模块通过构造函数注入 renderer 实例（或 IRenderContext 接口），读写共享状态。

## 实施顺序
1. dateGeometry.ts（纯函数，零风险）
2. renderContext.ts（共享状态接口）
3. 各渲染模块（Header/Corner/TaskList/Grid/TaskBar）
4. 交互模块（DragController/Resizer/RowHighlight/DropReceiver/SyncScroll）
5. incrementalUpdater.ts
6. 主文件瘦身
7. GanttChartAdapter 检查

## 验证
每步完成后 `tsc + jest + npm run build`