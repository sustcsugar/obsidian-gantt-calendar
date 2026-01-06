# 任务状态系统增强设计文档

## 版本信息
- **版本**: 1.1.7
- **创建日期**: 2024-12-26
- **设计类型**: 任务状态系统增强

## 目标

扩展任务状态系统，支持多种自定义状态，并为不同状态配置不同的视觉样式。

## 需求概述

### 1. 任务状态定义

为 `GanttTask` 添加 `status` 属性，支持 7 种默认状态：

| 符号 | 状态名称 | 说明 |
|------|----------|------|
| `[ ]` | TODO | 待办任务 |
| `[x]` | DONE | 已完成 |
| `[!]` | IMPORTANT | 重要任务 |
| `[-]` | CANCELED | 已取消 |
| `[/]` | IN_PROGRESS | 进行中 |
| `[?]` | QUESTION | 有疑问 |
| `[n]` | START | 已开始 |

### 2. 状态配置管理

- 新建 `src/tasks/taskStatus.ts` 统一管理所有任务状态
- 保留扩展接口，支持用户自定义状态

### 3. 修正现有代码

- 修正右键菜单取消任务的代码（`[-]` 才是取消，`[/]` 是进行中）
- 更新复选框状态解析逻辑

### 4. 标签支持

- 为 `GanttTask` 添加 `tags: string[]` 属性
- 从任务描述中解析标签

### 5. 视图渲染 - 颜色配置统一化

**颜色配置统一化设计**：

| 类型 | 作用 | 说明 |
|------|------|------|
| **默认状态颜色** | 存储在设置中的默认值 | 7 种默认状态自带的初始颜色值 |
| **马卡龙配色** | 预设颜色选项 | 在设置界面中以小方块色卡展示，供用户快速选择 |
| **CSS 样式颜色** | 实际应用的颜色 | 统一从设置读取，通过 CSS 变量动态应用 |

---

## 文件结构

```
src/
├── tasks/
│   ├── taskStatus.ts                [新建] 任务状态定义和管理
│   ├── taskParser/
│   │   ├── step4.ts                 [修改] 更新复选框状态解析
│   │   ├── utils.ts                 [修改] 添加标签提取
│   │   └── main.ts                  [修改] 添加 status 和 tags 解析
│   ├── taskSerializer.ts            [修改] 更新序列化逻辑
│   └── taskUpdater.ts               [修改] 更新状态更新逻辑
├── contextMenu/commands/
│   └── cancelTask.ts                [修改] 修正取消任务逻辑
├── views/
│   ├── BaseViewRenderer.ts          [修改] 更新复选框渲染（原 BaseViewRenderer.ts）
│   ├── TaskView.ts                  [修改] 任务卡片样式
│   ├── GanttView.ts                 [修改] 甘特图任务卡片
│   ├── WeekView.ts                  [修改] 周视图状态颜色
│   ├── DayView.ts                   [修改] 日视图状态颜色
│   └── MonthView.ts                 [修改] 月视图任务卡片
├── settings/
│   ├── index.ts                     [修改] 添加 taskStatuses 设置项
│   ├── builders/
│   │   └── TaskStatusSettingsBuilder.ts  [新建] 任务状态设置UI
│   ├── modals/
│   │   └── AddCustomStatusModal.ts  [新建] 自定义状态添加对话框
│   └── components/
│       ├── TaskStatusCard.ts        [新建] 任务状态卡片组件
│       └── MacaronColorPicker.ts    [新建] 马卡龙色卡选择器
├── styles/
│   └── styles.css                   [修改] 添加 CSS 变量
└── types.ts                         [修改] 扩展 GanttTask 接口
```

---

## 实施方案

### 阶段 1：核心状态模块

**新建 `src/tasks/taskStatus.ts`**

```typescript
/**
 * 任务状态定义
 * 统一管理所有任务状态及其配置
 */

// 状态类型
export type TaskStatusType =
    | 'todo'
    | 'done'
    | 'important'
    | 'canceled'
    | 'in_progress'
    | 'question'
    | 'start'
    | string; // 支持用户自定义

// 状态接口
export interface TaskStatus {
    key: TaskStatusType;
    symbol: string;           // 复选框符号 (单个字符)
    name: string;             // 显示名称
    description: string;      // 描述
    backgroundColor: string;  // 卡片背景色
    textColor: string;        // 文字颜色
    isDefault: boolean;       // 是否为默认状态
}

// 默认状态配置
export const DEFAULT_TASK_STATUSES: TaskStatus[] = [
    { key: 'todo', symbol: ' ', name: '待办', description: '待办任务',
      backgroundColor: '#FFFFFF', textColor: '#333333', isDefault: true },
    { key: 'done', symbol: 'x', name: '已完成', description: '已完成任务',
      backgroundColor: '#52c41a', textColor: '#FFFFFF', isDefault: true },
    { key: 'important', symbol: '!', name: '重要', description: '重要任务',
      backgroundColor: '#ff4d4f', textColor: '#FFFFFF', isDefault: true },
    { key: 'canceled', symbol: '-', name: '已取消', description: '已取消任务',
      backgroundColor: '#d9d9d9', textColor: '#666666', isDefault: true },
    { key: 'in_progress', symbol: '/', name: '进行中', description: '进行中任务',
      backgroundColor: '#faad14', textColor: '#FFFFFF', isDefault: true },
    { key: 'question', symbol: '?', name: '有疑问', description: '有疑问任务',
      backgroundColor: '#ffc069', textColor: '#333333', isDefault: true },
    { key: 'start', symbol: 'n', name: '已开始', description: '已开始任务',
      backgroundColor: '#40a9ff', textColor: '#FFFFFF', isDefault: true },
];

// 马卡龙配色（仅供设置界面的色卡选择器使用）
export const MACARON_COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B195', '#A3E4D7',
    '#FFB6B9', '#C7CEEA', '#FFD700', '#98D8C8', '#FAD7A0',
    '#FFCC5C', '#F4E1D2', '#FFA07A', '#C8F7C5', '#B8E0D2',
];

// 状态符号验证
export const STATUS_SYMBOL_REGEX = /^[a-zA-Z0-9]$/;
export const STATUS_SYMBOL_EXCLUDED = ['/', '|', '_', '$', '#', '^', '*'];

// 工具函数
export function getStatusBySymbol(symbol: string): TaskStatus | undefined;
export function validateStatusSymbol(symbol: string): { valid: boolean; error?: string };
export function getStatusColor(statusKey: string, statuses: TaskStatus[]): { bg: string; text: string } | undefined;
```

### 阶段 2：类型和设置

**修改 `src/types.ts`** - 添加 `status` 和 `tags` 属性

**修改 `src/settings/index.ts`** - 添加 `taskStatuses` 设置项
**新建 `src/settings/builders/TaskStatusSettingsBuilder.ts`** - 任务状态设置UI构建器
**新建 `src/settings/modals/AddCustomStatusModal.ts`** - 自定义状态添加对话框

### 阶段 3：解析逻辑更新

**修改 `src/tasks/taskParser/step4.ts`** - 修正复选框状态解析

**修改 `src/tasks/taskParser/utils.ts`** - 添加标签提取

**修改 `src/tasks/taskParser/main.ts`** - 解析 status 和 tags

### 阶段 4：修正现有代码

**修改 `src/contextMenu/commands/cancelTask.ts`** - 更新取消任务逻辑（`[-]` 是取消）

**修改 `src/tasks/taskSerializer.ts`** - 支持状态序列化

**修改 `src/tasks/taskUpdater.ts`** - 支持状态更新

### 阶段 5：视图渲染

**修改视图渲染文件** - 更新任务卡片样式

### 阶段 6：样式和设置界面

**修改 `src/styles/styles.css`** - 添加 CSS 变量

---

## 注意事项

1. **向后兼容**：保持 `completed` 属性与 `status` 的同步
2. **状态优先级**：当状态与 completed 冲突时，以状态为准
3. **符号限制**：自定义状态符号只接受 a-zA-Z0-9
4. **排除符号**：`\/|_$#^*` 不允许使用
5. **数量限制**：用户最多添加 3 种自定义状态
6. **颜色统一**：所有颜色都从设置中读取
7. **设置验证**：非法字符标红提示，不允许添加

---

## 实施记录

### 2024-12-26 阶段 1-4 完成 ✅

#### 新建文件
- `src/tasks/taskStatus.ts` - 任务状态定义模块
  - 定义 7 种默认状态 (todo, done, important, canceled, in_progress, question, start)
  - 定义 TaskStatus 接口
  - 马卡龙配色方案 (20 种预设颜色)
  - 状态符号验证工具函数
  - 状态解析和颜色获取工具函数

#### 修改文件详情

| 文件 | 修改内容 |
|------|----------|
| `src/types.ts` | - 添加 `status?: TaskStatusType` 属性<br>- 添加 `tags?: string[]` 属性<br>- 修正 `cancelled` 属性注释（`[-]` 是取消） |
| `src/settings.ts` | - 导入 `TaskStatus` 和 `DEFAULT_TASK_STATUSES`<br>- 添加 `taskStatuses: TaskStatus[]` 设置项 |
| `src/tasks/taskParser/step4.ts` | - 导入 `parseStatusFromCheckbox`<br>- `CheckboxStatus` 接口添加 `status` 属性<br>- 更新 `parseCheckboxStatus()` 返回状态类型<br>- 修正 `isCancelled()` 使用 `[-]` 判断取消 |
| `src/tasks/taskParser/utils.ts` | - 添加 `extractTags()` 函数提取 `#tag` 格式标签<br>- 添加 `removeTags()` 函数移除标签 |
| `src/tasks/taskParser/main.ts` | - 导入 `extractTags`<br>- 解析时获取 `status` 属性<br>- 解析时提取 `tags` 数组 |
| `src/contextMenu/commands/cancelTask.ts` | - 使用 `status: 'canceled'` 更新状态<br>- 修正注释说明 `[-]` 是取消状态 |
| `src/tasks/taskSerializer.ts` | - 添加 `status` 到 `TaskUpdates` 接口<br>- 序列化时根据 `status` 设置复选框符号<br>- 修正取消状态使用 `[-]` 而非 `[/]` |
| `src/tasks/taskUpdater.ts` | - 更新正则支持任意单字符复选框状态 `\[.\]` |

#### 状态符号修正

| 原实现 | 修正后 | 说明 |
|--------|--------|------|
| `[/]` → cancelled | `[-]` → canceled | 取消状态符号修正 |
| `[/]` → (无) | `[/]` → in_progress | 进行中状态 |

#### 构建验证
```bash
npm run build
# ✅ 编译成功，无错误
```

---

## 待实施任务

### 阶段 5：视图渲染 ✅ 已完成

#### 修改详情

| 文件 | 修改内容 |
|------|----------|
| `src/views/BaseViewRenderer.ts` | - 导入 `getStatusColor` 和 `DEFAULT_TASK_STATUSES`<br>- 添加 `getStatusColors()` 方法获取状态颜色<br>- 添加 `applyStatusColors()` 方法应用颜色到元素 |
| `src/views/TaskView.ts` | - 在 `renderTaskItem()` 中调用 `applyStatusColors()` 应用状态颜色 |
| `src/views/GanttView.ts` | - 任务卡片应用状态颜色<br>- 甘特条应用状态颜色 |
| `src/views/MonthView.ts` | - 在 `renderMonthTaskItem()` 中调用 `applyStatusColors()` 应用状态颜色 |
| `src/styles/styles.css` | - 添加 `.task-with-status` 样式类<br>- 支持通过 CSS 变量 `--task-bg-color` 和 `--task-text-color` 动态应用颜色 |

#### 样式实现

```css
/* 状态颜色变量 - 从插件设置中读取 */
.calendar-day-task-item.task-with-status,
.calendar-week-task-item.task-with-status,
.calendar-month-task-item.task-with-status,
.gantt-task-item.task-with-status,
.gantt-task-card.task-with-status,
.gantt-bar.task-with-status {
    background-color: var(--task-bg-color, var(--background-secondary));
    color: var(--task-text-color, var(--text-normal));
}
```

#### 构建验证
```bash
npm run build
# ✅ 编译成功，无错误
```

---

### 阶段 6：周视图/日视图/设置界面 ✅ 已完成

#### 修改详情

| 文件 | 修改内容 |
|------|----------|
| `src/views/WeekView.ts` | - 在 `renderWeekTaskItem()` 中调用 `applyStatusColors()` |
| `src/views/DayView.ts` | - 在 `renderDayTaskItem()` 中调用 `applyStatusColors()` |
| `src/settings.ts` | - 导入 `MACARON_COLORS` 和 `validateStatusSymbol`<br>- 导入 `Modal` 类<br>- 添加 `createTaskStatusSettings()` 方法<br>- 添加 `createSingleStatusSetting()` 方法<br>- 添加 `showAddCustomStatusModal()` 方法<br>- 添加 `SettingModal` 类（自定义状态添加对话框） |

#### 设置界面功能

1. **默认状态管理**
   - 显示 7 种默认状态
   - 支持修改背景色和文字色
   - 提供马卡龙配色快速选择

2. **自定义状态**
   - 最多添加 3 种自定义状态
   - 配置项：
     - 状态名称（中文）
     - 状态标识（英文 key）
     - 复选框符号（单个字符）
     - 状态描述
     - 背景颜色
     - 文字颜色
   - 符号验证：只允许字母和数字
   - 不能使用默认状态的符号

3. **模态框界面**
   - 马卡龙配色色卡快速选择
   - 实时表单验证
   - 颜色选择器

#### 构建验证
```bash
npm run build
# ✅ 编译成功，无错误
```

---

## 完成状态总结

| 阶段 | 文件数 | 状态 |
|------|--------|------|
| 阶段 1：核心状态模块 | 1 | ✅ |
| 阶段 2：类型和设置 | 2 | ✅ |
| 阶段 3：解析逻辑更新 | 3 | ✅ |
| 阶段 4：修正现有代码 | 3 | ✅ |
| 阶段 5：视图渲染 | 7 | ✅ |
| 阶段 6：样式和设置界面 | 2 | ✅ |

### 总计修改文件：18 个

---

## 完整文件修改清单

### 新建文件 (2 个)

| 文件 | 说明 | 代码行数 |
|------|------|----------|
| `src/tasks/taskStatus.ts` | 任务状态定义和管理模块 | ~320 行 |
| `spec/taskStatus-design.md` | 本设计文档 | ~350 行 |

### 修改文件 (16 个)

| 文件 | 主要变更 | 代码行数变化 |
|------|----------|-------------|
| `src/types.ts` | 添加 `status` 和 `tags` 属性到 `GanttTask` | +2 |
| `src/settings.ts` | 添加状态配置 UI 和 SettingModal 类 | +480 |
| `src/tasks/taskParser/step4.ts` | 更新复选框状态解析 | +15 |
| `src/tasks/taskParser/utils.ts` | 添加标签提取函数 | +40 |
| `src/tasks/taskParser/main.ts` | 解析 status 和 tags | +8 |
| `src/contextMenu/commands/cancelTask.ts` | 修正取消任务逻辑 | ~10 |
| `src/tasks/taskSerializer.ts` | 支持状态序列化 | +15 |
| `src/tasks/taskUpdater.ts` | 支持状态更新 | +2 |
| `src/views/BaseViewRenderer.ts` | 添加状态颜色方法 | +20 |
| `src/views/TaskView.ts` | 应用状态颜色 | +2 |
| `src/views/GanttView.ts` | 应用状态颜色 | +4 |
| `src/views/MonthView.ts` | 应用状态颜色 | +2 |
| `src/views/WeekView.ts` | 应用状态颜色 | +2 |
| `src/views/DayView.ts` | 应用状态颜色 | +2 |
| `src/styles/styles.css` | 添加状态颜色样式 | +40 |

---

## 代码变更详情

### 1. BaseViewRenderer.ts - 新增方法

```typescript
import { getStatusColor, DEFAULT_TASK_STATUSES } from '../tasks/taskStatus';

/**
 * 获取任务状态颜色配置
 */
protected getStatusColors(task: GanttTask): { bg: string; text: string } | null {
    if (!task.status) return null;
    const taskStatuses = this.plugin?.settings?.taskStatuses || DEFAULT_TASK_STATUSES;
    return getStatusColor(task.status, taskStatuses) || null;
}

/**
 * 应用状态颜色到任务元素
 */
protected applyStatusColors(task: GanttTask, element: HTMLElement): void {
    const colors = this.getStatusColors(task);
    if (colors) {
        element.style.setProperty('--task-bg-color', colors.bg);
        element.style.setProperty('--task-text-color', colors.text);
        element.addClass('task-with-status');
    }
}
```

### 2. settings.ts - 设置界面方法

#### createTaskStatusSettings()
```typescript
private createTaskStatusSettings(containerEl: HTMLElement): void {
    // 默认状态列表
    DEFAULT_TASK_STATUSES.forEach((status) => {
        this.createSingleStatusSetting(defaultStatusesDiv, status);
    });

    // 自定义状态部分
    const customStatuses = this.plugin.settings.taskStatuses.filter(s => !s.isDefault);
    // 显示自定义状态数量提示和添加按钮
}
```

#### createSingleStatusSetting()
```typescript
private createSingleStatusSetting(
    containerEl: HTMLElement,
    status: TaskStatus,
    isCustom: boolean = false
): void {
    // 创建状态卡片：图标、名称、颜色选择器、删除按钮
}
```

#### SettingModal 类
```typescript
class SettingModal extends Modal {
    // 模态框用于添加自定义状态
    // 包含表单：名称、key、符号、描述、颜色选择
}
```

### 3. styles.css - 状态颜色样式

```css
/* 状态颜色变量 - 从插件设置中读取 */
.calendar-day-task-item.task-with-status,
.calendar-week-task-item.task-with-status,
.calendar-month-task-item.task-with-status,
.gantt-task-item.task-with-status,
.gantt-task-card.task-with-status,
.gantt-bar.task-with-status {
    background-color: var(--task-bg-color, var(--background-secondary));
    color: var(--task-text-color, var(--text-normal));
}
```

---

## 使用说明

### 用户操作流程

1. **打开插件设置**
   - 进入 Obsidian 设置 → 插件 → Gantt Calendar

2. **任务状态设置**
   - 滚动到"任务状态设置"部分
   - 可以看到 7 种默认状态及其当前颜色

3. **修改默认状态颜色**
   - 点击色块选择自定义颜色
   - 或点击马卡龙配色快速选择

4. **添加自定义状态**
   - 点击"添加自定义状态"按钮
   - 填写状态名称、标识、符号、描述
   - 选择背景色和文字色
   - 点击"添加"完成

### 任务状态使用

在 Markdown 文件中创建任务时，使用对应的复选框符号：

```markdown
- [ ] 待办任务
- [x] 已完成任务
- [!] 重要任务
- [-] 已取消任务
- [/] 进行中任务
- [?] 有疑问任务
- [n] 已开始任务
- [p] 自定义任务（如果添加了符号为 p 的自定义状态）
```

---

## 测试清单

- [x] 编译通过
- [ ] 默认状态颜色正确显示
- [ ] 自定义状态添加功能正常
- [ ] 自定义状态删除功能正常
- [ ] 颜色修改后视图实时更新
- [ ] 各视图（年/月/周/日/任务/甘特图）状态颜色正确
- [ ] 任务序列化正确写入状态符号
- [ ] 标签提取功能正常

---

## 2024-12-26 复选框功能增强 ✅

### Bug 修复：复选框点击切换完成状态失效

#### 问题描述
添加任务状态系统后，点击任务卡片复选框切换完成状态失效。

#### 根本原因
`updateTaskCompletion()` 函数只更新了 `completed` 属性，但没有同步更新 `status` 属性。在 `serializeTask()` 中，复选框符号优先使用 `status` 对应的值，导致即使 `completed = true`，复选框符号仍显示为待办状态。

#### 修复方案
修改 `src/tasks/taskUpdater.ts` 中的 `updateTaskCompletion()` 函数：

```typescript
export async function updateTaskCompletion(
    app: App,
    task: GanttTask,
    completed: boolean,
    enabledFormats: string[]
): Promise<void> {
    const updates: TaskUpdates = { completed };

    if (completed) {
        updates.completionDate = new Date();
        // 同步更新状态为 done
        updates.status = 'done';
    } else {
        updates.completionDate = null;
        // 取消完成时，如果当前状态是 done，则改为 todo
        if (task.status === 'done') {
            updates.status = 'todo';
        }
    }

    await updateTaskProperties(app, task, updates, enabledFormats);
}
```

---

### 功能增强：复选框样式配置

#### 新增功能
为每个任务状态添加复选框样式配置，支持自定义复选框颜色和图标样式。

#### 复选框样式类型

| 样式 | 效果 | 圆角 |
|------|------|------|
| **square** | 方形复选框 | 2px |
| **circle** | 圆形复选框 | 50% |
| **rounded** | 圆角方形 | 6px |
| **minimal** | 极简样式（细边框） | 0px |
| **filled** | 填充样式（无选中勾号） | 4px |

#### 修改详情

| 文件 | 修改内容 |
|------|----------|
| `src/tasks/taskStatus.ts` | - 新增 `CheckboxIconStyle` 类型<br>- `TaskStatus` 接口添加 `checkboxColor` 和 `checkboxIcon` 属性<br>- 7 种默认状态配置复选框颜色和图标样式 |
| `src/settings.ts` | - 导入 `CheckboxIconStyle`<br>- `createSingleStatusSetting()` 添加复选框颜色选择器和图标样式下拉框<br>- `getBorderRadiusForIconStyle()` 辅助方法<br>- `SettingModal` 添加复选框颜色和图标样式输入 |
| `src/views/BaseViewRenderer.ts` | - 导入 `getStatusByKey` 和 `CheckboxIconStyle`<br>- `createTaskCheckbox()` 调用 `applyCheckboxStyle()`<br>- 新增 `applyCheckboxStyle()` 方法<br>- 新增 `getCheckboxBorderRadius()` 方法 |
| `styles.css` | - 新增约 140 行复选框样式 CSS<br>- 支持 5 种复选框样式<br>- 使用 CSS 变量 `--checkbox-color` 动态应用颜色 |

#### 默认状态复选框配置

| 状态 | 复选框颜色 | 图标样式 |
|------|-----------|----------|
| TODO | #999999 | square |
| DONE | #52c41a | filled |
| IMPORTANT | #ff4d4f | rounded |
| CANCELED | #d9d9d9 | minimal |
| IN_PROGRESS | #faad14 | circle |
| QUESTION | #ffc069 | rounded |
| START | #40a9ff | square |

#### 复选框 CSS 样式示例

```css
/* 复选框基础样式 */
.gantt-task-checkbox {
    --checkbox-color: #999999;
    appearance: none;
    width: 18px;
    height: 18px;
    border: 2px solid var(--checkbox-color, var(--text-faint));
    background-color: transparent;
    cursor: pointer;
    position: relative;
}

/* 圆形样式 */
.gantt-task-checkbox.checkbox-circle {
    border-radius: 50%;
}

/* 填充样式 */
.gantt-task-checkbox.checkbox-filled {
    border-radius: 4px;
    border-width: 0;
    background-color: var(--checkbox-color);
}
```

#### 构建验证
```bash
npm run build
# ✅ 编译成功，无错误
```

---
