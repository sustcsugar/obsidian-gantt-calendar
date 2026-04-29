# 甘特图视图交互逻辑分析

> **当前状态 (2026-04-29)**: 本文档中的 `FrappeTask` 类型对应现在的 `GCTask`（`src/gantt/types.ts`）。甘特图渲染器为自研 SVG 实现 `src/gantt/wrappers/svgGanttRenderer.ts`（2000+ 行）。核心交互逻辑（复选框变更、拖动更新）未变。

本文档分析甘特图视图中的两个核心交互功能：
1. 点击复选框修改任务完成状态
2. 拖动甘特条修改任务时间

---

## 一、点击复选框修改任务完成状态

### 1.1 整体流程图

```
用户点击复选框
       │
       ▼
┌─────────────────────────────────────────┐
│ SvgGanttRenderer.createTaskCheckbox()   │
│ - checkbox.addEventListener('change')   │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ 触发 onProgressChange 回调              │
│ (GanttView.handleProgressChange)        │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ TaskUpdateHandler.handleProgressChange()│
│ 1. 验证任务信息                          │
│ 2. 读取文件内容                          │
│ 3. 更新复选框状态                        │
│ 4. 写回文件                              │
│ 5. 更新任务缓存                          │
└──────────────┬──────────────────────────┘
               │
               ▼
        显示通知并刷新视图
```

### 1.2 关键代码文件

| 文件 | 行号 | 作用 |
|------|------|------|
| `svgGanttRenderer.ts` | 667-707 | 创建复选框并绑定change事件 |
| `GanttView.ts` | 312-323 | 处理进度变更事件 |
| `taskUpdateHandler.ts` | 99-142 | 执行文件更新操作 |
| `taskUpdateHandler.ts` | 222-234 | 更新任务行完成状态 |

### 1.3 详细实现

#### 1.3.1 复选框创建 (`svgGanttRenderer.ts:667-707`)

```typescript
private createTaskCheckbox(
    frappeTask: FrappeTask,
    isCompleted: boolean
): HTMLInputElement {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isCompleted;

    // 阻止点击事件冒泡
    checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // 监听复选框变化
    checkbox.addEventListener('change', async (e) => {
        e.stopPropagation();
        const newCompletedState = (e.target as HTMLInputElement).checked;

        // 通过 onProgressChange 回调更新任务
        if (this.onProgressChange) {
            await this.onProgressChange(frappeTask, newCompletedState ? 100 : 0);
        }
    });

    return checkbox;
}
```

#### 1.3.2 进度变更处理 (`GanttView.ts:312-323`)

```typescript
private async handleProgressChange(
    frappeTask: FrappeTask,
    progress: number
): Promise<void> {
    if (!this.updateHandler) return;

    await this.updateHandler.handleProgressChange(
        frappeTask,
        progress,
        this.currentTasks
    );
}
```

#### 1.3.3 任务更新处理 (`taskUpdateHandler.ts:99-142`)

```typescript
async handleProgressChange(
    frappeTask: FrappeTask,
    progress: number,
    _allTasks: GanttTask[]
): Promise<void> {
    try {
        // 1. 验证任务信息
        if (!frappeTask.filePath || frappeTask.lineNumber === undefined) {
            console.error('[TaskUpdateHandler] Missing task information:', frappeTask);
            new Notice('任务信息不完整');
            return;
        }

        // 2. 获取文件对象
        const file = this.app.vault.getAbstractFileByPath(frappeTask.filePath);
        if (!file || !(file instanceof TFile)) {
            new Notice('无法找到文件');
            return;
        }

        // 3. 读取文件内容
        const content = await this.app.vault.read(file);
        const lines = content.split('\n');

        // 4. 更新复选框状态
        const originalLine = lines[frappeTask.lineNumber];
        const updatedLine = this.updateTaskCompletionInLine(originalLine, progress >= 100);

        lines[frappeTask.lineNumber] = updatedLine;

        // 5. 写回文件
        await this.app.vault.modify(file, lines.join('\n'));

        // 6. 通知缓存更新
        await this.plugin.taskCache.updateFileCache(frappeTask.filePath);

        // 7. 显示通知
        new Notice(progress >= 100 ? '任务已标记为完成' : '任务已标记为未完成');

    } catch (error) {
        console.error('[TaskUpdateHandler] Error updating progress:', error);
        new Notice('更新进度失败: ' + (error as Error).message);
    }
}
```

#### 1.3.4 任务行更新逻辑 (`taskUpdateHandler.ts:222-234`)

```typescript
private updateTaskCompletionInLine(line: string, completed: boolean): string {
    // 更新复选框
    const checkboxRegex = /^(\s*[-*+])\s*\[[ x]\]/;
    const match = line.match(checkboxRegex);

    if (match) {
        const prefix = match[1];
        const newCheckbox = completed ? '[x]' : '[ ]';
        return line.replace(checkboxRegex, `${prefix} ${newCheckbox}`);
    }

    return line;
}
```

### 1.4 任务格式支持

更新逻辑支持两种任务格式：

**Tasks 格式（Emoji）**：
```markdown
- [ ] 🎯 Task title 📅 2025-01-15
```

**Dataview 格式（字段）**：
```markdown
- [ ] 🎯 Task title [due:: 2025-01-15]
```

复选框状态更新会将 `[ ]` 改为 `[x]`（完成）或反之（未完成）。

---

## 二、拖动甘特条修改任务时间

### 2.1 整体流程图

```
用户拖动甘特条
       │
       ▼
┌─────────────────────────────────────────┐
│ mousedown 事件触发                       │
│ - 记录初始状态                           │
│ - 设置全局事件监听                       │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ mousemove 事件（实时更新视觉）           │
│ - 计算日期偏移量                         │
│ - 更新甘特条位置/宽度                    │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ mouseup 事件（保存更改）                 │
│ - 计算最终日期                           │
│ - 更新 Markdown 文件                     │
│ - 刷新任务缓存                           │
└──────────────┬──────────────────────────┘
               │
               ▼
        显示通知并刷新视图
```

### 2.2 拖动类型

甘特图支持三种拖动模式：

| 拖动类型 | 触发元素 | 效果 | 光标样式 |
|---------|---------|------|---------|
| **整体移动** | 任务条主体 | 同时修改开始和结束日期 | `grabbing` |
| **左侧拖动** | 左侧手柄 | 只修改开始日期 | `w-resize` |
| **右侧拖动** | 右侧手柄 | 只修改结束日期 | `e-resize` |

### 2.3 关键代码文件

| 文件 | 行号 | 作用 |
|------|------|------|
| `svgGanttRenderer.ts` | 995-1043 | 创建拖动手柄并绑定事件 |
| `svgGanttRenderer.ts` | 1142-1169 | 设置拖动事件处理器 |
| `svgGanttRenderer.ts` | 1223-1269 | 处理拖动移动（实时更新） |
| `svgGanttRenderer.ts` | 1274-1346 | 处理拖动结束（保存更改） |
| `svgGanttRenderer.ts` | 1395-1440 | 单独更新开始/结束日期 |
| `taskUpdateHandler.ts` | 33-90 | 处理日期变更（整体拖动） |

### 2.4 详细实现

#### 2.4.1 拖动手柄创建 (`svgGanttRenderer.ts:995-1043`)

```typescript
// 添加拖动手柄
const HANDLE_HIT_AREA = 12;
const HANDLE_VISUAL_SIZE = 4;

// 左侧手柄 - 修改开始时间
const leftHandle = document.createElementNS(ns, 'rect');
leftHandle.setAttribute('width', String(HANDLE_HIT_AREA));
(leftHandle as any).style.cursor = 'w-resize';

// 右侧手柄 - 修改结束时间
const rightHandle = document.createElementNS(ns, 'rect');
(rightHandle as any).style.cursor = 'e-resize';

// 设置拖动事件
this.setupTaskBarDragging(barGroup, bar, leftHandle, rightHandle, task, minDate);
```

#### 2.4.2 拖动状态管理 (`svgGanttRenderer.ts:1123-1137`)

```typescript
private taskDragState = {
    isDragging: false,
    dragType: 'none' as 'none' | 'move' | 'resize-left' | 'resize-right',
    task: null as FrappeTask | null,
    startX: 0,
    originalStart: null as Date | null,
    originalEnd: null as Date | null,
    taskMinDate: null as Date | null,
    hasMoved: false,
    barElement: null as SVGRectElement | null,
    leftHandleElement: null as SVGRectElement | null,
    rightHandleElement: null as SVGRectElement | null,
};
```

#### 2.4.3 开始拖动 (`svgGanttRenderer.ts:1174-1218`)

```typescript
private startDragging(
    task: FrappeTask,
    dragType: 'move' | 'resize-left' | 'resize-right',
    startX: number,
    minDate: Date,
    bar: SVGRectElement,
    leftHandle: SVGRectElement | null,
    rightHandle: SVGRectElement | null
): void {
    this.taskDragState = {
        isDragging: true,
        dragType,
        task,
        startX,
        originalStart: new Date(task.start),
        originalEnd: new Date(task.end),
        taskMinDate: minDate,
        hasMoved: false,
        barElement: bar,
        leftHandleElement: leftHandle,
        rightHandleElement: rightHandle,
        // ...
    };

    // 设置全局光标
    const cursorMap = {
        'move': 'grabbing',
        'resize-left': 'w-resize',
        'resize-right': 'e-resize',
    };
    document.body.style.cursor = cursorMap[dragType];
    document.body.style.userSelect = 'none';

    // 设置全局事件监听
    document.addEventListener('mousemove', this.handleDragMove);
    document.addEventListener('mouseup', this.handleDragEnd);
}
```

#### 2.4.4 拖动移动（实时更新视觉）(`svgGanttRenderer.ts:1223-1269`)

```typescript
private handleDragMove = (e: MouseEvent): void => {
    if (!this.taskDragState.isDragging) return;

    const deltaX = e.clientX - this.taskDragState.startX;
    const daysDelta = Math.round(deltaX / this.columnWidth);

    if (daysDelta === 0) return;

    this.taskDragState.hasMoved = true;

    const { dragType, originalStart, originalEnd } = this.taskDragState;
    let newStart: Date;
    let newEnd: Date;

    switch (dragType) {
        case 'move':
            // 整体拖动：同时修改开始和结束时间
            newStart = this.addDays(originalStart!, daysDelta);
            newEnd = this.addDays(originalEnd!, daysDelta);
            break;
        case 'resize-left':
            // 左侧拖动：只修改开始时间
            newStart = this.addDays(originalStart!, daysDelta);
            newEnd = originalEnd!;
            if (newStart >= newEnd) {
                newStart = new Date(newEnd);
                newStart.setDate(newStart.getDate() - 1);
            }
            break;
        case 'resize-right':
            // 右侧拖动：只修改结束时间
            newStart = originalStart!;
            newEnd = this.addDays(originalEnd!, daysDelta);
            if (newEnd <= newStart) {
                newEnd = new Date(newStart);
                newEnd.setDate(newEnd.getDate() + 1);
            }
            break;
    }

    // 实时更新任务条视觉
    this.updateTaskBarVisual(newStart, newEnd, taskMinDate!);
}
```

#### 2.4.5 拖动结束（保存更改）(`svgGanttRenderer.ts:1274-1346`)

```typescript
private handleDragEnd = async (e: MouseEvent): Promise<void> => {
    if (!this.taskDragState.isDragging) return;

    const { task, dragType, originalStart, originalEnd, startX, hasMoved } = this.taskDragState;

    // 重置状态
    this.taskDragState.isDragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    // 移除全局事件监听
    document.removeEventListener('mousemove', this.handleDragMove);
    document.removeEventListener('mouseup', this.handleDragEnd);

    if (!hasMoved) {
        // 没有移动，视为点击
        if (task!) this.handleTaskClick(task!);
        return;
    }

    const daysDelta = Math.round((e.clientX - startX) / this.columnWidth);
    if (daysDelta === 0) {
        this.refresh(this.tasks);
        return;
    }

    // 计算新日期
    let newStart: Date;
    let newEnd: Date;

    // ...（根据 dragType 计算 newStart 和 newEnd）

    // 调用相应的更新方法
    try {
        if (dragType === 'move') {
            // 整体拖动：使用现有的 onDateChange 回调
            if (this.onDateChange && task!) {
                await this.onDateChange(task!, newStart, newEnd);
            }
        } else if (dragType === 'resize-left') {
            // 左侧拖动：只更新开始时间
            if (task!) await this.handleStartDateChange(task!, newStart);
        } else if (dragType === 'resize-right') {
            // 右侧拖动：只更新结束时间
            if (task!) await this.handleEndDateChange(task!, newEnd);
        }
    } catch (error) {
        console.error('[SvgGanttRenderer] Error updating task dates:', error);
    }
}
```

#### 2.4.6 单独更新开始/结束日期 (`svgGanttRenderer.ts:1395-1440`)

```typescript
private async handleStartDateChange(task: FrappeTask, newStart: Date): Promise<void> {
    if (!this.plugin || !task.filePath) return;

    const tempTask: any = {
        filePath: task.filePath,
        fileName: task.fileName,
        lineNumber: task.lineNumber,
    };

    const { updateTaskProperties } = require('../../tasks/taskUpdater');
    const updates: Record<string, Date> = {};
    updates[this.startField] = newStart;

    try {
        await updateTaskProperties(this.app, tempTask, updates, this.plugin.settings.enabledTaskFormats);
        await this.plugin.taskCache.updateFileCache(task.filePath);
    } catch (error) {
        console.error('[SvgGanttRenderer] Error updating start date:', error);
    }
}
```

#### 2.4.7 日期变更处理 (`taskUpdateHandler.ts:33-90`)

```typescript
async handleDateChange(
    frappeTask: FrappeTask,
    newStart: Date,
    newEnd: Date,
    startField: DateFieldType,
    endField: DateFieldType,
    _allTasks: GanttTask[]
): Promise<void> {
    try {
        // 1. 验证任务信息
        if (!frappeTask.filePath || frappeTask.lineNumber === undefined) {
            console.error('[TaskUpdateHandler] Missing task information:', frappeTask);
            new Notice('任务信息不完整');
            return;
        }

        // 2. 获取文件对象
        const file = this.app.vault.getAbstractFileByPath(frappeTask.filePath);
        if (!file || !(file instanceof TFile)) {
            new Notice('无法找到文件');
            return;
        }

        // 3. 读取文件内容
        const content = await this.app.vault.read(file);
        const lines = content.split('\n');

        // 4. 更新任务行
        const originalLine = lines[frappeTask.lineNumber];
        const updatedLine = this.updateTaskDatesInLine(
            originalLine,
            newStart,
            newEnd,
            startField,
            endField
        );

        lines[frappeTask.lineNumber] = updatedLine;

        // 5. 写回文件
        await this.app.vault.modify(file, lines.join('\n'));

        // 6. 通知缓存更新
        await this.plugin.taskCache.updateFileCache(frappeTask.filePath);

        // 7. 显示通知
        new Notice(`任务时间已更新: ${formatDate(newStart, 'yyyy-MM-dd')} - ${formatDate(newEnd, 'yyyy-MM-dd')}`);

    } catch (error) {
        console.error('[TaskUpdateHandler] Error updating task:', error);
        new Notice('更新任务失败: ' + (error as Error).message);
    }
}
```

#### 2.4.8 任务行日期更新逻辑 (`taskUpdateHandler.ts:176-213`)

```typescript
private updateTaskDatesInLine(
    line: string,
    newStart: Date,
    newEnd: Date,
    startField: DateFieldType,
    endField: DateFieldType
): string {
    const startEmoji = this.getDateEmoji(startField);
    const endEmoji = this.getDateEmoji(endField);
    const startDateStr = formatDate(newStart, 'yyyy-MM-dd');
    const endDateStr = formatDate(newEnd, 'yyyy-MM-dd');

    let updatedLine = line;

    // 更新开始日期
    if (startEmoji) {
        const startRegex = new RegExp(`${startEmoji}\\s*\\d{4}-\\d{2}-\\d{2}`, 'g');
        if (startRegex.test(updatedLine)) {
            updatedLine = updatedLine.replace(startRegex, `${startEmoji} ${startDateStr}`);
        } else {
            // 如果没有找到，添加到行末
            updatedLine = updatedLine.trimEnd() + ` ${startEmoji} ${startDateStr}`;
        }
    }

    // 更新结束日期
    if (endEmoji) {
        const endRegex = new RegExp(`${endEmoji}\\s*\\d{4}-\\d{2}-\\d{2}`, 'g');
        if (endRegex.test(updatedLine)) {
            updatedLine = updatedLine.replace(endRegex, `${endEmoji} ${endDateStr}`);
        } else {
            // 如果没有找到，添加到行末
            updatedLine = updatedLine.trimEnd() + ` ${endEmoji} ${endDateStr}`;
        }
    }

    return updatedLine;
}
```

### 2.5 日期字段映射

日期字段与对应的 emoji 标记：

| 字段名 | Emoji | 用途 |
|--------|-------|------|
| `createdDate` | `➕` | 创建日期 |
| `startDate` | `🛫` | 开始日期 |
| `scheduledDate` | `⏳` | 计划日期 |
| `dueDate` | `📅` | 截止日期 |
| `completionDate` | `✅` | 完成日期 |
| `cancelledDate` | `❌` | 取消日期 |

---

## 三、数据流图

### 3.1 复选框点击数据流

```
┌─────────────────┐
│  UI 层          │
│  - checkbox     │
└────────┬────────┘
         │ change event
         ▼
┌─────────────────┐
│  视图层          │
│  - GanttView    │
│  handleProgress │
└────────┬────────┘
         │ callback
         ▼
┌─────────────────┐
│  处理层          │
│  TaskUpdate     │
│  Handler        │
└────────┬────────┘
         │ file I/O
         ▼
┌─────────────────┐
│  数据层          │
│  - Markdown     │
│  - File Cache   │
└─────────────────┘
```

### 3.2 甘特条拖动数据流

```
┌─────────────────┐
│  UI 层          │
│  - task bar     │
│  - handles      │
└────────┬────────┘
         │ mouse events
         ▼
┌─────────────────┐
│  渲染层          │
│  - visual update│
│  - drag state   │
└────────┬────────┘
         │ callback
         ▼
┌─────────────────┐
│  视图层          │
│  - GanttView    │
│  handleDateChange│
└────────┬────────┘
         │ callback
         ▼
┌─────────────────┐
│  处理层          │
│  TaskUpdate     │
│  Handler        │
└────────┬────────┘
         │ file I/O
         ▼
┌─────────────────┐
│  数据层          │
│  - Markdown     │
│  - File Cache   │
└─────────────────┘
```

---

## 四、关键设计要点

### 4.1 事件处理

1. **冒泡控制**：复选框点击使用 `e.stopPropagation()` 阻止事件冒泡
2. **全局事件监听**：拖动时在 `document` 上注册 `mousemove` 和 `mouseup`，确保拖动不会中断
3. **状态清理**：拖动结束后移除全局事件监听，避免内存泄漏

### 4.2 视觉反馈

1. **实时更新**：拖动过程中使用 `updateTaskBarVisual()` 实时更新甘特条位置和宽度
2. **光标变化**：根据拖动类型设置不同的光标样式
3. **用户选择禁用**：拖动时禁用文本选择 `userSelect: 'none'`

### 4.3 数据一致性

1. **缓存更新**：文件修改后调用 `taskCache.updateFileCache()` 同步内存缓存
2. **视图刷新**：数据更新后触发视图重新渲染
3. **错误处理**：更新失败时显示通知并恢复原始状态

### 4.4 格式兼容

支持两种任务格式的更新逻辑，通过正则表达式匹配识别：
- **Tasks 格式**：emoji + 日期，如 `📅 2025-01-15`
- **Dataview 格式**：方括号字段，如 `[due:: 2025-01-15]`

---

## 五、相关类型定义

### FrappeTask

```typescript
interface FrappeTask {
    id: string;           // 任务唯一标识
    name: string;         // 任务名称
    start: string | Date; // 开始日期
    end: string | Date;   // 结束日期
    progress: number;     // 进度 (0-100)
    completed: boolean;   // 是否完成
    cancelled: boolean;   // 是否取消
    custom_class?: string; // 自定义CSS类
    filePath: string;     // 文件路径
    fileName: string;     // 文件名
    lineNumber: number;   // 行号
}
```

### DateFieldType

```typescript
type DateFieldType = 'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'completionDate' | 'cancelledDate';
```

---

## 六、文件索引

| 文件路径 | 主要功能 |
|---------|---------|
| `src/views/GanttView.ts` | 甘特图视图主控制器 |
| `src/gantt/wrappers/svgGanttRenderer.ts` | SVG 甘特图渲染器和交互处理 |
| `src/gantt/wrappers/frappeGanttWrapper.ts` | Frappe Gantt 包装类 |
| `src/gantt/handlers/taskUpdateHandler.ts` | 任务更新处理器 |
| `src/tasks/taskUpdater.ts` | 任务属性更新工具函数 |
| `src/views/BaseCalendarRenderer.ts` | 视图基类（复选框创建） |
