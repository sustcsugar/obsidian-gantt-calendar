# Frappe Gantt 集成设计方案

> 创建日期: 2025-12-29
> 作者: Claude Code
> 状态: 设计阶段

---

## 1. 项目概述

### 1.1 目标

将现有的自研 DOM 甘特图实现替换为 **Frappe Gantt** 库，以获得：
- 更专业的甘特图渲染效果
- 内置的拖拽交互功能
- 更好的可维护性
- 减少自研代码的维护成本

### 1.2 Frappe Gantt 特性

- **MIT 许可证** - 商业友好
- **SVG 渲染** - 清晰的矢量图形
- **轻量级** - 核心代码简洁
- **可配置** - 40+ 配置选项
- **响应式** - 自适应容器大小

---

## 2. 当前代码分析

### 2.1 文件结构

```
src/
├── views/
│   ├── BaseCalendarRenderer.ts    # 基类
│   └── GanttView.ts               # 甘特图渲染器 (418行)
├── toolbar/
│   └── toolbar-right-gantt.ts     # 甘特图工具栏
├── components/
│   └── TaskCard/
│       └── presets/
│           └── GanttView.config.ts  # 任务卡片配置
└── types.ts                       # 类型定义

styles.css                         # 甘特图样式 (~400行)
```

### 2.2 当前实现的关键组件

| 组件 | 文件 | 行数 | 说明 |
|-----|-----|-----|-----|
| GanttViewRenderer | `views/GanttView.ts` | 418 | 核心渲染器 |
| BaseCalendarRenderer | `views/BaseCalendarRenderer.ts` | 527 | 基类 |
| 工具栏控制器 | `toolbar/toolbar-right-gantt.ts` | 102 | 右侧按钮区 |
| 样式 | `styles.css` | ~400 | BEM命名规范 |

### 2.3 依赖关系

```
CalendarView (main)
    ├── Toolbar
    │   └── ToolbarRightGantt
    │       ├── GanttViewRenderer
    │       └── 组件 (status-filter, time-granularity, etc.)
    └── GanttViewRenderer
        └── BaseCalendarRenderer
            └── TaskCardComponent
```

---

## 3. Frappe Gantt 数据格式

### 3.1 Frappe Gantt 任务格式

```typescript
interface FrappeTask {
  id: string;           // 唯一标识符
  name: string;         // 任务名称
  start: string;        // 开始日期 (YYYY-MM-DD)
  end: string;          // 结束日期 (YYYY-MM-DD)
  progress: number;     // 进度百分比 (0-100)
  dependencies?: string[];  // 依赖任务ID列表
  custom_class?: string;    // 自定义CSS类
}
```

### 3.2 Frappe Gantt 配置选项

```typescript
interface FrappeGanttConfig {
  view_mode: 'day' | 'week' | 'month';  // 视图模式
  language: string;                     // 语言
  header_height: number;                // 头部高度
  column_width: number;                 // 列宽
  step: number;                         // 步长
  bar_height: number;                   // 任务条高度
  bar_corner_radius: number;            // 圆角半径
  arrow_curve: number;                  // 箭头曲率
  padding: number;                      // 内边距
  date_format: string;                  // 日期格式
  custom_popup_html?: (task: FrappeTask) => string;  // 弹窗HTML
  on_click?: (task: FrappeTask) => void;  // 点击事件
  on_date_change?: (task: FrappeTask, start: Date, end: Date) => void;  // 日期变更
  on_progress_change?: (task: FrappeTask, progress: number) => void;  // 进度变更
}
```

---

## 4. 集成架构设计

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        CalendarView                              │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                      Toolbar                                │  │
│  │  ┌──────────────────┐  ┌──────────────────┐                │  │
│  │  │ ToolbarRightGantt│  │  共有组件        │                │  │
│  │  └──────────────────┘  └──────────────────┘                │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                   GanttViewRenderer                        │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │           TaskDataAdapter                             │  │  │
│  │  │  GanttTask[] → FrappeTask[]                           │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │           FrappeGanttWrapper                          │  │  │
│  │  │  - 初始化 Frappe Gantt                                │  │  │
│  │  │  - 处理事件回调                                       │  │  │
│  │  │  - 同步状态变化                                       │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │           TaskUpdateHandler                           │  │  │
│  │  │  - 拖拽后更新任务                                     │  │  │
│  │  │  - 写回 Markdown 文件                                 │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 新增文件结构

```
src/
├── gantt/
│   ├── adapters/
│   │   └── taskDataAdapter.ts      # 数据格式转换
│   ├── wrappers/
│   │   └── frappeGanttWrapper.ts   # Frappe Gantt 封装
│   ├── handlers/
│   │   └── taskUpdateHandler.ts     # 任务更新处理
│   └── types.ts                     # 甘特图专用类型
├── views/
│   └── GanttView.ts                 # 重写的甘特图视图
└── styles/
    └── frappe-gantt.scss            # Frappe Gantt 样式覆盖
```

---

## 5. 数据适配层设计

### 5.1 TaskDataAdapter

```typescript
/**
 * 将插件的任务格式转换为 Frappe Gantt 格式
 */
export class TaskDataAdapter {
  /**
   * 转换单个任务
   */
  static toFrappeTask(
    task: GanttTask,
    startField: DateFieldType,
    endField: DateFieldType,
    index: number
  ): FrappeTask | null {
    const startDate = task[startField];
    const endDate = task[endField];

    if (!startDate || !endDate) return null;

    return {
      id: this.generateTaskId(task, index),
      name: task.description,
      start: this.formatDate(startDate),
      end: this.formatDate(endDate),
      progress: task.completed ? 100 : 0,
      custom_class: this.getCustomClass(task)
    };
  }

  /**
   * 批量转换任务
   */
  static toFrappeTasks(
    tasks: GanttTask[],
    startField: DateFieldType,
    endField: DateFieldType
  ): FrappeTask[] {
    return tasks
      .map((task, index) => this.toFrappeTask(task, startField, endField, index))
      .filter((t): t is FrappeTask => t !== null);
  }

  /**
   * 生成唯一任务ID
   */
  private static generateTaskId(task: GanttTask, index: number): string {
    return `${task.fileName}-${task.lineNumber}-${index}`;
  }

  /**
   * 格式化日期为 YYYY-MM-DD
   */
  private static formatDate(date: Date): string {
    // 实现日期格式化
  }

  /**
   * 根据任务状态生成自定义类名
   */
  private static getCustomClass(task: GanttTask): string {
    if (task.completed) return 'task-completed';
    if (task.priority === 'highest') return 'task-highest';
    // ...更多状态
    return '';
  }
}
```

---

## 6. Frappe Gantt 封装设计

### 6.1 FrappeGanttWrapper

```typescript
/**
 * Frappe Gantt 封装类
 * 管理 Frappe Gantt 实例的生命周期和事件处理
 */
export class FrappeGanttWrapper {
  private gantt: any = null;
  private container: HTMLElement;
  private config: FrappeGanttConfig;

  constructor(container: HTMLElement, config: FrappeGanttConfig) {
    this.container = container;
    this.config = config;
  }

  /**
   * 初始化 Frappe Gantt
   */
  async init(): Promise<void> {
    // 动态导入 Frappe Gantt
    const { default: FrappeGantt } = await import('frappe-gantt');

    this.gantt = new FrappeGantt(this.container, [], this.config);
  }

  /**
   * 更新任务数据
   */
  updateTasks(tasks: FrappeTask[]): void {
    if (!this.gantt) return;
    this.gantt.refresh(tasks);
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<FrappeGanttConfig>): void {
    this.config = { ...this.config, ...config };
    // Frappe Gantt 需要重新初始化来应用新配置
    if (this.gantt) {
      this.gantt.refresh(this.gantt.tasks, this.config);
    }
  }

  /**
   * 销毁实例
   */
  destroy(): void {
    if (this.gantt) {
      this.gantt = null;
    }
    this.container.empty();
  }

  /**
   * 获取当前任务数据
   */
  getTasks(): FrappeTask[] {
    return this.gantt?.tasks || [];
  }
}
```

---

## 7. 事件处理设计

### 7.1 事件流

```
用户操作
    ↓
Frappe Gantt 事件
    ↓
TaskUpdateHandler 处理
    ↓
更新 Markdown 文件
    ↓
通知 TaskCacheManager
    ↓
刷新视图
```

### 7.2 TaskUpdateHandler

```typescript
/**
 * 处理甘特图任务更新
 */
export class TaskUpdateHandler {
  constructor(
    private app: App,
    private plugin: any
  ) {}

  /**
   * 处理日期变更（拖拽）
   */
  async handleDateChange(
    task: FrappeTask,
    newStart: Date,
    newEnd: Date,
    startField: DateFieldType,
    endField: DateFieldType
  ): Promise<void> {
    // 1. 从 task.id 解析原始任务位置
    const { filePath, lineNumber } = this.parseTaskId(task.id);

    // 2. 读取文件内容
    const content = await this.app.vault.read(filePath);

    // 3. 更新对应行的日期标记
    const updatedContent = this.updateTaskDates(
      content,
      lineNumber,
      startField,
      endField,
      newStart,
      newEnd
    );

    // 4. 写回文件
    await this.app.vault.write(filePath, updatedContent);

    // 5. 通知缓存更新
    await this.plugin.taskCache.updateFileCache(filePath);

    // 6. 刷新视图
    this.plugin.calendarView.render();
  }

  /**
   * 处理进度变更
   */
  async handleProgressChange(
    task: FrappeTask,
    progress: number
  ): Promise<void> {
    // 类似处理流程
  }

  /**
   * 解析任务ID
   */
  private parseTaskId(id: string): { filePath: string; lineNumber: number } {
    const [fileName, lineNumber] = id.split('-').slice(-2);
    return {
      filePath: `.../${fileName}`,  // 需要完整路径
      lineNumber: parseInt(lineNumber)
    };
  }

  /**
   * 更新任务日期
   */
  private updateTaskDates(
    content: string,
    lineNumber: number,
    startField: DateFieldType,
    endField: DateFieldType,
    newStart: Date,
    newEnd: Date
  ): string {
    // 实现日期更新逻辑
  }
}
```

---

## 8. 实施计划

### Phase 1: 准备工作 (第1周)

- [ ] 1.1 安装 Frappe Gantt 依赖
- [ ] 1.2 创建类型定义文件
- [ ] 1.3 创建目录结构

### Phase 2: 核心功能 (第2周)

- [ ] 2.1 实现 TaskDataAdapter
- [ ] 2.2 实现 FrappeGanttWrapper
- [ ] 2.3 重写 GanttView.ts

### Phase 3: 事件处理 (第3周)

- [ ] 3.1 实现 TaskUpdateHandler
- [ ] 3.2 实现日期拖拽更新
- [ ] 3.3 实现进度变更

### Phase 4: 样式和主题 (第3-4周)

- [ ] 4.1 创建 Frappe Gantt 样式覆盖
- [ ] 4.2 集成 Obsidian 主题变量
- [ ] 4.3 添加中文本地化

### Phase 5: 测试和优化 (第4周)

- [ ] 5.1 功能测试
- [ ] 5.2 性能优化
- [ ] 5.3 移除旧代码

---

## 9. 依赖配置

### 9.1 package.json 添加

```json
{
  "dependencies": {
    "frappe-gantt": "^0.6.1"
  },
  "devDependencies": {
    "@types/frappe-gantt": "latest"  // 如果有类型定义
  }
}
```

### 9.2 esbuild 配置更新

```javascript
// esbuild.config.mjs
export const esbuildOptions = {
  // ... 现有配置

  // Frappe Gantt 需要特殊处理
  external: ['frappe-gantt'],  // 或者打包进 bundle
  // 如果打包进 bundle，可能需要处理 SVG 相关依赖
};
```

---

## 10. 风险和缓解措施

| 风险 | 影响 | 缓解措施 |
|-----|-----|---------|
| Frappe Gantt 与 Obsidian 样式冲突 | 高 | 使用 CSS scope 和变量覆盖 |
| 任务拖拽更新文件失败 | 中 | 添加错误处理和回滚机制 |
| 性能问题（大量任务） | 中 | 实现虚拟渲染或分页 |
| 日期格式兼容性 | 低 | 创建严格的适配层 |

---

## 11. 成功指标

- [ ] Frappe Gantt 正常渲染任务
- [ ] 拖拽任务能正确更新文件
- [ ] 视图切换流畅无卡顿
- [ ] 样式与 Obsidian 主题一致
- [ ] 代码行数减少 30%+

---

*设计文档 v1.0*
