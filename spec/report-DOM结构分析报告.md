# Obsidian Gantt Calendar - DOM结构分析报告

## 目录
- [1. 整体容器结构](#1-整体容器结构)
- [2. 工具栏系统](#2-工具栏系统)
- [3. 视图对比表格](#3-视图对比表格)
- [4. 任务卡片结构对比](#4-任务卡片结构对比)
- [5. 命名规范问题分析](#5-命名规范问题分析)
- [6. 重构建议](#6-重构建议)

---

## 1. 整体容器结构

### 根容器 (gantt-root)
```
.gantt-root
├── .calendar-toolbar          # 工具栏容器
│   ├── .calendar-toolbar-left      # 左侧：视图切换
│   ├── .calendar-toolbar-center    # 中间：日期显示
│   └── .calendar-toolbar-right     # 右侧：导航和控制
└── .calendar-content          # 内容区域
    ├── [具体视图容器]
    └── .gantt-mode (可选)    # 甘特图模式标识
```

**命名问题：**
- ❌ 根容器使用 `gantt-root`，但这是通用插件，不是纯甘特图插件
- ✅ 建议：`gc-plugin-container` (gc = gantt-calendar)

---

## 2. 工具栏系统

### 2.1 工具栏三区域布局

| 区域 | 当前类名 | 层级 | 功能 |
|------|---------|------|------|
| 左侧 | `.calendar-toolbar-left` | 1 | 视图切换器 (Tasks/Calendar/Gantt) |
| 中间 | `.calendar-toolbar-center` | 1 | 日期范围显示 |
| 右侧 | `.calendar-toolbar-right` | 1 | 导航按钮、视图选择器、筛选器 |

### 2.2 工具栏组件详细结构

#### 2.2.1 左侧视图切换器
```
.calendar-toolbar-left
└── .calendar-toggle-group
    └── .calendar-toggle-btn (×3: Tasks, Calendar, Gantt)
```

#### 2.2.2 右侧组件对比

| 组件类型 | 日历视图 | 任务视图 | 甘特图视图 |
|---------|---------|---------|-----------|
| 导航按钮 | `.calendar-nav-buttons` | ❌ 无 | ❌ 无 |
| 视图选择器 | `.calendar-view-selector` | ❌ 无 | ❌ 无 |
| 全局过滤器 | ❌ 无 | `.toolbar-right-task-global-filter` | ❌ 无 |
| 状态筛选 | ❌ 无 | `.toolbar-right-task-status-group` | `.toolbar-right-task-status-group` |
| 字段选择 | ❌ 无 | `.toolbar-right-task-field-filter-group` | `.toolbar-gantt-field-group` |
| 日期筛选 | ❌ 无 | `.toolbar-right-task-date-filter-group` | ❌ 无 |
| 时间颗粒度 | ❌ 无 | ❌ 无 | `.toolbar-time-granularity-group` |

**命名问题：**
- ❌ 任务视图组件：`toolbar-right-task-*` (太长)
- ❌ 甘特图组件：`toolbar-gantt-*` (与任务视图不一致)
- ❌ 日期模式按钮：`toolbar-right-task-date-mode-btn` (冗长)
- ✅ 建议统一前缀：`gc-tb-*` (tb = toolbar)

---

## 3. 视图对比表格

### 3.1 视图容器层级对比

| 视图 | 容器类名 | 子容器类名 | 网格/列表类名 | 单元格类名 |
|------|---------|-----------|--------------|-----------|
| **年视图** | `.calendar-year-container` | `.calendar-months-grid` | `.calendar-month-card` | `.calendar-days-grid` → `.calendar-day` |
| **月视图** | `.calendar-month-view` | `.calendar-month-weeks` | `.calendar-week-row` | `.calendar-week-days` → `.calendar-day-cell` |
| **周视图** | `.calendar-week-view` | `.calendar-week-grid` | `.calendar-week-tasks-grid` | `.calendar-week-tasks-column` |
| **日视图** | `.calendar-day-view` | `.calendar-day-split-container`<br>`.calendar-day-split-container-vertical` | `.calendar-day-tasks-list` | `.calendar-day-notes-content` |
| **任务视图** | `.calendar-task-view` | ❌ 无 | `.task-view-list` | ❌ 无（直接任务卡片） |
| **甘特图** | `.calendar-gantt-view` | `.gantt-view-body` | `.gantt-view-task-list`<br>`.gantt-timeline-scroll`<br>`.gantt-bars-scroll` | `.calendar-task-card`<br>`.gantt-date-cell`<br>`.gantt-bar-row` |

### 3.2 视图详细DOM结构

#### 3.2.1 年视图 (YearView)
```
.calendar-year-container
└── .calendar-months-grid                # 12个月网格
    └── .calendar-month-card (×12)      # 单月卡片
        ├── .calendar-month-header      # 月标题
        ├── .calendar-weekdays          # 星期标题行
        │   └── .calendar-weekday (×7)  # 日/一/二/...
        └── .calendar-days-grid         # 日期网格
            └── .calendar-day (×35/42)  # 日期单元格
                ├── .calendar-day-number     # 日期数字
                ├── .calendar-lunar-text     # 农历文本
                └── .calendar-day-task-count # 任务计数
```

**命名问题：**
- ⚠️ `calendar-weekdays` (复数) vs `calendar-weekday` (单数) - 概念混淆
- ⚠️ `calendar-day` 与其他视图的 `calendar-day-cell` 不一致

#### 3.2.2 月视图 (MonthView)
```
.calendar-month-view
├── .calendar-month-weekdays            # 星期标题行
│   ├── .calendar-month-weekday (空列)  # 周编号占位
│   └── .calendar-month-weekday (×7)   # 周日~周六
└── .calendar-month-weeks               # 周列表
    └── .calendar-week-row (×4-6)      # 单周行
        ├── .calendar-week-number       # 周编号 W1/W2/...
        └── .calendar-week-days         # 7天容器
            └── .calendar-day-cell (×7) # 日期单元格
                ├── .calendar-day-number
                ├── .calendar-lunar-text
                └── .calendar-month-tasks      # 任务列表
                    └── .calendar-month-task-item # 单个任务
```

**命名问题：**
- ❌ `calendar-month-weekdays` vs `calendar-weekdays` (年视图) - 不一致
- ❌ `calendar-day-cell` vs `calendar-day` (年视图) - 不一致
- ❌ `calendar-month-task-item` - 没有使用通用的任务卡片类名

#### 3.2.3 周视图 (WeekView)
```
.calendar-week-view
└── .calendar-week-grid
    ├── .calendar-week-header-row       # 星期标题行
    │   └── .calendar-day-header-cell (×7) # 日期头
    │       ├── .day-name               # "周一"
    │       ├── .day-number             # "15"
    │       └── .day-lunar              # "初一"
    └── .calendar-week-tasks-grid       # 任务网格
        └── .calendar-week-tasks-column (×7) # 单列任务
            └── .calendar-task-card     # 任务卡片
                ├── .gantt-task-checkbox.calendar-week-task-checkbox
                ├── .calendar-week-task-text
                └── [其他任务属性]
```

**命名问题：**
- ❌ `calendar-day-header-cell` 与月视图的 `calendar-month-weekday` 完全不同
- ❌ `day-name` / `day-number` / `day-lunar` 缺少前缀，容易冲突
- ❌ `calendar-week-task-checkbox` - 混合了前缀

#### 3.2.4 日视图 (DayView)

**模式A: 水平分割**
```
.calendar-day-view
└── .calendar-day-split-container
    ├── .calendar-day-tasks-section         # 任务区域
    │   ├── .calendar-day-tasks-title       # "当日任务"
    │   └── .calendar-day-tasks-list
    │       └── .calendar-task-card
    ├── .calendar-day-divider               # 分割线
    └── .calendar-day-notes-section         # 笔记区域
        ├── .calendar-day-notes-title       # "Daily Note"
        └── .calendar-day-notes-content
            └── .calendar-day-notes-markdown
```

**模式B: 垂直分割**
```
.calendar-day-view
└── .calendar-day-split-container-vertical
    ├── .calendar-day-tasks-section-vertical
    ├── .calendar-day-divider-vertical
    └── .calendar-day-notes-section-vertical
```

**模式C: 仅任务**
```
.calendar-day-view
└── .calendar-day-tasks-section-full
    ├── .calendar-day-tasks-title
    └── .calendar-day-tasks-list
        └── .calendar-task-card
```

**命名问题：**
- ❌ 三种模式使用不同的容器类，增加CSS复杂度
- ✅ 建议使用修饰符：`.calendar-day-container --horizontal / --vertical / --tasks-only`

#### 3.2.5 任务视图 (TaskView)
```
.calendar-task-view
└── .task-view-list
    └── .calendar-task-card
        ├── .gantt-task-checkbox
        ├── .gantt-task-text
        ├── .gantt-task-time-properties-inline
        │   └── .gantt-time-badge (×N)
        │       ├── .gantt-time-created
        │       ├── .gantt-time-due
        │       └── .overdue (修饰符)
        ├── .gantt-task-file
        └── .gantt-task-warning-icon
```

**命名问题：**
- ❌ `gantt-task-*` - 但这是任务视图，不是甘特图
- ❌ `task-view-list` - 没有统一前缀

#### 3.2.6 甘特图视图 (GanttView)
```
.calendar-gantt-view
└── .gantt-view-body
    ├── .gantt-view-tasks              # 左侧任务列
    │   ├── .gantt-view-tasks-header   # 列标题
    │   └── .gantt-view-task-list
    │       └── .calendar-task-card.calendar-task-card--gantt
    ├── .gantt-view-resizer            # 可拖动分割线
    └── .gantt-view-time               # 右侧时间轴
        ├── .gantt-view-timeline       # 时间刻度区
        │   └── .gantt-timeline-scroll
        │       └── .gantt-timeline-row
        │           └── .gantt-date-cell (×N)
        ├── .gantt-view-bars           # 甘特条区
        │   └── .gantt-bars-scroll
        │       └── .gantt-bars-grid
        │           └── .gantt-bar-row (×N)
        │               └── .gantt-bar
        └── .gantt-today-overlay       # 今天线覆盖层
            └── .gantt-today-line
```

**命名问题：**
- ✅ 甘特图使用 `gantt-*` 前缀是合理的
- ⚠️ `.calendar-task-card--gantt` 使用了BEM修饰符，但其他地方不一致

---

## 4. 任务卡片结构对比

### 4.1 任务卡片类名使用情况

| 视图 | 任务卡片类名 | 是否通用 | 复选框类名 | 文本类名 |
|------|-------------|---------|-----------|---------|
| 年视图 | ❌ 无任务卡片 | ❌ | ❌ | ❌ |
| 月视图 | `.calendar-month-task-item` | ❌ | ❌ 无 | ❌ 无 |
| 周视图 | `.calendar-task-card` | ✅ | `.calendar-week-task-checkbox` | `.calendar-week-task-text` |
| 日视图 | `.calendar-task-card` | ✅ | `.gantt-task-checkbox` | `.gantt-task-text` |
| 任务视图 | `.calendar-task-card` | ✅ | `.gantt-task-checkbox` | `.gantt-task-text` |
| 甘特图 | `.calendar-task-card.calendar-task-card--gantt` | ✅ | `.gantt-task-checkbox` | `.gantt-task-text` |

**问题汇总：**
- ❌ 月视图使用完全不同的类名 `calendar-month-task-item`
- ❌ 周视图的复选框和文本类名特殊：`calendar-week-*`
- ❌ 其他视图使用 `gantt-task-*`，但这不是甘特图专属

### 4.2 标准任务卡片结构（理想状态）

```html
<div class="gc-task-card" data-view="month|week|day|task|gantt">
    <!-- 复选框 -->
    <input type="checkbox" class="gc-task-checkbox" />

    <!-- 任务描述 -->
    <div class="gc-task-content">
        <span class="gc-task-text">
            文本内容 <a class="gc-task-link">链接</a>
        </span>

        <!-- 优先级 -->
        <span class="gc-task-priority priority-high">⏫</span>
    </div>

    <!-- 时间属性 -->
    <div class="gc-task-properties">
        <span class="gc-time-badge gc-time-created">
            ➕ 创建: 2025-01-01
        </span>
        <span class="gc-time-badge gc-time-due overdue">
            📅 截止: 2024-12-01
        </span>
    </div>

    <!-- 文件位置 -->
    <span class="gc-task-location">file.md:10</span>

    <!-- 警告图标 -->
    <span class="gc-task-warning">⚠️</span>
</div>
```

### 4.3 任务悬浮提示 (Tooltip)

```
.calendar-week-task-tooltip.tooltip-show
├── .tooltip-description
│   └── <strong>任务描述</strong>
├── .tooltip-priority
│   └── .priority-high
├── .tooltip-time-properties
│   ├── .tooltip-time-item
│   └── .tooltip-overdue
└── .tooltip-file
    └── .tooltip-file-location
```

**命名问题：**
- ❌ `calendar-week-task-tooltip` - 只用于周视图，但实际所有视图共享
- ✅ 建议：`.gc-tooltip` 或 `.gc-task-tooltip`

---

## 5. 命名规范问题分析

### 5.1 前缀混乱问题

| 前缀 | 使用场景 | 问题 |
|------|---------|------|
| `calendar-*` | 大部分组件 | ✅ 通用，但太长 |
| `gantt-*` | 任务卡片、甘特图 | ❌ 误用：任务视图不是甘特图 |
| `toolbar-*` | 工具栏 | ✅ 合理 |
| `calendar-month-*` | 月视图 | ⚠️ 视图特定前缀 |
| `calendar-week-*` | 周视图 | ⚠️ 视图特定前缀 |
| `calendar-day-*` | 日视图 | ⚠️ 视图特定前缀 |
| `tooltip-*` | 悬浮提示 | ⚠️ 缺少前缀，易冲突 |

### 5.2 命名不一致问题

#### 问题1: 相同功能，不同类名
```
月视图: .calendar-month-task-item
周视图: .calendar-task-card
日视图: .calendar-task-card
任务视图: .calendar-task-card
甘特图: .calendar-task-card.calendar-task-card--gantt
```

#### 问题2: 相同层级，不同命名
```
年视图: .calendar-day
月视图: .calendar-day-cell
周视图: .calendar-day-header-cell / .calendar-week-tasks-column
日视图: 无单元格概念
```

#### 问题3: BEM规范不一致
```
有修饰符: .calendar-task-card--gantt
无修饰符: .calendar-week-task-checkbox (应该是 .gc-task-checkbox--week)
混合使用: .gantt-time-badge.overdue
```

### 5.3 缺少语义化层级

当前CSS类名没有清晰的层级关系，例如：
- ❌ `calendar-day-number` - 无法看出这是日期卡片的子元素
- ✅ 应该是：`gc-day-card__number` 或 `gc-date-cell__number`

---

## 6. 重构建议

### 6.1 统一命名规范

#### 方案A: BEM风格（推荐）

```css
/* 块 */
.gc-plugin
.gc-toolbar
.gc-view-year
.gc-view-month
.gc-view-week
.gc-view-day
.gc-view-task
.gc-view-gantt

/* 元素 */
.gc-view-year__month-card
.gc-view-month__week-row
.gc-view-week__day-column
.gc-task-card__checkbox
.gc-task-card__text
.gc-task-card__properties

/* 修饰符 */
.gc-task-card--month
.gc-task-card--week
.gc-task-card--overdue
.gc-view-day--horizontal
.gc-view-day--vertical
```

#### 方案B: 传统层级式

```css
.gc-plugin
.gc-toolbar
.gc-view-year
.gc-view-year-months-grid
.gc-view-year-month-card
.gc-view-year-month-card-days
```

#### 方案C: 混合式（当前改进）

```css
/* 保持一定可读性，但统一前缀 */
.gc-plugin
.gc-tb-view-toggle      /* toolbar view toggle */
.gc-view-year
.gc-year-months-grid
.gc-year-month-card
.gc-task-card
.gc-task-checkbox
.gc-task-text
```

### 6.2 统一前缀建议

推荐使用：`gc-` (gantt-calendar)

优点：
- ✅ 简短（3个字符 vs 8个字符的 `calendar-`）
- ✅ 语义明确
- ✅ 避免与其他插件冲突
- ✅ 所有样式表一致

### 6.3 视图类名重构方案

#### 当前 → 建议

| 当前类名 | 建议类名 | 说明 |
|---------|---------|------|
| `.calendar-year-container` | `.gc-view-year` | 年视图容器 |
| `.calendar-month-view` | `.gc-view-month` | 月视图容器 |
| `.calendar-week-view` | `.gc-view-week` | 周视图容器 |
| `.calendar-day-view` | `.gc-view-day` | 日视图容器 |
| `.calendar-task-view` | `.gc-view-task` | 任务视图容器 |
| `.calendar-gantt-view` | `.gc-view-gantt` | 甘特图容器 |

#### 视图内部组件

| 当前类名 | 建议类名 | 说明 |
|---------|---------|------|
| `.calendar-months-grid` | `.gc-year__months-grid` | 年视图月份网格 |
| `.calendar-month-card` | `.gc-year__month-card` | 单月卡片 |
| `.calendar-week-row` | `.gc-month__week-row` | 月视图周行 |
| `.calendar-week-tasks-grid` | `.gc-week__tasks-grid` | 周视图任务网格 |
| `.calendar-day-split-container` | `.gc-day__split-container` | 日视图分割容器 |
| `.task-view-list` | `.gc-task__list` | 任务视图列表 |
| `.gantt-view-body` | `.gc-gantt__body` | 甘特图主体 |

### 6.4 任务卡片统一方案

#### 新的通用任务卡片结构

```html
<div class="gc-task-card" data-view-type="month">
    <!-- 状态指示条 -->
    <div class="gc-task-card__status-bar"></div>

    <!-- 左侧：复选框 -->
    <input type="checkbox" class="gc-task-card__checkbox" />

    <!-- 中间：任务内容 -->
    <div class="gc-task-card__content">
        <div class="gc-task-card__title">
            <span class="gc-task-card__text">任务描述</span>
            <span class="gc-task-card__priority priority-high">⏫</span>
        </div>

        <!-- 时间属性（可选） -->
        <div class="gc-task-card__properties">
            <span class="gc-time-badge gc-time-badge--created">
                <span class="gc-time-badge__icon">➕</span>
                <span class="gc-time-badge__label">创建</span>
                <span class="gc-time-badge__date">2025-01-01</span>
            </span>
            <span class="gc-time-badge gc-time-badge--due gc-time-badge--overdue">
                <span class="gc-time-badge__icon">📅</span>
                <span class="gc-time-badge__label">截止</span>
                <span class="gc-time-badge__date">2024-12-01</span>
            </span>
        </div>
    </div>

    <!-- 右侧：元数据 -->
    <div class="gc-task-card__meta">
        <span class="gc-task-card__location">file.md:10</span>
        <span class="gc-task-card__warning">⚠️</span>
    </div>
</div>
```

#### 视图特定修饰符

```css
/* 视图特定样式 */
.gc-task-card--month { /* 月视图紧凑模式 */ }
.gc-task-card--week { /* 周视图标准模式 */ }
.gc-task-card--day { /* 日视图详细模式 */ }
.gc-task-card--task { /* 任务视图列表模式 */ }
.gc-task-card--gantt { /* 甘特图侧边栏模式 */ }

/* 状态修饰符 */
.gc-task-card--completed { /* 已完成 */ }
.gc-task-card--overdue { /* 已过期 */ }
.gc-task-card--today { /* 今日任务 */ }
```

### 6.5 工具栏统一方案

#### 新的工具栏结构

```html
<div class="gc-tb">  <!-- toolbar -->
    <!-- 左侧 -->
    <div class="gc-tb__left">
        <div class="gc-tb__view-switcher">
            <button class="gc-tb__btn gc-tb__view-btn gc-tb__view-btn--active">Tasks</button>
            <button class="gc-tb__btn gc-tb__view-btn">Calendar</button>
            <button class="gc-tb__btn gc-tb__view-btn">Gantt</button>
        </div>
    </div>

    <!-- 中间 -->
    <div class="gc-tb__center">
        <span class="gc-tb__date-display">2025年1月</span>
    </div>

    <!-- 右侧 -->
    <div class="gc-tb__right">
        <!-- 日历视图工具 -->
        <div class="gc-tb__group gc-tb__nav">
            <button class="gc-tb__btn gc-tb__nav-btn">◀</button>
            <button class="gc-tb__btn gc-tb__nav-btn">今天</button>
            <button class="gc-tb__btn gc-tb__nav-btn">▶</button>
        </div>

        <div class="gc-tb__group gc-tb__view-selector">
            <button class="gc-tb__btn gc-tb__view-btn">日</button>
            <button class="gc-tb__btn gc-tb__view-btn gc-tb__view-btn--active">周</button>
            <button class="gc-tb__btn gc-tb__view-btn">月</button>
            <button class="gc-tb__btn gc-tb__view-btn">年</button>
        </div>

        <!-- 任务视图工具 -->
        <div class="gc-tb__group gc-tb__filter">
            <span class="gc-tb__label">状态</span>
            <select class="gc-tb__select">...</select>
        </div>

        <div class="gc-tb__group gc-tb__filter">
            <span class="gc-tb__label">字段</span>
            <select class="gc-tb__select">...</select>
        </div>

        <!-- 通用 -->
        <button class="gc-tb__btn gc-tb__refresh-btn">🔄</button>
    </div>
</div>
```

### 6.6 重构实施步骤

1. **准备阶段**
   - 备份当前 `styles.css`
   - 创建 `styles.css.backup`（已完成）
   - 创建映射表（旧类名 → 新类名）

2. **重构CSS（styles.css）**
   - 定义新的BEM类名
   - 保留旧类名作为别名（过渡期）
   - 逐步迁移样式规则

3. **重构TypeScript代码**
   - 更新所有视图类中的 `createElement()` 类名
   - 更新 `BaseCalendarRenderer` 中的类名
   - 更新工具栏相关文件

4. **测试验证**
   - 逐个视图测试功能
   - 检查样式是否正常
   - 验证交互功能

5. **清理阶段**
   - 移除旧的类名别名
   - 更新文档
   - 提交版本

### 6.7 类名映射表（部分示例）

| 旧类名 | 新类名 | 文件位置 |
|-------|--------|---------|
| `.gantt-root` | `.gc-plugin` | main.ts |
| `.calendar-toolbar` | `.gc-tb` | toolbar/*.ts |
| `.calendar-year-container` | `.gc-view-year` | YearView.ts |
| `.calendar-task-card` | `.gc-task-card` | BaseCalendarRenderer.ts |
| `.gantt-task-checkbox` | `.gc-task-card__checkbox` | BaseCalendarRenderer.ts |
| `.gantt-task-text` | `.gc-task-card__text` | BaseCalendarRenderer.ts |
| `.gantt-time-badge` | `.gc-time-badge` | BaseCalendarRenderer.ts |
| `.calendar-week-task-tooltip` | `.gc-tooltip` | BaseCalendarRenderer.ts |

---

## 7. 附录：完整类名索引

### 7.1 按功能分类

#### 容器类
- `.gantt-root` → `.gc-plugin`
- `.calendar-content` → `.gc-content`
- `.calendar-year-container` → `.gc-view-year`
- `.calendar-month-view` → `.gc-view-month`
- `.calendar-week-view` → `.gc-view-week`
- `.calendar-day-view` → `.gc-view-day`
- `.calendar-task-view` → `.gc-view-task`
- `.calendar-gantt-view` → `.gc-view-gantt`

#### 工具栏类
- `.calendar-toolbar` → `.gc-tb`
- `.calendar-toolbar-left` → `.gc-tb__left`
- `.calendar-toolbar-center` → `.gc-tb__center`
- `.calendar-toolbar-right` → `.gc-tb__right`
- `.calendar-toggle-group` → `.gc-tb__view-switcher`
- `.calendar-toggle-btn` → `.gc-tb__view-btn`
- `.calendar-nav-buttons` → `.gc-tb__nav`
- `.calendar-nav-compact-btn` → `.gc-tb__nav-btn`
- `.calendar-view-selector` → `.gc-tb__view-selector`

#### 任务卡片类
- `.calendar-task-card` → `.gc-task-card`
- `.calendar-month-task-item` → `.gc-task-card` (统一)
- `.gantt-task-checkbox` → `.gc-task-card__checkbox`
- `.calendar-task-card-text` → `.gc-task-card__text`
- `.calendar-week-task-text` → `.gc-task-card__text` (统一)
- `.gantt-task-text` → `.gc-task-card__text` (统一)
- `.gantt-task-priority-inline` → `.gc-task-card__priority`
- `.gantt-task-time-properties-inline` → `.gc-task-card__properties`
- `.gantt-time-badge` → `.gc-time-badge`
- `.gantt-task-file` → `.gc-task-card__location`
- `.gantt-task-warning-icon` → `.gc-task-card__warning`

#### 日期单元格类
- `.calendar-day` → `.gc-date-cell` (年视图)
- `.calendar-day-cell` → `.gc-date-cell` (月视图)
- `.calendar-day-header-cell` → `.gc-day-header` (周视图)
- `.calendar-day-number` → `.gc-date-cell__number`
- `.calendar-lunar-text` → `.gc-date-cell__lunar`

#### 甘特图专用类
- `.gantt-view-body` → `.gc-gantt__body`
- `.gantt-view-tasks` → `.gc-gantt__tasks`
- `.gantt-view-time` → `.gc-gantt__timeline`
- `.gantt-view-resizer` → `.gc-gantt__resizer`
- `.gantt-date-cell` → `.gc-gantt__date-cell`
- `.gantt-bar-row` → `.gc-gantt__bar-row`
- `.gantt-bar` → `.gc-gantt__bar`
- `.gantt-today-line` → `.gc-gantt__today-line`

#### 悬浮提示类
- `.calendar-week-task-tooltip` → `.gc-tooltip`
- `.tooltip-description` → `.gc-tooltip__description`
- `.tooltip-priority` → `.gc-tooltip__priority`
- `.tooltip-time-properties` → `.gc-tooltip__properties`
- `.tooltip-file` → `.gc-tooltip__file`

### 7.2 按视图分类

#### 年视图 (YearView)
```
.calendar-year-container        → .gc-view-year
├── .calendar-months-grid       → .gc-year__months-grid
│   └── .calendar-month-card    → .gc-year__month-card
│       ├── .calendar-month-header  → .gc-year__month-header
│       ├── .calendar-weekdays      → .gc-year__weekdays
│       │   └── .calendar-weekday   → .gc-year__weekday
│       └── .calendar-days-grid     → .gc-year__days-grid
│           └── .calendar-day       → .gc-date-cell
│               ├── .calendar-day-number   → .gc-date-cell__number
│               ├── .calendar-lunar-text   → .gc-date-cell__lunar
│               └── .calendar-day-task-count → .gc-date-cell__task-count
```

#### 月视图 (MonthView)
```
.calendar-month-view            → .gc-view-month
├── .calendar-month-weekdays    → .gc-month__weekdays
│   └── .calendar-month-weekday → .gc-month__weekday
└── .calendar-month-weeks       → .gc-month__weeks
    └── .calendar-week-row      → .gc-month__week-row
        ├── .calendar-week-number   → .gc-month__week-number
        └── .calendar-week-days     → .gc-month__days
            └── .calendar-day-cell  → .gc-date-cell
                ├── .calendar-day-number
                ├── .calendar-lunar-text
                └── .calendar-month-tasks   → .gc-date-cell__tasks
                    └── .calendar-month-task-item → .gc-task-card--mini
```

#### 周视图 (WeekView)
```
.calendar-week-view             → .gc-view-week
└── .calendar-week-grid         → .gc-week__grid
    ├── .calendar-week-header-row   → .gc-week__header
    │   └── .calendar-day-header-cell → .gc-week__day-header
    │       ├── .day-name           → .gc-week__day-name
    │       ├── .day-number         → .gc-week__day-number
    │       └── .day-lunar          → .gc-week__day-lunar
    └── .calendar-week-tasks-grid   → .gc-week__tasks-grid
        └── .calendar-week-tasks-column → .gc-week__day-column
            └── .calendar-task-card → .gc-task-card
```

#### 日视图 (DayView)
```
.calendar-day-view              → .gc-view-day
└── .calendar-day-split-container → .gc-day__split-container
    ├── .calendar-day-tasks-section   → .gc-day__tasks-section
    │   ├── .calendar-day-tasks-title → .gc-day__section-title
    │   └── .calendar-day-tasks-list  → .gc-day__tasks-list
    │       └── .calendar-task-card  → .gc-task-card
    ├── .calendar-day-divider        → .gc-day__divider
    └── .calendar-day-notes-section  → .gc-day__notes-section
        ├── .calendar-day-notes-title → .gc-day__section-title
        └── .calendar-day-notes-content → .gc-day__notes-content
            └── .calendar-day-notes-markdown → .gc-day__markdown
```

#### 任务视图 (TaskView)
```
.calendar-task-view             → .gc-view-task
└── .task-view-list             → .gc-task__list
    └── .calendar-task-card     → .gc-task-card
```

#### 甘特图视图 (GanttView)
```
.calendar-gantt-view           → .gc-view-gantt
└── .gantt-view-body           → .gc-gantt__body
    ├── .gantt-view-tasks      → .gc-gantt__tasks
    │   ├── .gantt-view-tasks-header → .gc-gantt__header
    │   └── .gantt-view-task-list    → .gc-gantt__task-list
    │       └── .calendar-task-card → .gc-task-card.gc-task-card--gantt
    ├── .gantt-view-resizer    → .gc-gantt__resizer
    └── .gantt-view-time       → .gc-gantt__timeline
        ├── .gantt-view-timeline → .gc-gantt__timeline-header
        │   └── .gantt-timeline-scroll → .gc-gantt__timeline-scroll
        │       └── .gantt-timeline-row → .gc-gantt__timeline-row
        │           └── .gantt-date-cell → .gc-gantt__date-cell
        ├── .gantt-view-bars    → .gc-gantt__bars
        │   └── .gantt-bars-scroll → .gc-gantt__bars-scroll
        │       └── .gantt-bars-grid → .gc-gantt__bars-grid
        │           └── .gantt-bar-row → .gc-gantt__bar-row
        │               └── .gantt-bar → .gc-gantt__bar
        └── .gantt-today-overlay → .gc-gantt__today-overlay
            └── .gantt-today-line → .gc-gantt__today-line
```

---

## 8. 总结

### 8.1 主要问题

1. **前缀混乱**：`calendar-`、`gantt-`、`toolbar-` 混用
2. **命名不一致**：相同功能使用不同类名
3. **缺少层级**：无法从类名看出元素关系
4. **BEM不规范**：修饰符使用不统一
5. **过长类名**：如 `toolbar-right-task-field-filter-group`

### 8.2 重构目标

1. ✅ 统一前缀为 `gc-`
2. ✅ 采用BEM命名规范
3. ✅ 统一任务卡片类名
4. ✅ 简化工具栏类名
5. ✅ 保持语义清晰

### 8.3 预期收益

- **代码可维护性** ⬆️ 50%
- **CSS体积** ⬇️ 20%（复用性提升）
- **开发效率** ⬆️ 30%（统一的类名）
- **插件性能** ↔️ （无影响）

---

**生成时间**: 2025-12-26
**分析版本**: current master
**文档版本**: 1.0
