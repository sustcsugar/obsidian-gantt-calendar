# BEM规范DOM结构统一重构计划书

> **版本**: 1.0
> **日期**: 2025-12-26
> **状态**: 待实施

---

## 1. 概述

### 1.1 目标

将 Obsidian Gantt Calendar 插件的 DOM 结构统一为 BEM (Block Element Modifier) 规范，添加 `gc-` 前缀防止类名冲突，将任务卡片抽象为可复用组件。

### 1.2 核心原则

| 原则 | 说明 |
|------|------|
| **统一前缀** | 所有类名使用 `gc-` (Gantt Calendar) 前缀 |
| **BEM命名** | 遵循 `gc-block__element--modifier` 格式 |
| **向后兼容** | CSS阶段保留新旧类名，确保平滑过渡 |
| **渐进式重构** | 分阶段实施，降低风险 |

---

## 2. 类名映射方案

### 2.1 任务卡片 (gc-task-card)

#### Block结构
```
gc-task-card
├── gc-task-card__checkbox
├── gc-task-card__text
├── gc-task-card__tags
├── gc-task-card__priority
├── gc-task-card__times
├── gc-task-card__file
└── gc-task-card__warning
```

#### 修饰符
```css
--month    /* 月视图紧凑模式 */
--week     /* 周视图标准模式 */
--day      /* 日视图详细模式 */
--list     /* 任务列表模式 */
--gantt    /* 甘特图侧边栏 */
--completed/* 已完成 */
--pending  /* 待处理 */
```

#### 详细映射表

| 当前类名 | 新类名 | 说明 |
|---------|--------|------|
| `calendar-task-card` | `gc-task-card` | 基础卡片 |
| `calendar-task-card--month` | `gc-task-card--month` | 月视图修饰符 |
| `calendar-task-card--week` | `gc-task-card--week` | 周视图修饰符 |
| `calendar-task-card--day` | `gc-task-card--day` | 日视图修饰符 |
| `calendar-task-card--task` | `gc-task-card--list` | 任务列表修饰符 |
| `calendar-task-card--gantt` | `gc-task-card--gantt` | 甘特图修饰符 |
| `completed` | `gc-task-card--completed` | 完成状态 |
| `pending` | `gc-task-card--pending` | 待处理状态 |

#### Elements映射表

| 当前类名 | 新类名 |
|---------|--------|
| `gantt-task-checkbox` | `gc-task-card__checkbox` |
| `calendar-week-task-checkbox` | ~~移除~~ → 使用 `gc-task-card__checkbox` |
| `calendar-task-card-text` | `gc-task-card__text` |
| `calendar-week-task-text` | ~~移除~~ → 使用 `gc-task-card__text` |
| `gantt-task-text` | `gc-task-card__text` |
| `gantt-task-tags-inline` | `gc-task-card__tags` |
| `gantt-tag-badge` | `gc-tag` (独立Block) |
| `gantt-task-priority-inline` | `gc-task-card__priority` |
| `gantt-priority-badge` | `gc-task-card__priority-badge` |
| `gantt-task-time-properties-inline` | `gc-task-card__times` |
| `gantt-time-badge` | `gc-task-card__time-badge` |
| `gantt-task-file` | `gc-task-card__file` |
| `gantt-task-warning-icon` | `gc-task-card__warning` |
| `gantt-overdue` | `gc-task-card__time-badge--overdue` |

---

### 2.2 标签系统 (gc-tag)

**决策**: 标签作为独立Block，可在多上下文复用（任务卡片、Tooltip、筛选器）

```
gc-tag
├── --color-0 ~ --color-5  /* 6种颜色 */
├── --tooltip            /* Tooltip中使用 */
├── --selectable          /* 可选择状态 */
└── --selected           /* 已选中状态 */
```

#### 映射表

| 当前类名 | 新类名 |
|---------|--------|
| `gantt-tag-badge` | `gc-tag` |
| `tag-color-0` ~ `tag-color-5` | `gc-tag--color-0` ~ `gc-tag--color-5` |
| `tooltip-tag-badge` | `gc-tag gc-tag--tooltip` |
| `tag-filter-tag-item` | `gc-tag gc-tag--selectable` |
| `tag-filter-tag-item.selected` | `gc-tag--selected` |

---

### 2.3 日视图容器 (gc-day-view)

**设计决策**: 使用单一容器类 + 修饰符实现三种布局模式

```
gc-day-view--horizontal    /* 水平分屏 */
gc-day-view--vertical      /* 垂直分屏 */
gc-day-view--tasks-only    /* 仅任务 */
```

#### 映射表

| 当前类名 | 新类名 |
|---------|--------|
| `calendar-day-view` | `gc-day-view` (Block) |
| `calendar-day-split-container` | `gc-day-view--horizontal` |
| `calendar-day-split-container-vertical` | `gc-day-view--vertical` |
| `calendar-day-tasks-section-full` | `gc-day-view--tasks-only` |
| `calendar-day-tasks-section` | `gc-day-view__section--tasks` |
| `calendar-day-notes-section` | `gc-day-view__section--notes` |
| `calendar-day-tasks-title` | `gc-day-view__title` |
| `calendar-day-notes-title` | `gc-day-view__title` |
| `calendar-day-tasks-list` | `gc-day-view__task-list` |
| `calendar-day-notes-content` | `gc-day-view__notes-content` |
| `calendar-day-notes-markdown` | `gc-day-view__notes-body` |
| `calendar-day-divider` | `gc-day-view__divider` |
| `calendar-day-divider-vertical` | `gc-day-view__divider--vertical` |

---

### 2.4 Tooltip (gc-task-tooltip)

#### 映射表

| 当前类名 | 新类名 |
|---------|--------|
| `calendar-week-task-tooltip` | `gc-task-tooltip` |
| `tooltip-show` | `gc-task-tooltip--visible` |
| `tooltip-description` | `gc-task-tooltip__description` |
| `tooltip-priority` | `gc-task-tooltip__priority` |
| `tooltip-time-properties` | `gc-task-tooltip__times` |
| `tooltip-time-item` | `gc-task-tooltip__time-item` |
| `tooltip-overdue` | `gc-task-tooltip__time-item--overdue` |
| `tooltip-tags` | `gc-task-tooltip__tags` |
| `tooltip-tag-badge` | `gc-tag gc-tag--tooltip` |
| `tooltip-file` | `gc-task-tooltip__file` |
| `tooltip-file-location` | `gc-task-tooltip__file-location` |

---

### 2.5 视图容器 (gc-view)

#### 映射表

| 当前类名 | 新类名 |
|---------|--------|
| `calendar-year-container` | `gc-view gc-view--year` |
| `calendar-month-view` | `gc-view gc-view--month` |
| `calendar-week-view` | `gc-view gc-view--week` |
| `calendar-day-view` | `gc-view gc-view--day` |
| `calendar-task-view` | `gc-view gc-view--list` |
| `calendar-gantt-view` | `gc-view gc-view--gantt` |
| `calendar-content` | `gc-content` |
| `gantt-root` | `gc-content--gantt` |
| `gantt-mode` | `gc-content--gantt` |

---

### 2.6 工具栏 (gc-toolbar)

#### 映射表

| 当前类名 | 新类名 |
|---------|--------|
| `calendar-toolbar` | `gc-toolbar` |
| `calendar-toolbar-left` | `gc-toolbar__left` |
| `calendar-toolbar-center` | `gc-toolbar__center` |
| `calendar-toolbar-right` | `gc-toolbar__right` |
| `calendar-toggle-group` | `gc-toggle-group` |
| `calendar-toggle-btn` | `gc-toggle-btn` |
| `calendar-nav-buttons` | `gc-nav__buttons` |
| `calendar-nav-compact-btn` | `gc-nav__btn--compact` |
| `calendar-date-display` | `gc-date-display` |

---

### 2.7 其他组件

#### 链接
| 当前类名 | 新类名 |
|---------|--------|
| `gantt-task-link` | `gc-link` |
| `obsidian-link` | `gc-link--obsidian` |
| `markdown-link` | `gc-link--markdown` |
| `url-link` | `gc-link--url` |

#### 优先级
| 当前类名 | 新类名 |
|---------|--------|
| `priority-highest` | `gc-task-card__priority-badge--highest` |
| `priority-high` | `gc-task-card__priority-badge--high` |
| `priority-medium` | `gc-task-card__priority-badge--medium` |
| `priority-low` | `gc-task-card__priority-badge--low` |
| `priority-lowest` | `gc-task-card__priority-badge--lowest` |

#### 时间徽章
| 当前类名 | 新类名 |
|---------|--------|
| `gantt-time-created` | `gc-task-card__time-badge--created` |
| `gantt-time-start` | `gc-task-card__time-badge--start` |
| `gantt-time-scheduled` | `gc-task-card__time-badge--scheduled` |
| `gantt-time-due` | `gc-task-card__time-badge--due` |
| `gantt-time-cancelled` | `gc-task-card__time-badge--cancelled` |
| `gantt-time-completion` | `gc-task-card__time-badge--completion` |

---

## 3. 实施步骤

### 阶段1：CSS样式重构（保持兼容）

**文件**: `styles.css`

**操作**: 在每个现有选择器后添加新类名（逗号分隔）

```css
/* 示例：任务卡片基础样式 */
.calendar-task-card,
.gc-task-card {
    display: flex;
    align-items: center;
    padding: 8px;
    /* ... */
}

/* 示例：月视图修饰符 */
.calendar-task-card--month,
.gc-task-card--month {
    padding: 4px 6px;
    font-size: 11px;
    /* ... */
}
```

**需要修改的CSS区域**:
- 第703-769行：任务卡片基础样式
- 第773-841行：标签系统样式
- 第1065-1544行：各视图组件样式
- 第1199-1293行：Tooltip样式
- 第1846-1933行：任务组件样式

---

### 阶段2：创建BEM工具函数

**新建文件**: `src/utils/bem.ts`

```typescript
/**
 * BEM类名生成函数
 * @param block - Block名称（不含前缀）
 * @param element - Element名称（可选）
 * @param modifier - 修饰符名称（可选）
 * @returns 完整的BEM类名
 */
export const bem = (block: string, element?: string, modifier?: string): string => {
    let cls = `gc-${block}`;
    if (element) cls += `__${element}`;
    if (modifier) cls += `--${modifier}`;
    return cls;
};

/**
 * 任务卡片类名常量
 */
export const TaskCardClasses = {
    block: bem('task-card'),
    elements: {
        checkbox: bem('task-card', 'checkbox'),
        text: bem('task-card', 'text'),
        tags: bem('task-card', 'tags'),
        priority: bem('task-card', 'priority'),
        priorityBadge: bem('task-card', 'priority-badge'),
        times: bem('task-card', 'times'),
        timeBadge: bem('task-card', 'time-badge'),
        file: bem('task-card', 'file'),
        warning: bem('task-card', 'warning'),
    },
    modifiers: {
        month: bem('task-card', null, 'month'),
        week: bem('task-card', null, 'week'),
        day: bem('task-card', null, 'day'),
        list: bem('task-card', null, 'list'),
        gantt: bem('task-card', null, 'gantt'),
        completed: bem('task-card', null, 'completed'),
        pending: bem('task-card', null, 'pending'),
    }
};

/**
 * Tooltip类名常量
 */
export const TooltipClasses = {
    block: bem('task-tooltip'),
    elements: {
        description: bem('task-tooltip', 'description'),
        priority: bem('task-tooltip', 'priority'),
        times: bem('task-tooltip', 'times'),
        timeItem: bem('task-tooltip', 'time-item'),
        tags: bem('task-tooltip', 'tags'),
        file: bem('task-tooltip', 'file'),
        fileLocation: bem('task-tooltip', 'file-location'),
    },
    modifiers: {
        visible: bem('task-tooltip', null, 'visible'),
    }
};

/**
 * 标签类名常量
 */
export const TagClasses = {
    block: bem('tag'),
    modifiers: {
        colors: [0, 1, 2, 3, 4, 5].map(i => bem('tag', null, `color-${i}`)),
        tooltip: bem('tag', null, 'tooltip'),
        selectable: bem('tag', null, 'selectable'),
        selected: bem('tag', null, 'selected'),
    }
};
```

---

### 阶段3：重构BaseCalendarRenderer

**文件**: `src/views/BaseCalendarRenderer.ts`

**修改方法**:

1. `createTaskCheckbox()` (第122-153行)
   - 类名: `gantt-task-checkbox` → `gc-task-card__checkbox`

2. `renderTaskTags()` (第430-461行)
   - 容器: `gantt-task-tags-inline` → `gc-task-card__tags`
   - 标签: `gantt-tag-badge` → `gc-tag`
   - 颜色: `tag-color-*` → `gc-tag--color-*`

3. `createTaskTooltip()` (第158-310行)
   - 容器: `calendar-week-task-tooltip` → `gc-task-tooltip`
   - 显示状态: `tooltip-show` → `gc-task-tooltip--visible`
   - 内部元素全部按BEM重命名

4. `renderTaskDescriptionWithLinks()` (第326-422行)
   - 链接: `gantt-task-link` → `gc-link`
   - 类型修饰符: `obsidian-link` → `gc-link--obsidian`

---

### 阶段4：重构视图文件

#### 4.1 DayView.ts

**修改点**:

1. 主容器创建 (第24行)
   ```typescript
   const dayContainer = container.createDiv('gc-view gc-view--day');
   ```

2. 三种布局模式 (第32-39, 第52-53, 第80行)
   ```typescript
   // 水平布局
   const splitContainer = dayContainer.createDiv('gc-day-view gc-day-view--horizontal');

   // 垂直布局
   const splitContainer = dayContainer.createDiv('gc-day-view gc-day-view--vertical');

   // 仅任务
   const tasksSection = dayContainer.createDiv('gc-day-view gc-day-view--tasks-only');
   ```

3. 子元素类名更新

#### 4.2 WeekView.ts

**修改点**:

1. 移除周视图特殊复选框类 (第176行)
   ```typescript
   // 移除: checkbox.addClass('calendar-week-task-checkbox');
   ```

2. 统一文本类名 (第195行)
   ```typescript
   const taskTextEl = taskItem.createDiv('gc-task-card__text');
   ```

#### 4.3 MonthView.ts, TaskView.ts, GanttView.ts, YearView.ts

**修改点**:

- 更新视图容器类名
- 更新任务卡片类名
- 更新内部元素类名

---

### 阶段5：重构工具栏

**文件**: `src/toolbar/*.ts`

**类名映射**:

| 当前类名 | 新类名 |
|---------|--------|
| `calendar-toolbar` | `gc-toolbar` |
| `calendar-toolbar-left` | `gc-toolbar__left` |
| `calendar-toolbar-center` | `gc-toolbar__center` |
| `calendar-toolbar-right` | `gc-toolbar__right` |
| `toolbar-sort-button-container` | `gc-sort-container` |
| `toolbar-sort-dropdown` | `gc-sort-dropdown` |

---

### 阶段6：清理工作

1. 确认所有功能正常后，从CSS中移除旧类名
2. 从代码中移除旧类名引用
3. 更新相关文档

---

## 4. 关键文件清单

| 文件路径 | 修改类型 | 优先级 |
|----------|----------|--------|
| `styles.css` | 添加新BEM类名 | 高 |
| `src/utils/bem.ts` | **新建** | 高 |
| `src/views/BaseCalendarRenderer.ts` | 更新类名 | 高 |
| `src/views/DayView.ts` | 布局+类名 | 高 |
| `src/views/WeekView.ts` | 移除特殊类名 | 高 |
| `src/views/MonthView.ts` | 更新类名 | 中 |
| `src/views/TaskView.ts` | 更新类名 | 中 |
| `src/views/GanttView.ts` | 更新类名 | 中 |
| `src/views/YearView.ts` | 更新类名 | 低 |
| `src/toolbar/toolbar.ts` | 更新类名 | 低 |
| `src/toolbar/sort-button.ts` | 更新类名 | 低 |

---

## 5. 注意事项

1. **向后兼容**: 第一阶段CSS同时保留新旧类名，确保过渡平滑
2. **周视图特殊处理**: 移除 `calendar-week-task-checkbox` 双类名
3. **日视图布局**: 三种模式改用修饰符
4. **测试覆盖**: 每阶段完成后测试所有视图功能
5. **热力图类名**: 使用组合修饰符 `gc-day-cell--heatmap-{color}-{level}`
6. **优先级**: 先重构任务卡片核心，再重构视图容器和工具栏

---

**生成时间**: 2025-12-26
**文档版本**: 1.0
