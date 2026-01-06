# 拖拽任务卡片全局过滤器丢失Bug分析

## Bug现象

### 输入（原始任务）
```markdown
- [ ]  🎯 测试编辑功能123123 ➕ 2025-12-25 🛫 2025-12-25 📅 2025-12-26
```

### 输出（拖动后）
```markdown
- [ ]   测试编辑功能123123 ➕ 2025-12-25 🛫 2025-12-25 📅 2025-12-27
```

**问题**: 全局过滤器 `🎯` 丢失

## 执行路径分析

### 完整调用链

```
用户拖拽任务卡片（WeekView.ts）
  ↓
handleDrop() 事件处理 (WeekView.ts:89-95)
  ↓
updateTaskDateField(app, sourceTask, dateFieldName, targetDate, enabledFormats)
  ↓
updateTaskProperties(app, task, updates, enabledFormats)
  ↓
extractGlobalFilter(taskLine, updates.globalFilter)  // ⚠️ 问题在这里
  ↓
serializeTask(task, updates, format, globalFilter)
  ↓
写回文件
```

### 关键代码路径

#### 1. WeekView.ts (第89-95行)
```typescript
await updateTaskDateField(
    this.app,
    sourceTask,
    dateFieldName,
    targetDate,
    this.plugin.settings.enabledTaskFormats
    // ❌ 没有传递 globalFilter 参数！
);
```

#### 2. taskUpdater.ts (第220-231行)
```typescript
export async function updateTaskDateField(
    app: App,
    task: GanttTask,
    dateFieldName: string,
    newDate: Date,
    enabledFormats: string[]
): Promise<void> {
    const updates: TaskUpdates = {
        [dateFieldName]: newDate
    };

    await updateTaskProperties(app, task, updates, enabledFormats);
    // ❌ updates 对象中没有 globalFilter 属性
}
```

#### 3. taskUpdater.ts (第259-260行)
```typescript
// 提取全局过滤器（优先使用 updates 中提供的，否则从原始行中提取）
const globalFilter = extractGlobalFilter(taskLine, updates.globalFilter);
// updates.globalFilter 是 undefined，所以依赖从原始行提取
```

#### 4. taskUpdater.ts (第15-55行) - ⚠️ 问题根源
```typescript
function extractGlobalFilter(taskLine: string, knownGlobalFilter?: string): string | undefined {
    // ...

    // 提取复选框后面的内容
    const match = taskLine.match(/^\s*[-*]\s*\[[ xX]\]\s*(.+?)$/);
    const rest = match[1]; // " 🎯 测试编辑功能123123 ..."（注意前面的空格）

    // 尝试提取全局过滤器
    const globalFilterPatterns = [
        /^[🎯📌✅⭐🔴🟡🟢]\s*/,  // ❌ 这个模式有问题！
        /^#[\w\u4e00-\u9fa5]+\s*/,
        /^[A-Z]{2,}\s*/,
        /^[🎯🎨📋💡]\s*/,
    ];

    for (const pattern of globalFilterPatterns) {
        const filterMatch = rest.match(pattern);
        // ❌ rest 以空格开头：" 🎯 ..."
        // ❌ pattern 要求从开头就是 emoji
        // ❌ 匹配失败！
    }

    return undefined;  // 返回 undefined
}
```

## 根本原因

### 原因 1: 正则表达式不匹配前导空格

**问题代码**:
```typescript
const globalFilterPatterns = [
    /^[🎯📌✅⭐🔴🟡🟢]\s*/,  // ❌ 要求从开头就是 emoji
];
```

**问题分析**:
- 原始任务：`- [ ]  🎯 测试任务`（`[ ]` 后有两个空格）
- 提取的 `rest`：` 🎯 测试任务`（以空格开头）
- 正则模式：`/^[🎯📌✅⭐🔴🟡🟢]\s*/`（要求开头就是 emoji）
- 匹配结果：**失败**（因为 `rest` 以空格开头，不是 emoji）

### 原因 2: 没有传递 globalFilter

**问题代码**:
```typescript
// WeekView.ts
await updateTaskDateField(...);  // ❌ 没有传递 globalFilter

// taskUpdater.ts
const updates: TaskUpdates = {
    [dateFieldName]: newDate
};  // ❌ 没有 globalFilter 属性
```

**影响**: 即使 `extractGlobalFilter()` 工作正常，也需要在所有调用点传递 `globalFilter`。

## 问题示例

### 示例 1: 两个空格
```typescript
// 原始任务
"- [ ]  🎯 测试任务"

// extractGlobalFilter() 提取
rest = " 🎯 测试任务"  // 以空格开头

// 正则匹配
/^[🎯📌✅⭐🔴🟡🟢]\s*/.exec(rest)
// 结果：null（匹配失败）

// 返回
undefined

// serializeTask() 序列化
// globalFilter 是 undefined，不添加全局过滤器

// 最终输出
"- [ ] 测试任务"  // ❌ 全局过滤器丢失
```

### 示例 2: 一个空格
```typescript
// 原始任务
"- [ ] 🎯 测试任务"

// extractGlobalFilter() 提取
rest = " 🎯 测试任务"  // 以空格开头

// 正则匹配
/^[🎯📌✅⭐🔴🟡🟢]\s*/.exec(rest)
// 结果：null（匹配失败）

// 返回
undefined

// 最终输出
"- [ ] 测试任务"  // ❌ 全局过滤器丢失
```

### 示例 3: 没有空格
```typescript
// 原始任务
"- [ ]🎯 测试任务"

// extractGlobalFilter() 提取
rest = "🎯 测试任务"  // 以 emoji 开头

// 正则匹配
/^[🎯📌✅⭐🔴🟡🟢]\s*/.exec(rest)
// 结果：["🎯 ", "🎯 "]（匹配成功）

// 返回
"🎯 "

// 最终输出
"- [ ] 🎯 测试任务"  // ✅ 全局过滤器保留
```

## 修复方案

### 方案 1: 修复正则表达式（推荐）

**修改位置**: `src/tasks/taskUpdater.ts:35-40`

**修改前**:
```typescript
const globalFilterPatterns = [
    /^[🎯📌✅⭐🔴🟡🟢]\s*/,  // ❌ 要求从开头就是 emoji
    /^#[\w\u4e00-\u9fa5]+\s*/,
    /^[A-Z]{2,}\s*/,
    /^[🎯🎨📋💡]\s*/,
];
```

**修改后**:
```typescript
const globalFilterPatterns = [
    /^\s*[🎯📌✅⭐🔴🟡🟢]\s*/,  // ✅ 允许前导空格
    /^\s*#[\w\u4e00-\u9fa5]+\s*/,
    /^\s*[A-Z]{2,}\s*/,
    /^\s*[🎯🎨📋💡]\s*/,
];
```

**说明**:
- 在每个模式的开头添加 `\s*`，允许前导空格
- 这样无论原始任务中 `[ ]` 和 emoji 之间有多少空格，都能正确匹配

### 方案 2: 预处理 rest（辅助方案）

**修改位置**: `src/tasks/taskUpdater.ts:31`

**修改前**:
```typescript
const rest = match[1]; // 复选框后的所有内容
```

**修改后**:
```typescript
let rest = match[1]; // 复选框后的所有内容
// 移除前导空格
rest = rest.trimStart();
```

**说明**:
- 在匹配前移除 `rest` 的前导空格
- 这样现有的正则模式就能正常工作

### 方案 3: 传递 globalFilter（补充方案）

**修改位置**: `WeekView.ts`, `GanttView.ts` 等调用 `updateTaskDateField()` 的地方

**修改前**:
```typescript
await updateTaskDateField(
    this.app,
    sourceTask,
    dateFieldName,
    targetDate,
    this.plugin.settings.enabledTaskFormats
);
```

**修改后**:
```typescript
await updateTaskDateField(
    this.app,
    sourceTask,
    dateFieldName,
    targetDate,
    this.plugin.settings.enabledTaskFormats,
    this.plugin.settings.globalTaskFilter  // ✅ 传递全局过滤器
);
```

**同时修改 `updateTaskDateField()` 函数签名**:
```typescript
export async function updateTaskDateField(
    app: App,
    task: GanttTask,
    dateFieldName: string,
    newDate: Date,
    enabledFormats: string[],
    globalFilter?: string  // ✅ 新增参数
): Promise<void> {
    const updates: TaskUpdates = {
        [dateFieldName]: newDate,
        globalFilter  // ✅ 添加到 updates
    };

    await updateTaskProperties(app, task, updates, enabledFormats);
}
```

## 推荐修复顺序

### 优先级 1: 修复正则表达式（必须）
- 修改 `extractGlobalFilter()` 中的正则模式
- 添加 `\s*` 前缀允许前导空格
- 这能解决大部分情况

### 优先级 2: 传递 globalFilter（建议）
- 修改 `updateTaskDateField()` 函数签名
- 在所有调用点传递 `globalFilter`
- 这样即使自动提取失败，也有回退方案

### 优先级 3: 添加调试日志（可选）
- 在 `extractGlobalFilter()` 中添加日志
- 记录匹配失败的情况
- 便于未来排查问题

## 测试用例

### 测试用例 1: 两个空格
```typescript
// 输入
"- [ ]  🎯 测试任务"

// 预期输出
"- [ ]  🎯 测试任务"  // 全局过滤器保留
```

### 测试用例 2: 一个空格
```typescript
// 输入
"- [ ] 🎯 测试任务"

// 预期输出
"- [ ] 🎯 测试任务"  // 全局过滤器保留
```

### 测试用例 3: 没有空格
```typescript
// 输入
"- [ ]🎯 测试任务"

// 预期输出
"- [ ]🎯 测试任务"  // 全局过滤器保留
```

### 测试用例 4: 多个空格
```typescript
// 输入
"- [ ]    🎯 测试任务"

// 预期输出
"- [ ]    🎯 测试任务"  // 全局过滤器保留
```

### 测试用例 5: 不同全局过滤器格式
```typescript
// 输入
"- [ ]  #task 测试任务"

// 预期输出
"- [ ]  #task 测试任务"  // 全局过滤器保留
```

## 影响范围

### 受影响的功能
- ✅ 右键编辑任务（正常，因为传递了 globalFilter）
- ❌ 拖拽任务卡片（异常，因为没有传递 globalFilter）
- ❌ 其他不传递 globalFilter 的操作

### 受影响的全局过滤器格式
- ❌ Emoji 格式（`🎯`, `📌`, `✅` 等）+ 前导空格
- ✅ Emoji 格式（`🎯`, `📌`, `✅` 等）+ 无前导空格
- ❌ #tag 格式 + 前导空格
- ✅ #tag 格式 + 无前导空格

## 总结

### 根本原因
`extractGlobalFilter()` 函数中的正则表达式没有考虑前导空格，导致匹配失败。

### 推荐修复
1. 修改正则表达式，添加 `\s*` 前缀（必须）
2. 在所有调用点传递 `globalFilter`（建议）

### 预期效果
- ✅ 拖拽任务卡片时全局过滤器保留
- ✅ 支持各种空格格式
- ✅ 兼容所有全局过滤器格式

---

**文档版本**: 1.0
**创建日期**: 2025-12-25
**作者**: Claude Code
**状态**: 待修复
