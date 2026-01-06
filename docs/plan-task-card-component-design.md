# 任务卡片组件统一设计方案

## 1. 概述

### 1.1 背景

当前项目中，各视图（TaskView、DayView、WeekView、MonthView、GanttView）各自独立实现任务卡片渲染，存在大量重复代码。虽然 `BaseViewRenderer`（原 BaseCalendarRenderer）提供了部分共享方法，但整体上缺乏统一的组件抽象。

### 1.2 目标

- **代码复用**：统一任务卡片渲染逻辑，消除重复代码
- **一致性**：确保所有视图中的任务卡片行为和样式一致
- **可配置性**：通过配置控制显示元素，适应不同视图需求
- **可维护性**：集中管理任务卡片逻辑，便于后续修改和扩展
- **类型安全**：充分利用 TypeScript 类型系统

---

## 2. 当前状态分析

### 2.1 各视图任务卡片元素对比

| 元素 | TaskView | DayView | WeekView | MonthView | GanttView |
|------|----------|---------|----------|-----------|-----------|
| 复选框 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 任务描述 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 标签 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 优先级 | ✓ | ✓ | ✓ | - | ✓ |
| 时间属性 | ✓ | - | - | - | - |
| 文件位置 | ✓ | - | - | - | - |
| 警告图标 | ✓ | ✓ | ✓ | ✓ | - |
| 悬浮提示 | - | - | ✓ | ✓ | - |
| 拖拽功能 | - | - | ✓ | - | - |

### 2.2 问题总结

1. **代码重复**：每个视图都有独立的 `renderXxxTaskItem` 方法
2. **配置分散**：显示逻辑硬编码在各视图方法中
3. **扩展困难**：添加新元素需要修改多个视图
4. **不一致风险**：修改样式时可能遗漏某个视图

---

## 3. 设计方案

### 3.1 组件架构

```
┌─────────────────────────────────────────────────────────────┐
│                     TaskCardComponent                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Config (配置接口)                        │   │
│  │  - showCheckbox: boolean                            │   │
│  │  - showDescription: boolean                         │   │
│  │  - showTags: boolean                                │   │
│  │  - showPriority: boolean                            │   │
│  │  - showTimes: boolean                               │   │
│  │  - showFileLocation: boolean                        │   │
│  │  - showWarning: boolean                             │   │
│  │  - enableTooltip: boolean                           │   │
│  │  - enableDrag: boolean                              │   │
│  │  - viewModifier: ViewModifier                       │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Props (数据接口)                        │   │
│  │  - task: GanttTask                                  │   │
│  │  - onToggleComplete: (task) => void                 │   │
│  │  - onClick: (task) => void                          │   │
│  │  - onDrop?: (task, targetDate) => void              │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 文件结构

```
src/components/
├── TaskCard/
│   ├── TaskCard.ts                 # 主组件
│   ├── TaskCardConfig.ts           # 配置类型定义
│   ├── TaskCardProps.ts            # Props 类型定义
│   ├── TaskCardRenderer.ts         # 渲染器（子元素渲染）
│   ├── presets/
│   │   ├── TaskView.config.ts      # 任务视图预设
│   │   ├── DayView.config.ts       # 日视图预设
│   │   ├── WeekView.config.ts      # 周视图预设（含拖拽）
│   │   ├── MonthView.config.ts     # 月视图预设
│   │   └── GanttView.config.ts     # 甘特图预设
│   └── index.ts                    # 导出
```

---

## 4. 接口定义

### 4.1 配置接口 (TaskCardConfig.ts)

```typescript
/**
 * 视图修饰符类型
 */
export type ViewModifier = 'task' | 'day' | 'week' | 'month' | 'gantt';

/**
 * 时间字段显示配置
 */
export interface TimeFieldConfig {
    showCreated?: boolean;
    showStart?: boolean;
    showScheduled?: boolean;
    showDue?: boolean;
    showCancelled?: boolean;
    showCompletion?: boolean;
    showOverdueIndicator?: boolean;
}

/**
 * 任务卡片组件配置
 */
export interface TaskCardConfig {
    /** 基础配置 */
    viewModifier: ViewModifier;           // 视图类型（用于 CSS 类名）

    /** 元素显示控制 */
    showCheckbox: boolean;                 // 显示复选框
    showDescription: boolean;              // 显示任务描述
    showTags: boolean;                     // 显示标签
    showPriority: boolean;                 // 显示优先级
    showFileLocation: boolean;             // 显示文件位置
    showWarning: boolean;                  // 显示警告图标

    /** 时间属性配置 */
    showTimes: boolean;                    // 是否显示时间区域
    timeFields?: TimeFieldConfig;          // 时间字段详细配置

    /** 交互功能 */
    enableTooltip: boolean;                // 启用悬浮提示
    enableDrag: boolean;                   // 启用拖拽
    clickable: boolean;                    // 整个卡片可点击

    /** 样式配置 */
    compact?: boolean;                     // 紧凑模式（月视图小卡片）
    maxLines?: number;                     // 描述最大行数

    /** 内容过滤 */
    showGlobalFilter?: boolean;            // 显示全局过滤词
}

/**
 * 任务卡片组件 Props
 */
export interface TaskCardProps {
    /** 任务数据 */
    task: GanttTask;

    /** 配置 */
    config: TaskCardConfig;

    /** 容器 */
    container: HTMLElement;

    /** 事件回调 */
    onToggleComplete?: (task: GanttTask, newStatus: boolean) => void;
    onClick?: (task: GanttTask) => void;
    onDrop?: (task: GanttTask, targetDate?: Date) => void;

    /** 上下文 */
    app: App;
    plugin: GanttCalendarPlugin;
}
```

### 4.2 预设配置示例

```typescript
// presets/TaskView.config.ts
export const TaskViewConfig: TaskCardConfig = {
    viewModifier: 'task',
    showCheckbox: true,
    showDescription: true,
    showTags: true,
    showPriority: true,
    showFileLocation: true,
    showWarning: true,
    showTimes: true,
    timeFields: {
        showCreated: true,
        showStart: true,
        showScheduled: true,
        showDue: true,
        showCancelled: true,
        showCompletion: true,
        showOverdueIndicator: true,
    },
    enableTooltip: false,
    enableDrag: false,
    clickable: true,
};

// presets/MonthView.config.ts
export const MonthViewConfig: TaskCardConfig = {
    viewModifier: 'month',
    showCheckbox: true,
    showDescription: true,
    showTags: true,
    showPriority: false,    // 月视图空间有限，不显示优先级
    showFileLocation: false,
    showWarning: false,     // 月视图不显示警告
    showTimes: false,
    enableTooltip: true,
    enableDrag: false,
    clickable: true,
    compact: true,
    maxLines: 1,
};

// presets/WeekView.config.ts
export const WeekViewConfig: TaskCardConfig = {
    viewModifier: 'week',
    showCheckbox: true,
    showDescription: true,
    showTags: true,
    showPriority: true,
    showFileLocation: false,
    showWarning: true,
    showTimes: false,
    enableTooltip: true,
    enableDrag: true,       // 周视图支持拖拽
    clickable: true,
};
```

---

## 5. 组件实现

### 5.1 主组件结构 (TaskCard.ts)

```typescript
/**
 * 任务卡片统一组件
 */
export class TaskCardComponent {
    private config: TaskCardConfig;
    private props: TaskCardProps;
    private renderer: TaskCardRenderer;

    constructor(props: TaskCardProps) {
        this.props = props;
        this.config = props.config;
        this.renderer = new TaskCardRenderer(props.app, props.plugin);
    }

    /**
     * 渲染任务卡片
     */
    render(): HTMLElement {
        const { task, container } = this.props;

        // 创建卡片元素
        const card = this.createCardElement();

        // 应用状态修饰符
        this.applyStateModifiers(card, task);

        // 渲染子元素
        if (this.config.showCheckbox) {
            this.renderer.renderCheckbox(card, task);
        }

        if (this.config.showDescription) {
            this.renderer.renderDescription(card, task);
        }

        if (this.config.showTags) {
            this.renderer.renderTags(card, task);
        }

        if (this.config.showPriority && task.priority) {
            this.renderer.renderPriority(card, task);
        }

        if (this.config.showTimes) {
            this.renderer.renderTimeFields(card, task, this.config.timeFields);
        }

        if (this.config.showFileLocation) {
            this.renderer.renderFileLocation(card, task);
        }

        if (this.config.showWarning && task.warning) {
            this.renderer.renderWarning(card, task);
        }

        // 应用交互
        this.attachInteractions(card, task);

        container.appendChild(card);
        return card;
    }

    private createCardElement(): HTMLElement {
        const { config } = this;
        const card = document.createElement('div');
        card.className = TaskCardClasses.block;
        card.addClass(TaskCardClasses.modifiers[`${config.viewModifier}View`]);

        if (config.compact) {
            card.addClass('gc-task-card--compact');
        }

        return card;
    }

    private applyStateModifiers(card: HTMLElement, task: GanttTask): void {
        const statusClass = task.completed
            ? TaskCardClasses.modifiers.completed
            : TaskCardClasses.modifiers.pending;
        card.addClass(statusClass);

        // 应用自定义状态颜色
        const colors = this.renderer.getStatusColors(task);
        if (colors) {
            card.style.setProperty('--task-bg-color', colors.bg);
            card.style.setProperty('--task-text-color', colors.text);
        }
    }

    private attachInteractions(card: HTMLElement, task: GanttTask): void {
        const { config, props } = this;

        // 点击事件
        if (config.clickable && props.onClick) {
            card.addEventListener('click', () => props.onClick!(task));
        }

        // 拖拽功能
        if (config.enableDrag) {
            this.attachDragBehavior(card, task);
        }

        // 悬浮提示
        if (config.enableTooltip) {
            this.renderer.createTooltip(card, task);
        }

        // 右键菜单
        this.renderer.attachContextMenu(card, task, props.onToggleComplete);
    }

    private attachDragBehavior(card: HTMLElement, task: GanttTask): void {
        card.draggable = true;
        card.setAttribute('data-task-id', `${task.filePath}:${task.lineNumber}`);

        card.addEventListener('dragstart', (e: DragEvent) => {
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('taskId', `${task.filePath}:${task.lineNumber}`);
                card.style.opacity = '0.6';
            }
        });

        card.addEventListener('dragend', () => {
            card.style.opacity = '1';
        });
    }
}
```

### 5.2 渲染器 (TaskCardRenderer.ts)

```typescript
/**
 * 任务卡片渲染器
 * 负责各个子元素的渲染逻辑
 */
export class TaskCardRenderer extends BaseCalendarRenderer {

    /**
     * 渲染复选框
     */
    renderTooltip(card: HTMLElement, task: GanttTask): void {
        // 复用 BaseCalendarRenderer 中的方法
        this.createTaskTooltip(task, card, task.description);
    }

    /**
     * 渲染时间字段
     */
    renderTimeFields(card: HTMLElement, task: GanttTask, config?: TimeFieldConfig): void {
        if (!config) return;

        const container = card.createDiv(TaskCardClasses.elements.times);

        if (config.showCreated && task.createdDate) {
            this.renderTimeBadge(container, '创建', task.createdDate, TimeBadgeClasses.created);
        }
        if (config.showStart && task.startDate) {
            this.renderTimeBadge(container, '开始', task.startDate, TimeBadgeClasses.start);
        }
        if (config.showScheduled && task.scheduledDate) {
            this.renderTimeBadge(container, '计划', task.scheduledDate, TimeBadgeClasses.scheduled);
        }
        if (config.showDue && task.dueDate) {
            this.renderTimeBadge(container, '截止', task.dueDate, TimeBadgeClasses.due,
                               task.dueDate < new Date() && !task.completed);
        }
        if (config.showCancelled && task.cancelledDate) {
            this.renderTimeBadge(container, '取消', task.cancelledDate, TimeBadgeClasses.cancelled);
        }
        if (config.showCompletion && task.completionDate) {
            this.renderTimeBadge(container, '完成', task.completionDate, TimeBadgeClasses.completion);
        }
    }

    private renderTimeBadge(
        container: HTMLElement,
        label: string,
        date: Date,
        className: string,
        isOverdue = false
    ): void {
        const badge = container.createEl('span', {
            text: `${label}:${this.formatDateForDisplay(date)}`,
            cls: `${TaskCardClasses.elements.timeBadge} ${className}`
        });
        if (isOverdue) {
            badge.addClass(TimeBadgeClasses.overdue);
        }
        container.appendChild(badge);
    }

    /**
     * 附加右键菜单
     */
    attachContextMenu(card: HTMLElement, task: GanttTask, onToggleComplete?: Function): void {
        const enabledFormats = this.plugin.settings.enabledTaskFormats || ['tasks'];
        const taskNotePath = this.plugin.settings.taskNotePath || 'Tasks';
        const { registerTaskContextMenu } = require('../contextMenu/contextMenuIndex');

        registerTaskContextMenu(
            card,
            task,
            this.app,
            enabledFormats,
            taskNotePath,
            onToggleComplete || (() => {}),
            this.plugin?.settings?.globalTaskFilter || ''
        );
    }
}
```

---

## 6. 使用示例

### 6.1 在视图中使用

```typescript
// TaskView.ts - 使用完整配置
import { TaskCardComponent } from '../components/TaskCard';
import { TaskViewConfig } from '../components/TaskCard/presets/TaskView.config';

private renderTaskItem(task: GanttTask, listContainer: HTMLElement): void {
    const component = new TaskCardComponent({
        task,
        config: TaskViewConfig,
        container: listContainer,
        app: this.app,
        plugin: this.plugin,
        onClick: (task) => this.openTaskFile(task),
    });
    component.render();
}

// MonthView.ts - 使用简化配置
import { TaskCardComponent } from '../components/TaskCard';
import { MonthViewConfig } from '../components/TaskCard/presets/MonthView.config';

private renderMonthTaskItem(task: GanttTask, container: HTMLElement): void {
    const component = new TaskCardComponent({
        task,
        config: MonthViewConfig,
        container,
        app: this.app,
        plugin: this.plugin,
        onClick: (task) => this.openTaskFile(task),
    });
    component.render();
}

// WeekView.ts - 使用带拖拽的配置
import { TaskCardComponent } from '../components/TaskCard';
import { WeekViewConfig } from '../components/TaskCard/presets/WeekView.config';

private renderWeekTaskItem(task: GanttTask, container: HTMLElement, dayDate?: Date): void {
    const component = new TaskCardComponent({
        task,
        config: WeekViewConfig,
        container,
        app: this.app,
        plugin: this.plugin,
        onClick: (task) => this.openTaskFile(task),
        onDrop: (task, targetDate) => this.handleDrop(task, targetDate),
    });

    // 为拖拽设置目标日期
    if (dayDate) {
        task.targetDate = dayDate;
    }

    component.render();
}
```

### 6.2 自定义配置

```typescript
// 创建自定义配置
const customConfig: TaskCardConfig = {
    ...TaskViewConfig,
    showPriority: false,        // 不显示优先级
    showTimes: false,            // 不显示时间
    compact: true,               // 紧凑模式
};

const component = new TaskCardComponent({
    task,
    config: customConfig,
    container,
    app: this.app,
    plugin: this.plugin,
    onClick: (task) => this.openTaskFile(task),
});
```

---

## 7. CSS 类名规范

### 7.1 现有 BEM 类名（保持不变）

```css
/* Block */
.gc-task-card

/* View Modifiers */
.gc-task-card--task      /* 任务视图 */
.gc-task-card--day       /* 日视图 */
.gc-task-card--week      /* 周视图 */
.gc-task-card--month     /* 月视图 */
.gc-task-card--gantt     /* 甘特图 */

/* State Modifiers */
.gc-task-card--completed
.gc-task-card--pending
.gc-task-card--compact   /* 新增：紧凑模式 */

/* Elements */
.gc-task-card__checkbox
.gc-task-card__text
.gc-task-card__tags
.gc-task-card__priority
.gc-task-card__times
.gc-task-card__time-badge
.gc-task-card__file
.gc-task-card__warning
```

### 7.2 紧凑模式样式

```css
/* 紧凑模式 - 用于月视图等空间有限的场景 */
.gc-task-card--compact {
    padding: 2px 4px;
    font-size: 11px;
    gap: 4px;
}

.gc-task-card--compact .gc-task-card__text {
    max-lines: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.gc-task-card--compact .gc-task-card__tags {
    max-width: 60px;
}

.gc-task-card--compact .gc-tag {
    max-width: 30px;
    overflow: hidden;
    text-overflow: ellipsis;
}
```

---

## 8. 迁移计划

### 8.1 阶段一：基础组件（不影响现有功能）

1. 创建 `src/components/TaskCard/` 目录结构
2. 实现核心组件和渲染器
3. 编写单元测试
4. **不修改现有视图代码**

### 8.2 阶段二：逐步迁移

1. 迁移 **MonthView**（最简单，优先迁移）
2. 迁移 **WeekView**
3. 迁移 **DayView**
4. 迁移 **TaskView**
5. 迁移 **GanttView**

### 8.3 阶段三：清理

1. 删除各视图中的 `renderXxxTaskItem` 方法
2. 清理 `BaseCalendarRenderer` 中已被组件替代的方法
3. 更新文档

---

## 9. 优势与收益

### 9.1 代码复用

- 消除 ~300 行重复代码
- 统一渲染逻辑，修改一处即可影响所有视图

### 9.2 可维护性

- 组件职责清晰，易于理解
- 配置集中管理，修改显示行为无需深入视图代码

### 9.3 可扩展性

- 新增视图类型只需添加预设配置
- 新增显示元素只需扩展组件和配置接口

### 9.4 类型安全

- 完整的 TypeScript 类型定义
- 编译时检查配置有效性

---

## 10. 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 破坏现有功能 | 分阶段迁移，每个阶段独立测试 |
| 性能影响 | 组件设计轻量，避免过度抽象 |
| 配置复杂度 | 提供预设配置，简化常用场景 |
| CSS 样式冲突 | 保持现有 BEM 类名，新增类名使用独特前缀 |

---

## 11. 后续优化

### 11.1 虚拟滚动

#### 11.1.1 问题描述

当任务数量较大（超过500条）时，一次性渲染所有任务卡片会导致：
- **内存占用高**：大量DOM节点占用内存（每个卡片约100-200字节，500条≈50-100KB）
- **初始渲染慢**：创建所有DOM元素需要时间（约100-500ms，取决于任务数量）
- **滚动卡顿**：浏览器需要处理大量重绘和重排
- **交互延迟**：事件监听器数量多，事件委托效率降低

#### 11.1.2 解决方案

采用虚拟滚动技术，只渲染可见区域的任务卡片：

```typescript
/**
 * 虚拟滚动任务列表渲染器
 */
class VirtualScrollRenderer {
    private itemHeight: number = 60;           // 每个任务卡片的高度
    private bufferSize: number = 5;            // 上下缓冲区数量
    private visibleStart: number = 0;          // 可见区域起始索引
    private visibleEnd: number = 0;            // 可见区域结束索引

    /**
     * 计算当前应该渲染的任务范围
     */
    calculateVisibleRange(
        scrollTop: number,
        containerHeight: number,
        totalItems: number
    ): { start: number; end: number } {
        const startIndex = Math.floor(scrollTop / this.itemHeight);
        const endIndex = Math.ceil((scrollTop + containerHeight) / this.itemHeight);

        return {
            start: Math.max(0, startIndex - this.bufferSize),
            end: Math.min(totalItems, endIndex + this.bufferSize)
        };
    }

    /**
     * 创建占位容器（撑开滚动高度）
     */
    createSpacer(totalItems: number): HTMLElement {
        const spacer = document.createElement('div');
        spacer.style.height = `${totalItems * this.itemHeight}px`;
        spacer.className = 'gc-virtual-scroll-spacer';
        return spacer;
    }

    /**
     * 定位任务卡片到正确位置
     */
    positionItem(element: HTMLElement, index: number): void {
        element.style.position = 'absolute';
        element.style.top = `${index * this.itemHeight}px`;
        element.style.width = '100%';
    }
}
```

#### 11.1.3 实现步骤

1. **修改 TaskView.ts 支持虚拟滚动**
```typescript
class TaskViewRenderer extends BaseCalendarRenderer {
    private virtualScroll?: VirtualScrollRenderer;
    private taskContainer?: HTMLElement;
    private spacerElement?: HTMLElement;
    private renderedTasks = new Map<string, TaskCardComponent>();

    render(container: HTMLElement, currentDate: Date): void {
        const taskRoot = container.createDiv(withModifiers(ViewClasses.block, ViewClasses.modifiers.task));

        // 创建虚拟滚动容器
        this.virtualScroll = new VirtualScrollRenderer();
        this.taskContainer = taskRoot.createDiv('gc-task-list-container');
        this.taskContainer.style.position = 'relative';
        this.taskContainer.style.overflow = 'auto';

        // 创建占位元素
        this.spacerElement = this.taskContainer.createDiv('gc-virtual-scroll-spacer');

        // 监听滚动事件
        this.taskContainer.addEventListener('scroll', () => this.onScroll());

        this.loadTaskList(taskRoot);
    }

    private onScroll(): void {
        if (!this.virtualScroll || !this.taskContainer) return;

        const scrollTop = this.taskContainer.scrollTop;
        const containerHeight = this.taskContainer.clientHeight;
        const tasks = this.getCurrentTasks();

        const range = this.virtualScroll.calculateVisibleRange(
            scrollTop,
            containerHeight,
            tasks.length
        );

        this.renderVisibleTasks(range);
    }

    private renderVisibleTasks(range: { start: number; end: number }): void {
        const tasks = this.getCurrentTasks();

        // 更新占位高度
        if (this.spacerElement) {
            this.spacerElement.style.height = `${tasks.length * 60}px`;
        }

        // 渲染可见任务
        for (let i = range.start; i < range.end; i++) {
            const task = tasks[i];
            const key = `${task.filePath}:${task.lineNumber}`;

            if (!this.renderedTasks.has(key)) {
                const component = new TaskCardComponent({
                    task,
                    config: TaskViewConfig,
                    container: this.taskContainer!,
                    app: this.app,
                    plugin: this.plugin,
                });
                component.render();

                this.virtualScroll!.positionItem(component.getElement()!, i);
                this.renderedTasks.set(key, component);
            }
        }

        // 移除不可见的任务（保留缓冲区）
        this.cleanupInvisibleTasks(range);
    }
}
```

2. **添加 CSS 支持**
```css
.gc-task-list-container {
    position: relative;
    overflow: auto;
    max-height: calc(100vh - 200px);
}

.gc-virtual-scroll-spacer {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    pointer-events: none;
}
```

#### 11.1.4 预期效果

| 任务数量 | 优化前渲染时间 | 优化后渲染时间 | 内存占用 |
|---------|--------------|--------------|---------|
| 100条   | ~50ms        | ~50ms        | 相当    |
| 500条   | ~250ms       | ~80ms        | -60%    |
| 1000条  | ~500ms       | ~100ms       | -80%    |
| 5000条  | ~2500ms      | ~150ms       | -95%    |

---

### 11.2 动画过渡

#### 11.2.1 问题描述

当前状态切换（如完成任务、拖拽）是瞬间完成的，缺乏视觉反馈：
- 用户点击复选框，状态立即变化
- 拖拽任务时没有视觉提示
- 悬浮提示突兀出现/消失

#### 11.2.2 解决方案

为状态变化添加 CSS 过渡和动画：

```css
/* ===== 基础过渡效果 ===== */
.gc-task-card {
    transition:
        opacity 0.2s ease,
        transform 0.2s ease,
        background-color 0.2s ease,
        box-shadow 0.2s ease,
        border-color 0.2s ease;
}

/* ===== 悬停效果 ===== */
.gc-task-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* ===== 完成状态动画 ===== */
@keyframes task-complete {
    0% {
        opacity: 1;
        transform: scale(1);
    }
    50% {
        opacity: 0.8;
        transform: scale(0.98);
    }
    100% {
        opacity: 0.6;
        transform: scale(1);
    }
}

.gc-task-card--completed {
    animation: task-complete 0.3s ease-out forwards;
}

/* ===== 取消完成状态动画 ===== */
@keyframes task-uncomplete {
    0% {
        opacity: 0.6;
    }
    100% {
        opacity: 1;
    }
}

.gc-task-card--pending {
    animation: task-uncomplete 0.2s ease-out forwards;
}

/* ===== 拖拽状态 ===== */
.gc-task-card[draggable="true"] {
    cursor: grab;
    transition: transform 0.15s ease, opacity 0.15s ease;
}

.gc-task-card[draggable="true"]:active {
    cursor: grabbing;
}

.gc-task-card.dragging {
    opacity: 0.6;
    transform: scale(0.98) rotate(1deg);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

/* ===== 拖拽放置目标 ===== */
@keyframes pulse-target {
    0%, 100% {
        border-color: var(--interactive-accent);
        background-color: var(--background-modifier-hover);
    }
    50% {
        border-color: var(--interactive-accent-hover);
        background-color: var(--background-modifier-active-hover);
    }
}

.drop-target {
    animation: pulse-target 1s ease-in-out infinite;
    border: 2px dashed var(--interactive-accent);
}

/* ===== 新任务进入动画 ===== */
@keyframes slide-in {
    from {
        opacity: 0;
        transform: translateY(-10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.gc-task-card.task-enter {
    animation: slide-in 0.3s ease-out;
}

/* ===== 任务删除动画 ===== */
@keyframes slide-out {
    from {
        opacity: 1;
        transform: translateX(0);
        max-height: 60px;
        margin-bottom: 8px;
    }
    to {
        opacity: 0;
        transform: translateX(20px);
        max-height: 0;
        margin-bottom: 0;
        padding: 0;
    }
}

.gc-task-card.task-exit {
    animation: slide-out 0.3s ease-in forwards;
    pointer-events: none;
}

/* ===== 悬浮提示过渡 ===== */
.gc-task-tooltip {
    transition:
        opacity 0.2s ease,
        transform 0.2s ease,
        visibility 0.2s ease;
}

.gc-task-tooltip:not(.gc-task-tooltip--visible) {
    opacity: 0;
    transform: translateY(4px);
    visibility: hidden;
}

.gc-task-tooltip--visible {
    opacity: 1;
    transform: translateY(0);
    visibility: visible;
}

/* ===== 优先级徽章脉冲 ===== */
@keyframes priority-pulse {
    0%, 100% {
        transform: scale(1);
    }
    50% {
        transform: scale(1.1);
    }
}

.gc-task-card__priority-badge.priority-high,
.gc-task-card__priority-badge.priority-highest {
    animation: priority-pulse 2s ease-in-out infinite;
}

/* ===== 过期任务闪烁提醒 ===== */
@keyframes overdue-blink {
    0%, 100% {
        background-color: var(--tag-background);
        color: var(--text-on-accent);
    }
    50% {
        background-color: rgba(var(--color-red-rgb), 0.2);
        color: var(--color-red);
    }
}

.gc-time-badge.gc-time-badge--overdue {
    animation: overdue-blink 3s ease-in-out infinite;
}

/* ===== 加载状态 ===== */
@keyframes skeleton-loading {
    0% {
        background-position: -200px 0;
    }
    100% {
        background-position: calc(200px + 100%) 0;
    }
}

.gc-task-card.gc-task-card--loading {
    pointer-events: none;
    background: linear-gradient(
        90deg,
        var(--background-secondary) 0px,
        var(--background-modifier-hover) 100px,
        var(--background-secondary) 200px
    );
    background-size: 200px 100%;
    animation: skeleton-loading 1.5s ease-in-out infinite;
}

/* ===== 减少动画（尊重用户偏好） ===== */
@media (prefers-reduced-motion: reduce) {
    .gc-task-card,
    .gc-task-tooltip,
    .gc-task-card--completed,
    .gc-task-card--pending {
        transition: none;
        animation: none;
    }
}
```

#### 11.2.3 TypeScript 实现

```typescript
/**
 * 动画控制器
 */
class AnimationController {
    private static pendingAnimations = new Set<HTMLElement>();

    /**
     * 添加进入动画
     */
    static enterAnimation(element: HTMLElement): void {
        element.addClass('task-enter');
        element.addEventListener('animationend', () => {
            element.removeClass('task-enter');
        }, { once: true });
    }

    /**
     * 添加退出动画
     */
    static exitAnimation(element: HTMLElement): Promise<void> {
        return new Promise(resolve => {
            element.addClass('task-exit');
            element.addEventListener('animationend', () => {
                element.remove();
                resolve();
            }, { once: true });
        });
    }

    /**
     * 添加拖拽样式
     */
    static setDraggingState(element: HTMLElement, isDragging: boolean): void {
        element.toggleClass('dragging', isDragging);
    }
}
```

---

### 11.3 可访问性

#### 11.3.1 问题描述

当前任务卡片缺乏可访问性支持，导致：
- 屏幕阅读器无法正确读取任务状态
- 键盘用户无法便捷操作
- 色盲用户难以区分任务状态

#### 11.3.2 解决方案

添加完整的 ARIA 属性和键盘导航支持：

```typescript
/**
 * 可访问性增强的任务卡片渲染
 */
class AccessibleTaskCardRenderer extends TaskCardRenderer {

    /**
     * 创建带可访问性属性的复选框
     */
    createAccessibleCheckbox(task: GanttTask, taskItem: HTMLElement): HTMLInputElement {
        const checkbox = taskItem.createEl('input', {
            type: 'checkbox',
            cls: 'gc-task-card__checkbox',
        }) as HTMLInputElement;

        checkbox.checked = task.completed;

        // ARIA 属性
        checkbox.setAttribute('aria-checked', String(task.completed));
        checkbox.setAttribute('aria-label', `标记任务"${this.getAccessibleLabel(task)}"为${task.completed ? '未完成' : '完成'}`);

        // 键盘导航
        checkbox.setAttribute('tabindex', '0');

        return checkbox;
    }

    /**
     * 设置卡片的可访问性属性
     */
    setupCardAccessibility(card: HTMLElement, task: GanttTask): void {
        // 设置角色
        card.setAttribute('role', 'article');
        card.setAttribute('aria-label', this.getAccessibleLabel(task));

        // 设置状态
        card.setAttribute('aria-live', 'polite');

        // 如果可点击，添加键盘提示
        if (card.hasClass('clickable')) {
            card.setAttribute('tabindex', '0');
            card.setAttribute('aria-description', '按 Enter 键打开任务文件');
        }

        // 拖拽相关
        if (card.getAttribute('draggable') === 'true') {
            card.setAttribute('aria-grabbed', 'false');
        }
    }

    /**
     * 获取可访问的任务标签
     */
    private getAccessibleLabel(task: GanttTask): string {
        const parts: string[] = [];

        parts.push(task.completed ? '已完成' : '未完成');

        if (task.priority) {
            const priorityLabels: Record<string, string> = {
                highest: '最高优先级',
                high: '高优先级',
                medium: '中优先级',
                low: '低优先级',
                lowest: '最低优先级',
            };
            parts.push(priorityLabels[task.priority] || task.priority);
        }

        parts.push(task.description);

        if (task.dueDate && !task.completed) {
            const today = new Date();
            const isOverdue = task.dueDate < today;
            parts.push(isOverdue ? '已逾期' : `截止日期${this.formatDateForDisplay(task.dueDate)}`);
        }

        return parts.join('，');
    }

    /**
     * 添加键盘快捷键支持
     */
    attachKeyboardNavigation(card: HTMLElement, task: GanttTask): void {
        card.addEventListener('keydown', (e: KeyboardEvent) => {
            switch (e.key) {
                case 'Enter':
                case ' ':
                    // 切换完成状态
                    e.preventDefault();
                    this.toggleTaskCompletion(task);
                    break;

                case 'o':
                case 'e':
                    // 打开任务文件
                    e.preventDefault();
                    this.openTaskFile(task);
                    break;

                case 'ArrowUp':
                    // 导航到上一个任务
                    e.preventDefault();
                    this.navigateToPrevious(card);
                    break;

                case 'ArrowDown':
                    // 导航到下一个任务
                    e.preventDefault();
                    this.navigateToNext(card);
                    break;

                case 'Home':
                    // 导航到第一个任务
                    e.preventDefault();
                    this.navigateToFirst(card);
                    break;

                case 'End':
                    // 导航到最后一个任务
                    e.preventDefault();
                    this.navigateToLast(card);
                    break;
            }
        });
    }

    /**
     * 为色盲用户添加状态指示
     */
    addColorBlindSupport(card: HTMLElement, task: GanttTask): void {
        // 使用图标 + 颜色，而不仅仅依赖颜色
        if (task.completed) {
            const checkIcon = card.createDiv('gc-task-card__status-icon');
            checkIcon.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
        }

        // 优先级使用不同形状的图标
        const priorityShapes: Record<string, string> = {
            highest: '▲▲',
            high: '▲',
            medium: '▶',
            low: '▽',
            lowest: '▽▽',
        };

        if (task.priority) {
            const priorityEl = card.querySelector('.gc-task-card__priority');
            if (priorityEl) {
                priorityEl.setAttribute('aria-label', priorityEl.textContent || '');
                // 添加形状作为辅助标识
                priorityEl.setAttribute('data-shape', priorityShapes[task.priority] || '');
            }
        }
    }

    /**
     * 添加高对比度模式支持
     */
    addHighContrastSupport(card: HTMLElement): void {
        // 检测系统高对比度设置
        if (window.matchMedia('(prefers-contrast: high)').matches) {
            card.addClass('high-contrast');
        }

        // 检测强制颜色模式
        if (window.matchMedia('(forced-colors: active)').matches) {
            card.addClass('forced-colors');
        }
    }
}
```

#### 11.3.3 CSS 可访问性增强

```css
/* ===== 高对比度模式支持 ===== */
@media (prefers-contrast: high) {
    .gc-task-card {
        border: 2px solid currentColor;
    }

    .gc-task-card--completed {
        border-left-width: 4px;
    }
}

@media (forced-colors: active) {
    .gc-task-card {
        border: 2px solid CanvasText;
        background-color: Canvas;
    }

    .gc-task-card:hover,
    .gc-task-card:focus {
        border-color: Highlight;
        outline: 2px solid Highlight;
    }
}

/* ===== 键盘焦点样式 ===== */
.gc-task-card:focus,
.gc-task-card__checkbox:focus {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
}

.gc-task-card:focus:not(:focus-visible) {
    outline: none;
}

/* ===== 屏幕阅读器专用内容 ===== */
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}

/* ===== 状态图标（色盲友好） ===== */
.gc-task-card__status-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    margin-right: 4px;
}

.gc-task-card__status-icon svg {
    width: 100%;
    height: 100%;
    fill: currentColor;
}

/* ===== 优先级形状标识 ===== */
.gc-task-card__priority-badge::before {
    content: attr(data-shape);
    margin-right: 4px;
    font-size: 0.9em;
}
```

---

### 11.4 主题适配

#### 11.4.1 问题描述

Obsidian 有丰富的主题生态，不同主题有不同的：
- 配色方案（深色/浅色）
- 字体大小和行高
- 圆角和阴影风格
- 间距规范

当前任务卡片使用固定的颜色值，无法自适应主题。

#### 11.4.2 解决方案

使用 Obsidian CSS 变量实现主题自适应：

```css
/* ===== 主题适配的任务卡片样式 ===== */
.gc-task-card {
    /* 基础颜色使用 Obsidian 变量 */
    background-color: var(--background-secondary);
    color: var(--text-normal);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s, 4px);

    /* 字体 */
    font-family: var(--font-interface);
    font-size: var(--font-ui-smaller);

    /* 阴影 */
    box-shadow: var(--shadow-s, 0 1px 2px rgba(0, 0, 0, 0.05));
}

/* ===== 悬停状态 ===== */
.gc-task-card:hover {
    background-color: var(--background-modifier-hover);
    border-color: var(--background-modifier-border-hover);
}

/* ===== 激活状态 ===== */
.gc-task-card:active {
    background-color: var(--background-modifier-active-hover);
}

/* ===== 焦点状态 ===== */
.gc-task-card:focus-visible {
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px var(--background-modifier-border),
                0 0 0 4px var(--interactive-accent);
}

/* ===== 完成状态 ===== */
.gc-task-card--completed {
    opacity: var(--inactive-opacity, 0.6);
    background-color: var(--background-primary);
}

.gc-task-card--completed .gc-task-card__text {
    color: var(--text-faint);
    text-decoration: var(--text-decoration-strikethrough, line-through);
}

/* ===== 优先级颜色（使用 HSL 以便主题调整）===== */
.gc-task-card__priority-badge.priority-highest {
    background-color: hsl(var(--color-red-hue, 0), 70%, 45%);
    color: hsl(var(--color-red-hue, 0), 70%, 98%);
}

.gc-task-card__priority-badge.priority-high {
    background-color: hsl(var(--color-orange-hue, 30), 80%, 50%);
    color: hsl(var(--color-orange-hue, 30), 80%, 98%);
}

.gc-task-card__priority-badge.priority-medium {
    background-color: hsl(var(--color-yellow-hue, 45), 80%, 55%);
    color: hsl(var(--color-yellow-hue, 45), 80%, 10%);
}

.gc-task-card__priority-badge.priority-low {
    background-color: hsl(var(--color-blue-hue, 210), 60%, 55%);
    color: hsl(var(--color-blue-hue, 210), 60%, 98%);
}

.gc-task-card__priority-badge.priority-lowest {
    background-color: hsl(var(--color-cyan-hue, 180), 60%, 55%);
    color: hsl(var(--color-cyan-hue, 180), 60%, 98%);
}

/* ===== 标签颜色（适配主题）===== */
.gc-tag {
    background-color: var(--tag-background);
    color: var(--tag-color);
    border-radius: var(--radius-s, 4px);
    padding: var(--size-2-1, 2px) var(--size-2-2, 6px);
}

.gc-tag:hover {
    background-color: var(--tag-background-hover);
    color: var(--tag-color-hover);
}

/* ===== 时间标签 ===== */
.gc-task-card__time-badge {
    background-color: var(--background-modifier-border);
    color: var(--text-muted);
    border-radius: var(--radius-s, 4px);
}

.gc-task-card__time-badge.gc-time-badge--overdue {
    background-color: hsl(var(--color-red-hue, 0), 60%, 45%);
    color: white;
}

/* ===== 链接样式 ===== */
.gc-link {
    color: var(--text-accent);
    text-decoration: var(--link-decoration, none);
}

.gc-link:hover {
    color: var(--text-accent-hover);
    text-decoration: var(--link-decoration-hover, underline);
}

/* ===== 复选框适配 ===== */
.gc-task-card__checkbox {
    appearance: none;
    width: var(--checkbox-size, 16px);
    height: var(--checkbox-size, 16px);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s, 3px);
    background-color: var(--background-primary);
    cursor: pointer;
}

.gc-task-card__checkbox:checked {
    background-color: var(--interactive-accent);
    border-color: var(--interactive-accent);
}

.gc-task-card__checkbox:checked::after {
    content: '';
    position: absolute;
    left: 4px;
    top: 1px;
    width: 4px;
    height: 9px;
    border: solid white;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
}

/* ===== Minimal Theme 特殊适配 ===== */
.theme-dark.minimal-theme .gc-task-card {
    border: 1px solid var(--background-modifier-border);
}

.theme-light.minimal-theme .gc-task-card {
    background-color: var(--background-secondary-alt);
}

/* ===== AnuPpuccin 主题适配 ===== */
body.anuppuccin .gc-task-card {
    border-radius: var(--radius-m, 8px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* ===== Things 主题适配 ===== */
body.things-theme .gc-task-card {
    background-color: var(--card-bg);
    border: none;
    border-radius: var(--card-radius, 12px);
}

/* ===== 适配深色/浅色模式 ===== */
@media (prefers-color-scheme: dark) {
    .gc-task-card {
        background-color: var(--background-secondary);
        border-color: rgba(255, 255, 255, 0.1);
    }
}

@media (prefers-color-scheme: light) {
    .gc-task-card {
        background-color: var(--background-secondary);
        border-color: rgba(0, 0, 0, 0.1);
    }
}

/* ===== 自定义 CSS 变量覆盖 ===== */
.gc-task-card {
    /* 用户可以通过设置覆盖这些变量 */
    --task-card-bg: var(--background-secondary);
    --task-card-border: var(--background-modifier-border);
    --task-card-radius: var(--radius-s, 4px);
    --task-card-padding: var(--size-4-2, 8px);
    --task-card-gap: var(--size-4-1, 4px);
}
```

#### 11.4.2 TypeScript 主题检测

```typescript
/**
 * 主题适配管理器
 */
class ThemeAdapterManager {
    private currentTheme: string = '';
    private isDark: boolean = false;

    constructor(private plugin: GanttCalendarPlugin) {
        this.detectTheme();
        this.observeThemeChanges();
    }

    /**
     * 检测当前主题
     */
    private detectTheme(): void {
        const body = document.body;

        // 检测主题名称
        this.currentTheme = Array.from(body.classList)
            .find(cls => cls.endsWith('-theme')) || '';

        // 检测深色/浅色模式
        this.isDark = body.hasClass('theme-dark');
    }

    /**
     * 监听主题变化
     */
    private observeThemeChanges(): void {
        const observer = new MutationObserver(() => {
            const oldTheme = this.currentTheme;
            this.detectTheme();

            if (oldTheme !== this.currentTheme) {
                this.onThemeChange();
            }
        });

        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['class']
        });
    }

    /**
     * 主题变化回调
     */
    private onThemeChange(): void {
        // 通知视图重新渲染以应用新样式
        this.plugin.emit('theme-changed', {
            theme: this.currentTheme,
            isDark: this.isDark
        });
    }

    /**
     * 获取主题特定的配置
     */
    getThemeConfig(): {
        compact: boolean;
        showBorders: boolean;
        roundedCorners: boolean;
    } {
        return {
            compact: this.currentTheme.includes('minimal'),
            showBorders: !this.currentTheme.includes('things'),
            roundedCorners: this.currentTheme.includes('anuppuccin') ||
                          this.currentTheme.includes('things')
        };
    }
}
```

---

### 11.5 单元测试

#### 11.5.1 测试框架选择

推荐使用 Vitest + Testing Library：
- **Vitest**：快速、与 Vite 集成良好
- **Testing Library**：专注于用户行为测试，而非实现细节

#### 11.5.2 测试用例设计

```typescript
/**
 * TaskCard 组件单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/dom';
import { TaskCardComponent } from '../src/components/TaskCard';
import type { GanttTask } from '../src/types';

describe('TaskCardComponent', () => {
    let mockTask: GanttTask;
    let mockApp: any;
    let mockPlugin: any;
    let container: HTMLElement;

    beforeEach(() => {
        // 准备测试数据
        mockTask = {
            description: '测试任务',
            completed: false,
            priority: 'high',
            tags: ['work', 'urgent'],
            dueDate: new Date('2025-01-15'),
            filePath: '/test/task.md',
            lineNumber: 10,
            fileName: 'task.md'
        };

        mockApp = {
            metadataCache: {
                getFirstLinkpathDest: vi.fn()
            },
            workspace: {
                openLinkText: vi.fn()
            }
        };

        mockPlugin = {
            settings: {
                enabledTaskFormats: ['tasks'],
                taskNotePath: 'Tasks'
            }
        };

        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        container.remove();
    });

    describe('基础渲染', () => {
        it('应该渲染任务描述', () => {
            new TaskCardComponent({
                task: mockTask,
                config: TaskViewConfig,
                container,
                app: mockApp,
                plugin: mockPlugin
            }).render();

            const textEl = container.querySelector('.gc-task-card__text');
            expect(textEl?.textContent).toContain('测试任务');
        });

        it('应该渲染优先级', () => {
            new TaskCardComponent({
                task: mockTask,
                config: TaskViewConfig,
                container,
                app: mockApp,
                plugin: mockPlugin
            }).render();

            const priorityEl = container.querySelector('.gc-task-card__priority');
            expect(priorityEl).toBeTruthy();
            expect(priorityEl?.textContent).toContain('⏫');
        });

        it('应该渲染标签', () => {
            new TaskCardComponent({
                task: mockTask,
                config: TaskViewConfig,
                container,
                app: mockApp,
                plugin: mockPlugin
            }).render();

            const tagsEl = container.querySelectorAll('.gc-tag');
            expect(tagsEl.length).toBe(2);
            expect(tagsEl[0].textContent).toBe('#work');
            expect(tagsEl[1].textContent).toBe('#urgent');
        });

        it('未完成的任务应该有 pending 类名', () => {
            new TaskCardComponent({
                task: mockTask,
                config: TaskViewConfig,
                container,
                app: mockApp,
                plugin: mockPlugin
            }).render();

            const card = container.querySelector('.gc-task-card');
            expect(card?.classList.contains('gc-task-card--pending')).toBe(true);
            expect(card?.classList.contains('gc-task-card--completed')).toBe(false);
        });

        it('已完成的任务应该有 completed 类名', () => {
            const completedTask = { ...mockTask, completed: true };
            new TaskCardComponent({
                task: completedTask,
                config: TaskViewConfig,
                container,
                app: mockApp,
                plugin: mockPlugin
            }).render();

            const card = container.querySelector('.gc-task-card');
            expect(card?.classList.contains('gc-task-card--completed')).toBe(true);
            expect(card?.classList.contains('gc-task-card--pending')).toBe(false);
        });
    });

    describe('配置驱动', () => {
        it('showCheckbox=false 时不应渲染复选框', () => {
            const config = { ...TaskViewConfig, showCheckbox: false };
            new TaskCardComponent({
                task: mockTask,
                config,
                container,
                app: mockApp,
                plugin: mockPlugin
            }).render();

            const checkbox = container.querySelector('.gc-task-card__checkbox');
            expect(checkbox).toBeFalsy();
        });

        it('showPriority=false 时不应渲染优先级', () => {
            const config = { ...TaskViewConfig, showPriority: false };
            new TaskCardComponent({
                task: mockTask,
                config,
                container,
                app: mockApp,
                plugin: mockPlugin
            }).render();

            const priority = container.querySelector('.gc-task-card__priority');
            expect(priority).toBeFalsy();
        });

        it('compact=true 应该添加紧凑模式类名', () => {
            const config = { ...TaskViewConfig, compact: true };
            new TaskCardComponent({
                task: mockTask,
                config,
                container,
                app: mockApp,
                plugin: mockPlugin
            }).render();

            const card = container.querySelector('.gc-task-card');
            expect(card?.classList.contains('gc-task-card--compact')).toBe(true);
        });
    });

    describe('交互行为', () => {
        it('点击复选框应该触发完成状态切换', async () => {
            const mockUpdate = vi.fn().mockResolvedValue(undefined);
            vi.mock('../src/tasks/taskUpdater', () => ({
                updateTaskCompletion: mockUpdate
            }));

            new TaskCardComponent({
                task: mockTask,
                config: TaskViewConfig,
                container,
                app: mockApp,
                plugin: mockPlugin
            }).render();

            const checkbox = container.querySelector('.gc-task-card__checkbox') as HTMLInputElement;
            fireEvent.click(checkbox);

            expect(mockUpdate).toHaveBeenCalledWith(
                mockApp,
                mockTask,
                true,
                ['tasks']
            );
        });

        it('点击卡片应该触发 onClick 回调', () => {
            const onClick = vi.fn();
            new TaskCardComponent({
                task: mockTask,
                config: TaskViewConfig,
                container,
                app: mockApp,
                plugin: mockPlugin,
                onClick
            }).render();

            const card = container.querySelector('.gc-task-card') as HTMLElement;
            fireEvent.click(card);

            expect(onClick).toHaveBeenCalledWith(mockTask);
        });

        it('enableDrag=true 应该设置 draggable 属性', () => {
            const config = { ...TaskViewConfig, enableDrag: true };
            new TaskCardComponent({
                task: mockTask,
                config,
                container,
                app: mockApp,
                plugin: mockPlugin
            }).render();

            const card = container.querySelector('.gc-task-card') as HTMLElement;
            expect(card?.draggable).toBe(true);
            expect(card?.getAttribute('data-task-id')).toBe('/test/task.md:10');
        });
    });

    describe('可访问性', () => {
        it('复选框应该有正确的 ARIA 属性', () => {
            new TaskCardComponent({
                task: mockTask,
                config: TaskViewConfig,
                container,
                app: mockApp,
                plugin: mockPlugin
            }).render();

            const checkbox = container.querySelector('.gc-task-card__checkbox') as HTMLInputElement;
            expect(checkbox?.getAttribute('aria-checked')).toBe('false');
            expect(checkbox?.getAttribute('aria-label')).toContain('标记任务');
        });

        it('已完成任务的复选框应该反映正确状态', () => {
            const completedTask = { ...mockTask, completed: true };
            new TaskCardComponent({
                task: completedTask,
                config: TaskViewConfig,
                container,
                app: mockApp,
                plugin: mockPlugin
            }).render();

            const checkbox = container.querySelector('.gc-task-card__checkbox') as HTMLInputElement;
            expect(checkbox?.getAttribute('aria-checked')).toBe('true');
        });

        it('卡片应该有正确的 role 属性', () => {
            new TaskCardComponent({
                task: mockTask,
                config: TaskViewConfig,
                container,
                app: mockApp,
                plugin: mockPlugin
            }).render();

            const card = container.querySelector('.gc-task-card');
            expect(card?.getAttribute('role')).toBe('article');
        });
    });

    describe('状态颜色', () => {
        it('应该应用自定义状态颜色', () => {
            mockPlugin.settings.taskStatuses = [
                { name: '进行中', color: '#3eb448' }
            ];
            const taskWithStatus = { ...mockTask, status: '进行中' };

            new TaskCardComponent({
                task: taskWithStatus,
                config: TaskViewConfig,
                container,
                app: mockApp,
                plugin: mockPlugin
            }).render();

            const card = container.querySelector('.gc-task-card') as HTMLElement;
            expect(card?.style.getPropertyValue('--task-bg-color')).toBe('#3eb448');
        });
    });

    describe('链接渲染', () => {
        it('应该正确渲染 Obsidian 链接', () => {
            const taskWithLink = {
                ...mockTask,
                description: '查看 [[其他笔记]]'
            };

            new TaskCardComponent({
                task: taskWithLink,
                config: TaskViewConfig,
                container,
                app: mockApp,
                plugin: mockPlugin
            }).render();

            const link = container.querySelector('.gc-link--obsidian');
            expect(link?.textContent).toBe('其他笔记');
            expect(link?.getAttribute('data-href')).toBe('其他笔记');
        });

        it('应该正确渲染 Markdown 链接', () => {
            const taskWithMdLink = {
                ...mockTask,
                description: '访问 [Obsidian](https://obsidian.md)'
            };

            new TaskCardComponent({
                task: taskWithMdLink,
                config: TaskViewConfig,
                container,
                app: mockApp,
                plugin: mockPlugin
            }).render();

            const link = container.querySelector('.gc-link--markdown');
            expect(link?.textContent).toBe('Obsidian');
            expect(link?.getAttribute('href')).toBe('https://obsidian.md');
        });
    });

    describe('销毁', () => {
        it('destroy 方法应该移除元素', () => {
            const component = new TaskCardComponent({
                task: mockTask,
                config: TaskViewConfig,
                container,
                app: mockApp,
                plugin: mockPlugin
            });
            const result = component.render();

            expect(container.querySelector('.gc-task-card')).toBeTruthy();

            result.destroy();

            expect(container.querySelector('.gc-task-card')).toBeFalsy();
        });
    });
});
```

#### 11.5.3 集成测试

```typescript
/**
 * 任务视图集成测试
 */
describe('TaskView Integration', () => {
    it('应该渲染多个任务卡片', () => {
        const tasks = [
            createMockTask('任务1'),
            createMockTask('任务2'),
            createMockTask('任务3')
        ];

        const view = new TaskViewRenderer(mockApp, mockPlugin);
        view.renderTasks(container, tasks);

        expect(container.querySelectorAll('.gc-task-card').length).toBe(3);
    });

    it('应该按排序状态正确排序任务', () => {
        const tasks = [
            createMockTask('低优先级', 'low'),
            createMockTask('高优先级', 'high'),
            createMockTask('中优先级', 'medium')
        ];

        const view = new TaskViewRenderer(mockApp, mockPlugin);
        view.setSortState({ field: 'priority', order: 'desc' });
        view.renderTasks(container, tasks);

        const cards = container.querySelectorAll('.gc-task-card__text');
        expect(cards[0].textContent).toContain('高优先级');
        expect(cards[2].textContent).toContain('低优先级');
    });
});
```

#### 11.5.4 测试配置

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./test/setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: ['node_modules/', 'test/']
        }
    }
});
```

---

### 11.6 优化优先级建议

| 优化项 | 优先级 | 预计工作量 | 收益 |
|-------|-------|-----------|-----|
| 主题适配 | 🔴 高 | 2-3天 | 立即改善用户体验 |
| 可访问性 | 🟡 中 | 3-5天 | 扩大用户群体 |
| 动画过渡 | 🟡 中 | 2-3天 | 提升交互体验 |
| 虚拟滚动 | 🟢 低 | 5-7天 | 仅大数据量场景 |
| 单元测试 | 🟢 低 | 持续进行 | 长期稳定性保障 |

建议按优先级依次实现，先完成主题适配和可访问性改进。
