# Obsidian Gantt Calendar - DOM结构分析报告

> **生成时间**: 2025-12-26 (已更新)
> **分析版本**: current master
> **文档版本**: 2.0

## 目录
- [1. 整体容器结构](#1-整体容器结构)
- [2. 工具栏系统](#2-工具栏系统)
- [3. 视图对比表格](#3-视图对比表格)
- [4. 任务卡片结构对比](#4-任务卡片结构对比)
- [5. 标签与优先级系统](#5-标签与优先级系统)
- [6. 命名规范问题分析](#6-命名规范问题分析)
- [7. 重构建议](#7-重构建议)
- [8. 完整类名索引](#8-完整类名索引)

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
| 月视图 | `.calendar-task-card.calendar-task-card--month` | ✅ | ❌ 无 | `.calendar-task-card-text` |
| 周视图 | `.calendar-task-card.calendar-task-card--week` | ✅ | `.calendar-week-task-checkbox` | `.calendar-week-task-text` |
| 日视图 | `.calendar-task-card.calendar-task-card--day` | ✅ | `.gantt-task-checkbox` | `.gantt-task-text` |
| 任务视图 | `.calendar-task-card.calendar-task-card--task` | ✅ | `.gantt-task-checkbox` | `.gantt-task-text` |
| 甘特图 | `.calendar-task-card.calendar-task-card--gantt` | ✅ | `.gantt-task-checkbox` | (内联文本) |

**改进情况（相对于旧版本）：**
- ✅ 月视图已统一使用 `calendar-task-card + --month` 修饰符
- ✅ 所有视图都使用统一的基础类名 `.calendar-task-card`
- ⚠️ 周视图的复选框和文本类名仍然特殊：`calendar-week-*`
- ⚠️ 日视图、任务视图、甘特图使用 `gantt-task-*` 前缀的子组件类名

### 4.2 当前任务卡片实际DOM结构

#### 月视图任务卡片 (MonthView.ts:127-139)
```html
<div class="calendar-task-card calendar-task-card--month completed/pending">
    <div class="calendar-task-card-text">
        <!-- 富文本渲染的描述内容，可能包含链接 -->
        <a class="gantt-task-link obsidian-link">...</a>
    </div>
    <!-- 标签容器 -->
    <div class="gantt-task-tags-inline">
        <span class="gantt-tag-badge tag-color-0">#tag1</span>
        <span class="gantt-tag-badge tag-color-1">#tag2</span>
    </div>
</div>
```

#### 周视图任务卡片 (WeekView.ts:159-203)
```html
<div class="calendar-task-card calendar-task-card--week completed/pending"
     draggable="true" data-task-id="file.md:10" data-target-date="2025-01-15">
    <input type="checkbox" class="gantt-task-checkbox calendar-week-task-checkbox" />
    <div class="calendar-week-task-text">
        <!-- 富文本渲染的描述内容 -->
    </div>
    <!-- 标签容器 -->
    <div class="gantt-task-tags-inline">
        <span class="gantt-tag-badge tag-color-0">#tag1</span>
    </div>
</div>
```

#### 日视图任务卡片 (DayView.ts:150-221)
```html
<div class="calendar-task-card calendar-task-card--day completed/pending">
    <input type="checkbox" class="gantt-task-checkbox" />
    <div class="gantt-task-text">
        <!-- 任务描述（富文本） -->
    </div>
    <!-- 优先级 -->
    <div class="gantt-task-priority-inline">
        <span class="gantt-priority-badge priority-high">⏫</span>
    </div>
    <!-- 时间属性 -->
    <div class="gantt-task-time-properties-inline">
        <span class="gantt-time-badge gantt-time-created">➕ 创建:2025-01-10</span>
        <span class="gantt-time-badge gantt-time-due gantt-overdue">📅 截止:2024-12-01</span>
    </div>
    <!-- 文件位置 -->
    <span class="gantt-task-file">file.md:10</span>
    <!-- 警告图标（可选） -->
    <span class="gantt-task-warning-icon">⚠️</span>
</div>
```

#### 任务视图任务卡片 (TaskView.ts:172-246)
```html
<div class="calendar-task-card calendar-task-card--task completed/pending task-with-status">
    <input type="checkbox" class="gantt-task-checkbox" />
    <div class="gantt-task-text">
        <!-- 任务描述（富文本） -->
    </div>
    <!-- 标签 -->
    <div class="gantt-task-tags-inline">...</div>
    <!-- 优先级 -->
    <div class="gantt-task-priority-inline">...</div>
    <!-- 时间属性 -->
    <div class="gantt-task-time-properties-inline">...</div>
    <span class="gantt-task-file">file.md:10</span>
    <span class="gantt-task-warning-icon">⚠️</span>
</div>
```

#### 甘特图任务卡片 (GanttView.ts:337-362)
```html
<div class="calendar-task-card calendar-task-card--gantt completed/pending task-with-status"
     title="完整任务描述">
    <!-- 内联文本，不使用单独容器 -->
    (任务描述文本)
    <a class="gantt-task-link obsidian-link">...</a>
</div>
<!-- 对应的甘特条 -->
<div class="gantt-bar-row">
    <div class="gantt-bar completed" style="grid-column: 1 / 5;"
         title="2025-01-01 → 2025-01-05"></div>
</div>
```

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

---

## 5. 标签与优先级系统

### 5.1 标签系统

**CSS类名 (styles.css:773-841):**
```css
.gantt-task-tags-inline      /* 标签容器 - flex布局 */
.gantt-tag-badge              /* 标签徽章 */
.tag-color-0 到 tag-color-5   /* 6种标签颜色变体 */
```

**创建位置 (BaseViewRenderer.ts:430-447):**
```typescript
protected renderTaskTags(task: GanttTask, container: HTMLElement): void {
    const tagsContainer = container.createDiv('gantt-task-tags-inline');
    task.tags.forEach(tag => {
        const tagEl = tagsContainer.createEl('span', {
            text: `#${tag}`,
            cls: 'gantt-tag-badge'
        });
        // 颜色基于字符串hash自动分配 (0-5)
        const colorIndex = this.getStringHashCode(tag) % 6;
        tagEl.addClass(`tag-color-${colorIndex}`);
    });
}
```

**使用视图:**
- 月视图: `✅` 支持
- 周视图: `✅` 支持
- 日视图: ❌ 不显示
- 任务视图: `✅` 支持
- 甘特图: ❌ 不显示

### 5.2 优先级系统

**CSS类名 (styles.css:1846-1881):**
```css
.gantt-task-priority-inline    /* 优先级容器 */
.gantt-priority-badge          /* 优先级徽章 */
.priority-highest              /* 🔺 最高优先级 - 红色 */
.priority-high                 /* ⏫ 高优先级 - 橙色 */
.priority-medium               /* 🔼 中优先级 - 黄色 */
.priority-low                  /* 🔽 低优先级 - 绿色 */
.priority-lowest               /* ⏬ 最低优先级 - 蓝色 */
```

**优先级图标映射 (BaseViewRenderer.ts:48-57):**
```typescript
protected getPriorityIcon(priority?: string): string {
    switch (priority) {
        case 'highest': return '🔺';
        case 'high': return '⏫';
        case 'medium': return '🔼';
        case 'low': return '🔽';
        case 'lowest': return '⏬';
        default: return '';
    }
}
```

**使用视图:**
- 月视图: ❌ 不显示
- 周视图: ❌ 不显示
- 日视图: `✅` 支持
- 任务视图: `✅` 支持
- 甘特图: ❌ 不显示

### 5.3 时间属性系统

**CSS类名 (styles.css:1884-1908):**
```css
.gantt-task-time-properties-inline  /* 时间属性容器 */
.gantt-time-badge                    /* 时间徽章 */
.gantt-time-created                  /* 创建日期 */
.gantt-time-start                    /* 开始日期 */
.gantt-time-scheduled                /* 计划日期 */
.gantt-time-due                      /* 截止日期 */
.gantt-time-cancelled                /* 取消日期 */
.gantt-time-completion               /* 完成日期 */
.gantt-overdue                       /* 逾期状态修饰符 */
```

**使用视图:**
- 月视图: ❌ 不显示
- 周视图: ❌ 不显示
- 日视图: `✅` 支持
- 任务视图: `✅` 支持
- 甘特图: ❌ 不显示（仅tooltip中显示）

### 5.4 Tooltip悬浮提示系统

**CSS类名 (styles.css:1199-1293):**
```css
.calendar-week-task-tooltip         /* 悬浮提示容器 */
.tooltip-show                       /* 显示状态修饰符 */
.tooltip-description                /* 任务描述区 */
.tooltip-priority                   /* 优先级区 */
.tooltip-time-properties            /* 时间属性区 */
.tooltip-time-item                  /* 单个时间项 */
.tooltip-overdue                    /* 逾期标记 */
.tooltip-tags                       /* 标签区 */
.tooltip-label                      /* 标签标题 */
.tooltip-tag-badge                  /* 标签徽章 */
.tooltip-file                       /* 文件位置区 */
.tooltip-file-location              /* 文件路径文本 */
```

**DOM结构 (BaseViewRenderer.ts:176-246):**
```html
<div class="calendar-week-task-tooltip tooltip-show">
    <div class="tooltip-description">
        <strong>任务描述</strong>
    </div>
    <div class="tooltip-priority">
        <span class="priority-high">⏫ 优先级: high</span>
    </div>
    <div class="tooltip-time-properties">
        <div class="tooltip-time-item">➕ 创建: 2025-01-10</div>
        <div class="tooltip-time-item">📅 截止: 2025-01-15</div>
    </div>
    <div class="tooltip-tags">
        <span class="tooltip-label">标签：</span>
        <span class="tooltip-tag-badge">#tag1</span>
        <span class="tooltip-tag-badge">#tag2</span>
    </div>
    <div class="tooltip-file">
        <span class="tooltip-file-location">📄 file.md:10</span>
    </div>
</div>
```

**命名问题:**
- ❌ `.calendar-week-task-tooltip` - 名称暗示周视图专属，实际所有视图共享
- ✅ 建议: `.gc-tooltip` 或 `.gantt-task-tooltip`

---

## 6. 命名规范问题分析

### 6.1 前缀使用统计

| 前缀 | 类名数量 | 使用场景 | 评估 |
|------|---------|---------|------|
| `calendar-*` | ~50 | 日历视图容器、日期单元格 | ✅ 合理但较长 |
| `gantt-*` | ~30 | 甘特图视图、任务组件 | ⚠️ 误用于非甘特图任务 |
| `toolbar-*` | ~20 | 工具栏组件 | ✅ 语义清晰 |
| `tooltip-*` | ~10 | 悬浮提示组件 | ⚠️ 缺少前缀，易冲突 |
| `heatmap-*` | ~40 | 热力图颜色变体 | ✅ 语义清晰 |
| `task-view-*` | ~5 | 任务视图特定 | ✅ 语义清晰 |

### 6.2 改进情况对比

| 方面 | 旧版本 | 当前版本 | 状态 |
|------|--------|---------|------|
| 任务卡片基础类 | 混乱 | 统一为 `.calendar-task-card` | ✅ 已改进 |
| 月视图任务 | `.calendar-month-task-item` | `.calendar-task-card--month` | ✅ 已统一 |
| 视图修饰符 | 不一致 | 使用 BEM `--view` 修饰符 | ✅ 已改进 |
| 任务文本类 | 多种不同 | 仍有3种变体 | ⚠️ 部分改进 |
| 复选框类名 | 不一致 | 仍有2种变体 | ⚠️ 部分改进 |

### 6.3 剩余问题点

#### 问题A: 任务文本类名不统一

```css
/* 月视图 */
.calendar-task-card-text

/* 周视图 */
.calendar-week-task-text

/* 日视图、任务视图 */
.gantt-task-text
```

**影响**: CSS样式需要针对不同类名分别编写

#### 问题B: 复选框类名不统一

```css
/* 周视图：额外添加了专用类 */
.gantt-task-checkbox.calendar-week-task-checkbox

/* 其他视图：仅基础类 */
.gantt-task-checkbox
```

#### 问题C: 前缀语义问题

```css
/* gantt- 前缀用于任务组件（非甘特图专属） */
.gantt-task-checkbox        /* 通用任务复选框 */
.gantt-task-text            /* 通用任务文本 */
.gantt-task-tags-inline     /* 通用任务标签 */
.gantt-task-priority-inline /* 通用任务优先级 */
```

**问题**: 这些组件在日视图、任务视图、周视图都会使用，不是甘特图专属

#### 问题D: Tooltip命名误导

```css
.calendar-week-task-tooltip  /* 名称暗示周视图专属 */
```

**实际情况**: 所有视图的任务悬浮提示都使用此类名

---

## 7. 重构建议

### 7.1 优先级改进项

#### P0 - 高优先级（影响维护性）

| 问题 | 当前状态 | 建议修改 | 影响范围 |
|------|---------|---------|---------|
| 任务文本类名不统一 | 3种变体 | 统一为 `.task-text` | 4个视图 |
| 复选框类名冗余 | 周视图双类名 | 移除 `.calendar-week-task-checkbox` | WeekView.ts |
| Tooltip命名误导 | `calendar-week-task-tooltip` | 改为 `.task-tooltip` | BaseViewRenderer.ts |

#### P1 - 中优先级（影响一致性）

| 问题 | 当前状态 | 建议修改 | 影响范围 |
|------|---------|---------|---------|
| `gantt-` 前缀误用 | 通用任务组件使用 | 改为 `.task-` 前缀 | 多处 |
| 排序下拉菜单类名 | 无前缀 | 添加 `.gc-` 前缀 | sort-button.ts |

#### P2 - 低优先级（可选优化）

| 问题 | 当前状态 | 建议修改 | 影响范围 |
|------|---------|---------|---------|
| 视图类名过长 | `.calendar-year-container` | 缩短为 `.view-year` | 所有视图 |
| 修饰符风格不一致 | 混合使用 | 统一BEM风格 | 所有组件 |

### 7.2 渐进式重构方案

#### 阶段1: 统一任务卡片组件（最小影响）

```typescript
// 修改文件: BaseViewRenderer.ts, WeekView.ts, MonthView.ts

// 统一任务文本类名
.gantt-task-text           // 当前 (日/任务视图)
.calendar-week-task-text   // 当前 (周视图)
.calendar-task-card-text   // 当前 (月视图)
↓
.calendar-task-text         // 统一后
```

**步骤:**
1. 在 `styles.css` 中添加新类名规则，指向旧样式
2. 更新 `BaseViewRenderer.ts` 中的 `renderTaskDescriptionWithLinks()` 调用
3. 更新各视图的文本容器创建代码
4. 测试所有视图
5. 移除旧类名样式

#### 阶段2: 重命名 Tooltip 组件

```typescript
// 修改文件: BaseViewRenderer.ts:176

calendar-week-task-tooltip → task-tooltip
tooltip-show → tooltip--visible
```

#### 阶段3: 统一任务子组件前缀

```css
/* 当前 */
.gantt-task-checkbox
.gantt-task-text
.gantt-task-tags-inline
.gantt-task-priority-inline
.gantt-task-time-properties-inline
.gantt-task-file
.gantt-task-warning-icon

/* 建议统一为 */
.task-checkbox
.task-text
.task-tags-inline
.task-priority-inline
.task-time-properties-inline
.task-file
.task-warning-icon
```

### 7.3 BEM规范统一方案

如果采用完整BEM重构，建议的类名映射：

```css
/* ========== 任务卡片 ========== */
/* 当前 → 建议 */
.calendar-task-card              → .task-card
.calendar-task-card--month       → .task-card--month
.calendar-task-card--week        → .task-card--week
.calendar-task-card--day         → .task-card--day
.calendar-task-card--task        → .task-card--list
.calendar-task-card--gantt       → .task-card--gantt

/* ========== 任务组件 ========== */
.gantt-task-checkbox             → .task-card__checkbox
.calendar-task-card-text         → .task-card__text
.gantt-task-tags-inline          → .task-card__tags
.gantt-tag-badge                 → .task-card__tag
.gantt-task-priority-inline      → .task-card__priority
.gantt-priority-badge            → .task-card__priority-badge
.gantt-task-time-properties-inline → .task-card__times
.gantt-time-badge                → .task-card__time
.gantt-task-file                 → .task-card__file
.gantt-task-warning-icon         → .task-card__warning

/* ========== 视图容器 ========== */
.calendar-year-container         → .view-year
.calendar-month-view             → .view-month
.calendar-week-view              → .view-week
.calendar-day-view               → .view-day
.calendar-task-view              → .view-task
.calendar-gantt-view             → .view-gantt

/* ========== 工具栏 ========== */
.calendar-toolbar                → .toolbar
.calendar-toolbar-left           → .toolbar__left
.calendar-toolbar-center         → .toolbar__center
.calendar-toolbar-right          → .toolbar__right
.calendar-toggle-btn             → .toolbar__view-btn
.calendar-nav-compact-btn        → .toolbar__nav-btn
.toolbar-sort-dropdown           → .toolbar__sort-dropdown

/* ========== Tooltip ========== */
.calendar-week-task-tooltip      → .tooltip
.tooltip-show                    → .tooltip--visible
.tooltip-description             → .tooltip__description
.tooltip-priority                → .tooltip__priority
.tooltip-time-properties         → .tooltip__times
.tooltip-tags                    → .tooltip__tags
.tooltip-file                    → .tooltip__file
```

### 7.4 CSS迁移示例

**迁移前 (styles.css:703-727):**
```css
.calendar-task-card {
    display: flex;
    align-items: center;
    padding: 8px;
    /* ... */
}

.calendar-task-card--day {
    padding: 10px;
    gap: 8px;
    /* ... */
}
```

**迁移后 (使用简短前缀):**
```css
/* 使用更简短、语义化的类名 */
.task-card {
    display: flex;
    align-items: center;
    padding: 8px;
    /* ... */
}

.task-card--day {
    padding: 10px;
    gap: 8px;
    /* ... */
}
```

---

## 8. 完整类名索引

### 8.1 按功能分类

#### 根容器类
| 类名 | CSS位置 | TS位置 | 用途 |
|------|---------|--------|------|
| `.view-content.gantt-root` | styles.css:66 | CalendarView.ts:169 | 甘特图模式根容器 |
| `.calendar-content` | styles.css:49 | - | 主内容区域 |
| `.calendar-content.gantt-mode` | styles.css:58 | CalendarView.ts:168 | 甘特图模式标识 |

#### 工具栏类 (styles.css:295-702)
| 类名 | 用途 |
|------|------|
| `.calendar-toolbar` | 工具栏主容器 |
| `.calendar-toolbar-left` | 左侧区域（视图切换） |
| `.calendar-toolbar-center` | 中间区域（日期显示） |
| `.calendar-toolbar-right` | 右侧区域（控制按钮） |
| `.calendar-toggle-group` | 切换按钮组容器 |
| `.calendar-toggle-btn` | 视图切换按钮（Tasks/Calendar/Gantt） |
| `.calendar-toggle-btn.active` | 激活状态的切换按钮 |
| `.calendar-nav-buttons` | 导航按钮组（日历视图） |
| `.calendar-nav-compact-btn` | 紧凑型导航按钮 |
| `.calendar-view-compact-btn` | 紧凑型视图选择按钮 |
| `.calendar-date-display` | 日期文本显示 |
| `.calendar-view-selector` | 视图选择器容器 |
| `.toolbar-right-task-refresh-btn` | 刷新按钮 |

#### 任务视图工具栏类 (styles.css:396-518)
| 类名 | 用途 |
|------|------|
| `.toolbar-right-task` | 任务视图工具栏右侧容器 |
| `.toolbar-right-task-status-group` | 状态筛选组 |
| `.toolbar-right-task-status-label` | 状态筛选标签 |
| `.toolbar-right-task-status-select` | 状态下拉选择 |
| `.toolbar-right-task-field-filter-group` | 字段筛选组 |
| `.toolbar-right-task-field-select` | 字段下拉选择 |
| `.toolbar-right-task-date-filter-group` | 日期筛选组 |
| `.toolbar-right-task-date-input` | 日期输入框 |
| `.toolbar-right-task-date-mode-btn` | 日期模式按钮 |
| `.toolbar-right-task-date-mode-btn.active` | 激活的日期模式 |

#### 甘特图工具栏类 (styles.css:628-702)
| 类名 | 用途 |
|------|------|
| `.toolbar-right-gantt` | 甘特图工具栏右侧容器 |
| `.toolbar-time-granularity-group` | 时间颗粒度选择组 |
| `.time-today-btn` | 今天按钮 |
| `.time-granularity-btn` | 颗粒度按钮 |
| `.time-granularity-btn.active` | 激活的颗粒度 |
| `.toolbar-gantt-field-group` | 字段选择组 |
| `.toolbar-gantt-field-select` | 字段下拉选择 |

#### 排序组件类 (styles.css:2495-2574)
| 类名 | 用途 |
|------|------|
| `.toolbar-sort-button-container` | 排序按钮容器 |
| `.toolbar-sort-btn` | 排序按钮 |
| `.toolbar-sort-icon` | 排序图标 |
| `.toolbar-sort-dropdown-icon` | 下拉箭头图标 |
| `.toolbar-sort-dropdown` | 排序下拉菜单 |
| `.toolbar-sort-dropdown-header` | 下拉菜单头部 |
| `.toolbar-sort-menu-item` | 排序菜单项 |
| `.toolbar-sort-menu-item.active` | 激活的排序项 |
| `.toolbar-sort-option-icon` | 选项图标 |
| `.toolbar-sort-option-label` | 选项标签 |
| `.toolbar-sort-option-indicator` | 选项指示器 |

#### 任务卡片类 (styles.css:703-770, 1839-1933)
| 类名 | 用途 |
|------|------|
| `.calendar-task-card` | 任务卡片基础类 |
| `.calendar-task-card--day` | 日视图任务卡片修饰符 |
| `.calendar-task-card--week` | 周视图任务卡片修饰符 |
| `.calendar-task-card--month` | 月视图任务卡片修饰符 |
| `.calendar-task-card--task` | 任务视图修饰符 |
| `.calendar-task-card--gantt` | 甘特图修饰符 |
| `.calendar-task-card-text` | 月视图任务文本 |
| `.calendar-week-task-text` | 周视图任务文本 |
| `.gantt-task-text` | 日/任务视图任务文本 |
| `.gantt-task-checkbox` | 任务复选框 |
| `.calendar-week-task-checkbox` | 周视图复选框（额外类） |

#### 标签系统类 (styles.css:773-879)
| 类名 | 用途 |
|------|------|
| `.gantt-task-tags-inline` | 标签容器 |
| `.gantt-tag-badge` | 标签徽章 |
| `.gantt-tag-badge.tag-color-0/1/2/3/4/5` | 6种颜色变体 |
| `.tooltip-tags` | Tooltip标签容器 |
| `.tooltip-label` | Tooltip标签标题 |
| `.tooltip-tag-badge` | Tooltip标签徽章 |

#### 优先级系统类 (styles.css:1846-1881)
| 类名 | 用途 |
|------|------|
| `.gantt-task-priority-inline` | 优先级容器 |
| `.gantt-priority-badge` | 优先级徽章 |
| `.priority-highest/high/medium/low/lowest` | 5种优先级等级 |

#### 时间属性类 (styles.css:1884-1908)
| 类名 | 用途 |
|------|------|
| `.gantt-task-time-properties-inline` | 时间属性容器 |
| `.gantt-time-badge` | 时间徽章 |
| `.gantt-time-created/start/scheduled/due/cancelled/completion` | 6种时间类型 |
| `.gantt-overdue` | 逾期状态 |

#### 其他任务组件类
| 类名 | 用途 |
|------|------|
| `.gantt-task-file` | 文件位置信息 |
| `.gantt-task-warning-icon` | 警告图标 |
| `.gantt-task-link` | 任务描述链接 |
| `.completed` | 已完成状态 |
| `.pending` | 待处理状态 |
| `.task-with-status` | 自定义状态任务 |

#### 视图容器类
| 类名 | 用途 | 文件 |
|------|------|------|
| `.calendar-year-container` | 年视图根 | YearView.ts:29 |
| `.calendar-month-view` | 月视图根 | MonthView.ts:15 |
| `.calendar-week-view` | 周视图根 | WeekView.ts:27 |
| `.calendar-day-view` | 日视图根 | DayView.ts:24 |
| `.calendar-task-view` | 任务视图根 | TaskView.ts:92 |
| `.calendar-gantt-view` | 甘特图根 | GanttView.ts:71 |

#### 年视图组件类 (styles.css:893-987)
| 类名 | 用途 |
|------|------|
| `.calendar-months-grid` | 12月网格布局 |
| `.calendar-month-card` | 单月卡片 |
| `.calendar-month-header` | 月标题 |
| `.calendar-weekdays` | 星期标题行 |
| `.calendar-weekday` | 单个星期标签 |
| `.calendar-days-grid` | 日期网格 |
| `.calendar-day` | 日期单元格 |
| `.calendar-day-number` | 日期数字 |
| `.calendar-lunar-text` | 农历文本 |
| `.calendar-day-task-count` | 任务计数 |
| `.calendar-month-card.show-lunar` | 显示农历的月卡 |
| `.heatmap-{color}-{level}` | 热力图类 (8色×5级) |

#### 月视图组件类 (styles.css:990-1058)
| 类名 | 用途 |
|------|------|
| `.calendar-month-weekdays` | 星期标题行 |
| `.calendar-month-weekday` | 星期标签 |
| `.calendar-month-weeks` | 周列表 |
| `.calendar-week-row` | 单周行 |
| `.calendar-week-number` | 周编号 (W1/W2/...) |
| `.calendar-week-days` | 7天容器 |
| `.calendar-day-cell` | 日期单元格 |
| `.calendar-month-tasks` | 月任务列表 |
| `.calendar-month-task-more` | "更多任务"提示 |

#### 周视图组件类 (styles.css:1065-1299)
| 类名 | 用途 |
|------|------|
| `.calendar-week-grid` | 周网格 |
| `.calendar-week-header-row` | 标题行 |
| `.calendar-day-header-cell` | 日期头单元格 |
| `.day-name` | 星期名称 |
| `.day-number` | 日期数字 |
| `.day-lunar` | 农历 |
| `.calendar-week-tasks-grid` | 任务网格 |
| `.calendar-week-tasks-column` | 单列任务 |
| `.calendar-week-task-empty` | 空状态提示 |
| `.calendar-week-task-tooltip` | 悬浮提示容器 |
| `.tooltip-show` | 显示状态 |

#### 日视图组件类 (styles.css:1404-1544)
| 类名 | 用途 |
|------|------|
| `.calendar-day-split-container` | 水平分割容器 |
| `.calendar-day-split-container-vertical` | 垂直分割容器 |
| `.calendar-day-tasks-section-full` | 全宽任务区 |
| `.calendar-day-tasks-section` | 任务区域 |
| `.calendar-day-tasks-section-vertical` | 垂直任务区 |
| `.calendar-day-tasks-title` | 任务标题 |
| `.calendar-day-tasks-list` | 任务列表 |
| `.calendar-day-divider` | 分割线（水平） |
| `.calendar-day-divider-vertical` | 分割线（垂直） |
| `.calendar-day-notes-section` | 笔记区域 |
| `.calendar-day-notes-section-vertical` | 垂直笔记区 |
| `.calendar-day-notes-title` | 笔记标题 |
| `.calendar-day-notes-content` | 笔记内容 |
| `.calendar-day-notes-markdown` | Markdown渲染区 |

#### 甘特图组件类 (styles.css:130-1888)
| 类名 | 用途 |
|------|------|
| `.gantt-view-body` | 主体区域 |
| `.gantt-view-tasks` | 左侧任务列 |
| `.gantt-view-tasks-header` | 列标题 |
| `.gantt-view-task-list` | 任务列表 |
| `.gantt-view-resizer` | 可拖动分割线 |
| `.gantt-view-time` | 右侧时间轴 |
| `.gantt-view-timeline` | 时间刻度区 |
| `.gantt-timeline-scroll` | 横向滚动容器 |
| `.gantt-timeline-row` | 时间刻度行 |
| `.gantt-date-cell` | 日期单元格 |
| `.gantt-view-bars` | 甘特条区 |
| `.gantt-bars-scroll` | 横向滚动容器 |
| `.gantt-bars-grid` | 甘特条网格 |
| `.gantt-bar-row` | 甘特条行 |
| `.gantt-bar` | 单个甘特条 |
| `.gantt-today-overlay` | 今天线覆盖层 |
| `.gantt-today-line` | 今天线 |

#### Tooltip类 (styles.css:1199-1293)
| 类名 | 用途 |
|------|------|
| `.calendar-week-task-tooltip` | 悬浮提示容器 |
| `.tooltip-show` | 显示状态 |
| `.tooltip-description` | 描述区域 |
| `.tooltip-priority` | 优先级区域 |
| `.priority-{level}` | 优先级等级 |
| `.tooltip-time-properties` | 时间属性区域 |
| `.tooltip-time-item` | 单个时间项 |
| `.tooltip-overdue` | 逾期标记 |
| `.tooltip-file` | 文件位置区域 |
| `.tooltip-file-location` | 文件路径文本 |

#### 状态类
| 类名 | 用途 |
|------|------|
| `.completed` | 已完成 |
| `.pending` | 待处理 |
| `.task-with-status` | 自定义状态 |
| `.outside-month` | 非当月日期 |
| `.today` | 今天标记 |
| `.festival` | 节日标记 |
| `.festival-solar` | 阳历节日 |
| `.festival-lunar` | 农历节日 |
| `.festival-solarTerm` | 节气 |

#### 热力图类 (styles.css:1947-1993)
| 类名 | 用途 |
|------|------|
| `.calendar-day.heatmap-{color}-{level}` | 8种色调×5级强度 |
| 颜色: blue, green, red, purple, orange, cyan, pink, yellow |
| 级别: 1(浅) 到 5(深) |

#### 设置界面类 (styles.css:1995-2204)
| 类名 | 用途 |
|------|------|
| `.heatmap-palette-setting` | 热力图设置容器 |
| `.heatmap-palette-name` | 调色板名称 |
| `.heatmap-palette-desc` | 调色板描述 |
| `.heatmap-palette-list` | 调色板列表 |
| `.heatmap-palette-option` | 调色板选项 |
| `.heatmap-palette-option.selected` | 选中状态 |
| `.heatmap-palette-bars` | 色条显示 |
| `.heatmap-palette-bar` | 单色条 |
| `.festival-color-settings-container` | 节日颜色设置容器 |
| `.festival-color-setting` | 单个颜色设置 |
| `.festival-color-name` | 颜色名称 |
| `.festival-color-desc` | 颜色描述 |
| `.festival-color-picker` | 颜色选择器 |
| `.festival-color-swatch` | 颜色样本 |

### 8.2 按视图分类的完整DOM树

#### 年视图 (YearView.ts:11-107)
```
.calendar-year-container
└── .calendar-months-grid (4×3 grid)
    └── .calendar-month-card (×12)
        ├── .calendar-month-header
        │   └── h3: "一月"
        ├── .calendar-weekdays (grid 7列)
        │   └── .calendar-weekday (×7): "日" "一" "二" ...
        └── .calendar-days-grid (grid 7列)
            └── .calendar-day
                ├── .calendar-day-number: "15"
                ├── .calendar-lunar-text.festival(.festival-solar/.festival-lunar/.festival-solarTerm)
                └── .calendar-day-task-count
                    [热力图修饰符: .heatmap-blue-1 到 .heatmap-yellow-5]
                    [状态修饰符: .outside-month, .today]
```

#### 月视图 (MonthView.ts:10-122)
```
.calendar-month-view
├── .calendar-month-weekdays
│   ├── .calendar-month-weekday (空列 - 周编号占位)
│   └── .calendar-month-weekday (×7): "周日" "周一" ...
└── .calendar-month-weeks
    └── .calendar-week-row (×4-6)
        ├── .calendar-week-number: "W1"
        └── .calendar-week-days
            └── .calendar-day-cell
                ├── .calendar-day-number: "15"
                ├── .calendar-lunar-text.festival...
                └── .calendar-month-tasks
                    ├── .calendar-task-card.calendar-task-card--month
                    │   ├── .calendar-task-card-text
                    │   └── .gantt-task-tags-inline
                    │       └── .gantt-tag-badge.tag-color-*
                    └── .calendar-month-task-more: "+3 more"
                [状态修饰符: .outside-month, .today]
```

#### 周视图 (WeekView.ts:24-227)
```
.calendar-week-view
└── .calendar-week-grid
    ├── .calendar-week-header-row
    │   └── .calendar-day-header-cell (×7)
    │       ├── .day-name: "周一"
    │       ├── .day-number: "15"
    │       ├── .day-lunar: "初一"
    │       └── [状态修饰符: .today]
    └── .calendar-week-tasks-grid
        └── .calendar-week-tasks-column
            ├── .calendar-task-card.calendar-task-card--week
            │   ├── input.gantt-task-checkbox.calendar-week-task-checkbox
            │   ├── .calendar-week-task-text
            │   │   └── a.gantt-task-link.obsidian-link
            │   └── .gantt-task-tags-inline
            │       └── .gantt-tag-badge.tag-color-*
            └── .calendar-week-task-empty: "暂无任务"
```

#### 日视图 (DayView.ts:23-357)
```
.calendar-day-view
├── 模式A: 水平分割 → .calendar-day-split-container
│   ├── .calendar-day-tasks-section
│   │   ├── h3.calendar-day-tasks-title: "当日任务"
│   │   └── .calendar-day-tasks-list
│   │       └── .calendar-task-card.calendar-task-card--day
│   │           ├── input.gantt-task-checkbox
│   │           ├── .gantt-task-text
│   │           │   └── a.gantt-task-link.obsidian-link
│   │           ├── .gantt-task-priority-inline
│   │           │   └── .gantt-priority-badge.priority-high
│   │           ├── .gantt-task-time-properties-inline
│   │           │   ├── .gantt-time-badge.gantt-time-created
│   │           │   └── .gantt-time-badge.gantt-time-due.gantt-overdue
│   │           ├── .gantt-task-file: "file.md:10"
│   │           └── .gantt-task-warning-icon
│   ├── .calendar-day-divider
│   └── .calendar-day-notes-section
│       ├── h3.calendar-day-notes-title: "Daily Note"
│       └── .calendar-day-notes-content
│           └── .calendar-day-notes-markdown
├── 模式B: 垂直分割 → .calendar-day-split-container-vertical
└── 模式C: 仅任务 → .calendar-day-tasks-section-full
```

#### 任务视图 (TaskView.ts:90-268)
```
.calendar-task-view
└── .task-view-list
    └── .calendar-task-card.calendar-task-card--task
        ├── input.gantt-task-checkbox
        ├── .gantt-task-text
        │   └── a.gantt-task-link.obsidian-link
        ├── .gantt-task-tags-inline
        │   └── .gantt-tag-badge.tag-color-*
        ├── .gantt-task-priority-inline
        │   └── .gantt-priority-badge.priority-high
        ├── .gantt-task-time-properties-inline
        │   ├── .gantt-time-badge.gantt-time-created
        │   └── .gantt-time-badge.gantt-time-due.gantt-overdue
        ├── .gantt-task-file: "file.md:10"
        └── .gantt-task-warning-icon
```

#### 甘特图视图 (GanttView.ts:69-427)
```
.calendar-gantt-view
└── .gantt-view-body
    ├── .gantt-view-tasks (左侧任务列)
    │   ├── .gantt-view-tasks-header: "任务卡片"
    │   └── .gantt-view-task-list
    │       └── .calendar-task-card.calendar-task-card--gantt
    │           ├── (内联文本描述)
    │           └── a.gantt-task-link.obsidian-link
    ├── .gantt-view-resizer (可拖动分割线)
    └── .gantt-view-time (右侧时间轴)
        ├── .gantt-view-timeline
        │   └── .gantt-timeline-scroll
        │       └── .gantt-timeline-row (grid布局)
        │           └── .gantt-date-cell (×N): "2025-01-01"
        ├── .gantt-view-bars
        │   └── .gantt-bars-scroll
        │       └── .gantt-bars-grid (grid布局)
        │           └── .gantt-bar-row (×N)
        │               └── .gantt-bar [style="grid-column: 1/5"]
        └── .gantt-today-overlay
            └── .gantt-today-line
```

---

## 9. 总结

### 9.1 当前状态评估

| 方面 | 评分 | 说明 |
|------|------|------|
| 任务卡片统一性 | ⭐⭐⭐⭐☆ | 基础类已统一，修饰符使用BEM |
| 前缀语义准确性 | ⭐⭐⭐☆☆ | `gantt-` 前缀误用于通用任务组件 |
| BEM规范遵循度 | ⭐⭐⭐☆☆ | 修饰符使用不统一 |
| 命名一致性 | ⭐⭐⭐☆☆ | 同一功能存在3种变体 |

### 9.2 主要问题汇总

1. **任务文本类名不统一**: `.gantt-task-text` / `.calendar-week-task-text` / `.calendar-task-card-text`
2. **复选框类名冗余**: 周视图额外添加 `.calendar-week-task-checkbox`
3. **前缀语义误导**: `gantt-` 用于非甘特图专属组件
4. **Tooltip命名不准确**: `.calendar-week-task-tooltip` 暗示周视图专属

### 9.3 改进建议优先级

```
P0 (立即修复):
  - 统一任务文本类名
  - 重命名 tooltip 类

P1 (下个版本):
  - 移除周视图复选框冗余类
  - 统一任务子组件前缀

P2 (长期优化):
  - 完整BEM重构
  - 缩短视图类名
```

---

**生成时间**: 2025-12-26
**分析版本**: current master (commit 7b288f2)
**文档版本**: 2.0
**分析者**: Claude Code
