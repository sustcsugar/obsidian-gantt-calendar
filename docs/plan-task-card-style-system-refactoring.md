# 任务卡片样式系统重构计划

## 问题概述

### 当前问题
1. **Week/Month/Gantt视图border颜色不生效**：CSS优先级冲突导致completed任务的border被`.task-with-status`规则覆盖
2. **CSS架构混乱**：border属性在多处定义，缺乏统一规范
3. **特指性冲突**：低特指性的状态规则（22）被高特指性的task-with-status规则（23）覆盖

### CSS冲突分析

**Week视图示例**：
```html
<!-- Pending任务 - 正常显示 -->
<div class="calendar-week-task-item pending task-with-status">
  CSS: .calendar-week-tasks-grid .calendar-week-task-item.pending
       特指性: 32 ✅ 高特指性生效

<!-- Completed任务 - 被覆盖 -->
<div class="calendar-week-task-item completed task-with-status">
  CSS: .calendar-week-task-item.completed
       特指性: 22 ❌ 被task-with-status规则（23）覆盖
  CSS: .calendar-week-task-item.task-with-status
       特指性: 23 ✅ 覆盖了completed规则
```

### 日视图成功模式

**为什么日视图正常工作**：
```css
/* 高特指性容器选择器 */
.calendar-day-tasks-list .calendar-day-task-item.completed {
    border-left-color: #52c41a;  /* 特指性: 32 */
}

.calendar-day-tasks-list .calendar-day-task-item.pending {
    border-left-color: #ff7a45;  /* 特指性: 32 */
}
```

**关键要素**：
- 使用后代选择器（容器 + 元素）
- 特指性 = 32（两个类选择器）
- 能够覆盖`.task-with-status`规则（特指性23）

---

## 重构设计原则

### 1. 统一CSS架构
基于日视图的成功模式，为所有视图采用一致的CSS结构：

```
基类: .calendar-task-card (新增通用基类)
视图特定类: .calendar-task-card--day/--week/--month/--gantt
状态类: .calendar-task-card--completed/--pending
```

### 2. 特指性层级设计

**第1级：基类样式** (特指性 10-11)
```css
.calendar-task-card {
    border-left: 3px solid transparent;
}
```

**第2级：视图特定样式** (特指性 20-21)
```css
.calendar-task-card--week {
    border-left: 3px solid var(--color-orange);
}
```

**第3级：容器特定样式** (特指性 30-32) ⭐ **关键**
```css
.calendar-week-tasks-grid .calendar-task-card--week.completed {
    border-left-color: #52c41a;
}
```

### 3. Border定义规范

**原则**：border属性仅在任务卡片类中定义，不在父类中定义

**错误示例**：
```css
/* ❌ 不要在父类中定义border */
.calendar-week-tasks-grid {
    border-left: ...; /* 错误 */
}
```

**正确示例**：
```css
/* ✅ 在任务卡片类中定义border */
.calendar-week-task-item {
    border-left: 3px solid var(--color-orange);
}
```

---

## 实施方案

### 方案A：渐进式重构（快速修复）

**优势**：
- ✅ 最小化风险
- ✅ 不需要修改DOM结构
- ✅ 立即解决当前问题
- ✅ 向后兼容

**实施步骤**：

#### Step 1: 提升状态规则特指性（不修改DOM）

**文件**: `styles.css`

**原理**：为所有视图的状态规则添加容器选择器，提升特指性到32+

**Week视图修改**：
```css
/* 删除低特指性规则 */
.calendar-week-task-item.completed {
    border-left-color: var(--color-green);  /* 特指性: 22 ❌ */
}

/* 新增高特指性规则 */
.calendar-week-tasks-grid .calendar-week-task-item.completed {
    border-left-color: #52c41a;  /* 特指性: 32 ✅ */
}

.calendar-week-tasks-grid .calendar-week-task-item.pending {
    border-left-color: #ff7a45;  /* 特指性: 32 ✅ */
}
```

**Month视图修改**：
```css
/* 删除低特指性规则 */
.calendar-month-task-item.completed {
    border-left-color: var(--color-green);  /* 特指性: 22 ❌ */
}

/* 新增高特指性规则 */
.calendar-month-tasks .calendar-month-task-item.completed {
    border-left-color: #52c41a;  /* 特指性: 32 ✅ */
}

.calendar-month-tasks .calendar-month-task-item.pending {
    border-left-color: #ff7a45;  /* 特指性: 32 ✅ */
}
```

**Gantt视图修改**：
```css
/* 已经是高特指性，保持不变 */
.gantt-view-task-list .gantt-task-card.completed {
    border-left-color: #52c41a;  /* 特指性: 33 ✅ */
}

.gantt-view-task-list .gantt-task-card.pending {
    border-left-color: #ff7a45;  /* 特指性: 33 ✅ */
}
```

#### Step 2: 调整task-with-status规则优先级

**问题**：当前的task-with-status规则会覆盖状态规则

**方案1：降低task-with-status特指性**（推荐）
```css
/* 删除当前的border规则 */
.calendar-day-task-item.task-with-status,
.calendar-week-task-item.task-with-status,
.calendar-month-task-item.task-with-status,
.gantt-task-item.task-with-status,
.gantt-task-card.task-with-status {
    border-left-color: var(--task-bg-color, var(--interactive-accent));
}

/* 修改为：只在没有状态类时应用 */
.calendar-day-task-item.task-with-status:not(.completed):not(.pending),
.calendar-week-task-item.task-with-status:not(.completed):not(.pending),
.calendar-month-task-item.task-with-status:not(.completed):not(.pending),
.gantt-task-item.task-with-status:not(.completed):not(.pending),
.gantt-task-card.task-with-status:not(.completed):not(.pending) {
    border-left-color: var(--task-bg-color, var(--interactive-accent));
}
```

**方案2：提升状态规则到更高特指性**
```css
/* 添加第三级类选择器 */
.calendar-week-tasks-grid .calendar-week-task-item.completed.task-with-status {
    border-left-color: #52c41a !important;  /* 特指性: 43 */
}
```

**推荐方案1**，因为：
- 不使用!important
- 逻辑清晰（task-with-status只应用于没有completed/pending状态的任务）
- 符合CSS最佳实践

#### Step 3: 统一颜色值

**问题**：当前颜色值不统一
- Completed: `var(--color-green)`, `#52c41a`
- Pending: `#ff7a45`, `#f5a623`

**统一为**：
```css
/* 定义CSS变量 */
:root {
    --task-completed-color: #52c41a;
    --task-pending-color: #ff7a45;
}

/* 使用CSS变量 */
.calendar-week-tasks-grid .calendar-week-task-item.completed {
    border-left-color: var(--task-completed-color);
}

.calendar-week-tasks-grid .calendar-week-task-item.pending {
    border-left-color: var(--task-pending-color);
}
```

#### Step 4: CSS规则组织

**文件**: `styles.css`

**新结构**：
```css
/* ========================================
   1. 基础样式（所有视图共享）
   ======================================== */
.calendar-day-task-item,
.calendar-week-task-item,
.calendar-month-task-item,
.gantt-task-card {
    border-left: 3px solid transparent;
}

/* ========================================
   2. 视图特定基础样式
   ======================================== */
.calendar-week-task-item {
    border-left: 3px solid var(--color-orange);
}

.calendar-month-task-item {
    border-left: 2px solid var(--color-orange);
}

/* ========================================
   3. 容器特定样式（高特指性）⭐ 关键
   ======================================== */
/* Day View */
.calendar-day-tasks-list .calendar-day-task-item.completed {
    border-left-color: var(--task-completed-color);
}

.calendar-day-tasks-list .calendar-day-task-item.pending {
    border-left-color: var(--task-pending-color);
}

/* Week View */
.calendar-week-tasks-grid .calendar-week-task-item.completed {
    border-left-color: var(--task-completed-color);
}

.calendar-week-tasks-grid .calendar-week-task-item.pending {
    border-left-color: var(--task-pending-color);
}

/* Month View */
.calendar-month-tasks .calendar-month-task-item.completed {
    border-left-color: var(--task-completed-color);
}

.calendar-month-tasks .calendar-month-task-item.pending {
    border-left-color: var(--task-pending-color);
}

/* Gantt View */
.gantt-view-task-list .gantt-task-card.completed {
    border-left-color: var(--task-completed-color);
}

.gantt-view-task-list .gantt-task-card.pending {
    border-left-color: var(--task-pending-color);
}

/* ========================================
   4. 任务状态系统（低优先级）
   ======================================== */
.calendar-day-task-item.task-with-status:not(.completed):not(.pending),
.calendar-week-task-item.task-with-status:not(.completed):not(.pending),
.calendar-month-task-item.task-with-status:not(.completed):not(.pending),
.gantt-task-item.task-with-status:not(.completed):not(.pending),
.gantt-task-card.task-with-status:not(.completed):not(.pending) {
    border-left-color: var(--task-bg-color, var(--interactive-accent));
}
```

---

### 方案B：完全重构（长期方案）⭐ **用户选择**

**何时使用**：准备发布v2.0大版本时

**实施步骤**：

#### Step 1: 统一DOM类名

**当前类名**：
- Day/Task: `calendar-day-task-item`
- Week: `calendar-week-task-item`
- Month: `calendar-month-task-item`
- Gantt: `gantt-task-card`

**新类名结构**：
```html
<!-- 所有视图统一结构 -->
<div class="calendar-task-card calendar-task-card--day completed">
    任务内容
</div>

<div class="calendar-task-card calendar-task-card--week completed">
    任务内容
</div>
```

#### Step 2: 修改TypeScript代码

**需要修改的文件**：
- `src/views/DayView.ts` (line 136)
- `src/views/TaskView.ts` (line 157)
- `src/views/WeekView.ts` (line 145)
- `src/views/MonthView.ts` (line 128)
- `src/views/GanttView.ts` (line 322)

**修改示例** (WeekView.ts):
```typescript
// 修改前
const taskItem = container.createDiv('calendar-week-task-item');
taskItem.addClass(task.completed ? 'completed' : 'pending');

// 修改后
const taskItem = container.createDiv('calendar-task-card');
taskItem.addClass('calendar-task-card--week');
taskItem.addClass(task.completed ? 'completed' : 'pending');
```

#### Step 3: 重写CSS

**文件**: `styles.css`

```css
/* ========================================
   基础样式
   ======================================== */
.calendar-task-card {
    display: flex;
    align-items: center;
    padding: 8px;
    border-left: 3px solid transparent;
    background-color: var(--background-secondary);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s ease;
}

/* ========================================
   视图特定样式
   ======================================== */
.calendar-task-card--day {
    padding: 10px;
    gap: 8px;
}

.calendar-task-card--week {
    padding: 8px;
    font-size: 13px;
}

.calendar-task-card--month {
    padding: 4px 6px;
    font-size: 11px;
    border-left-width: 2px;
}

.calendar-task-card--gantt {
    padding: 8px 12px;
}

/* ========================================
   状态样式（高特指性）
   ======================================== */
.calendar-day-tasks-list .calendar-task-card--day.completed {
    border-left-color: var(--task-completed-color);
    opacity: 0.7;
}

.calendar-day-tasks-list .calendar-task-card--day.pending {
    border-left-color: var(--task-pending-color);
}

.calendar-week-tasks-grid .calendar-task-card--week.completed {
    border-left-color: var(--task-completed-color);
    opacity: 0.7;
}

.calendar-week-tasks-grid .calendar-task-card--week.pending {
    border-left-color: var(--task-pending-color);
}

/* ... 其他视图类似 */
```

---

## 推荐实施路径

### 立即执行：方案A（渐进式重构）

**理由**：
1. ✅ 不修改DOM结构，风险低
2. ✅ 立即解决当前问题
3. ✅ 向后兼容，不影响现有功能
4. ✅ 工作量小（约30分钟）

**修改清单**：
1. ✅ 删除低特指性的completed规则
2. ✅ 添加高特指性的容器选择器规则
3. ✅ 修改task-with-status规则，添加:not()伪类
4. ✅ 统一颜色值为CSS变量
5. ✅ 重新组织CSS规则顺序

**预期效果**：
- ✅ 所有5个视图都正确显示border颜色
- ✅ Completed任务显示绿色（#52c41a）
- ✅ Pending任务显示橙红色（#ff7a45）
- ✅ Task-with-status的自定义颜色仍然有效
- ✅ 无CSS冲突，不使用!important

### 长期规划：方案B（完全重构）⭐ **用户选择**

**理由**：
1. 彻底解决类名混乱问题
2. 采用BEM命名规范
3. 更好的可维护性
4. 便于未来扩展新视图

---

## 关键文件清单

### 方案A需要修改的文件

| 文件 | 修改内容 | 变更量 |
|------|---------|--------|
| `styles.css` | 删除低特指性规则，添加高特指性规则 | ~50行 |

### 方案B需要修改的文件

| 文件 | 修改内容 | 变更量 |
|------|---------|--------|
| `src/views/DayView.ts` | 修改任务卡片类名 | ~5行 |
| `src/views/TaskView.ts` | 修改任务卡片类名 | ~5行 |
| `src/views/WeekView.ts` | 修改任务卡片类名 | ~5行 |
| `src/views/MonthView.ts` | 修改任务卡片类名 | ~5行 |
| `src/views/GanttView.ts` | 修改任务卡片类名 | ~5行 |
| `styles.css` | 完全重写任务卡片样式 | ~200行 |

---

## CSS特指性计算表

| 选择器 | 特指性 | 说明 |
|--------|--------|------|
| `.calendar-week-task-item` | 11 | 单个类选择器 |
| `.calendar-week-task-item.completed` | 22 | 两个类选择器 |
| `.calendar-week-tasks-grid .calendar-week-task-item.completed` | 32 | 两个类选择器 + 后代选择器 ⭐ **推荐** |
| `.calendar-week-task-item.task-with-status` | 23 | 两个类选择器 |
| `.calendar-week-task-item.task-with-status:not(.completed)` | 33 | 两个类选择器 + 伪类 |

**关键原则**：
- 状态规则特指性必须 >= 32
- 使用容器选择器提升特指性
- 避免使用!important

---

## 测试验证计划

### 测试矩阵

| 视图 | Completed Border | Pending Border | Task-with-status Border |
|------|-----------------|---------------|----------------------|
| Day View | 🟢 #52c41a | 🟠 #ff7a45 | 🎨 自定义颜色 |
| Task View | 🟢 #52c41a | 🟠 #ff7a45 | 🎨 自定义颜色 |
| Week View | 🟢 #52c41a | 🟠 #ff7a45 | 🎨 自定义颜色 |
| Month View | 🟢 #52c41a | 🟠 #ff7a45 | 🎨 自定义颜色 |
| Gantt View | 🟢 #52c41a | 🟠 #ff7a45 | 🎨 自定义颜色 |

### 测试步骤

1. **基础测试**：
   - [ ] 创建completed任务，验证所有视图显示绿色border
   - [ ] 创建pending任务，验证所有视图显示橙红色border

2. **状态测试**：
   - [ ] 切换任务完成状态，验证border颜色实时更新
   - [ ] 验证opacity变化正确应用

3. **自定义颜色测试**：
   - [ ] 修改任务状态的背景色
   - [ ] 验证task-with-status任务的border颜色跟随变化

4. **CSS冲突测试**：
   - [ ] 打开浏览器开发者工具
   - [ ] 检查completed任务的border-left-color最终生效值
   - [ ] 验证没有被task-with-status规则覆盖

---

## 风险评估

### 方案A风险：低

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| CSS规则遗漏 | 中 | 中 | 详细的测试清单 |
| 特指性计算错误 | 低 | 低 | 使用CSS特指性计算器验证 |
| 向后兼容性 | 低 | 低 | 保留旧类名，只添加新规则 |

### 方案B风险：高 ⭐ **已接受**

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| DOM类名变更影响用户自定义CSS | 高 | 高 | 提供迁移指南，保留旧类名兼容 |
| 大规模代码修改引入bug | 中 | 高 | 完整的单元测试和集成测试 |
| 破坏现有功能 | 中 | 高 | 充分的测试周期 |

---

## 实施时间线

### 方案A（立即执行）

- **准备阶段**：10分钟（阅读代码，确认修改点）
- **实施阶段**：15分钟（修改CSS）
- **测试阶段**：10分钟（构建测试，手动验证）
- **总计**：35分钟

### 方案B（分阶段执行）⭐ **用户选择**

- **第1阶段：Day/Task View重构**：2小时
- **第2阶段：Week View重构**：2小时
- **第3阶段：Month View重构**：2小时
- **第4阶段：Gantt View重构**：2小时
- **第5阶段：CSS重写和测试**：4小时
- **总计**：12小时（分多次会话完成）

---

## 结论

**用户选择实施方案B（完全重构）**，这将彻底解决架构问题，为未来的维护和扩展打下坚实基础。

虽然方案B风险较高，但通过分阶段实施和充分测试，可以成功完成重构。
