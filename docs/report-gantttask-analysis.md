# GanttTask 接口分析报告

## 版本信息
- **版本**: 1.1.6
- **分析日期**: 2024-12-26
- **分析范围**: GanttTask 接口与新解析架构的兼容性

## 当前 GanttTask 接口

```typescript
export interface GanttTask {
    // 核心标识
    filePath: string;              // 文件完整路径
    fileName: string;              // 文件名
    lineNumber: number;            // 行号 (1-based)

    // 内容
    content: string;               // 原始任务内容（保留格式用于写回）
    description: string;           // 清理后的描述（移除元数据）

    // 状态
    completed: boolean;            // 是否已完成
    cancelled?: boolean;           // 是否已取消（使用 [/] 复选框）

    // 格式和优先级
    format?: 'tasks' | 'dataview'; // 源格式类型
    priority?: string;             // 优先级：highest, high, medium, low, lowest

    // 日期属性
    createdDate?: Date;            // 创建日期 ➕
    startDate?: Date;              // 开始日期 🛫
    scheduledDate?: Date;          // 计划日期 ⏳
    dueDate?: Date;                // 截止日期 📅
    cancelledDate?: Date;          // 取消日期 ❌
    completionDate?: Date;         // 完成日期 ✅

    // 警告
    warning?: string;              // 格式问题或缺失属性警告
}
```

## 兼容性分析

### ✅ 已支持的属性

新解析架构 (`taskParser/`) 正确填充了所有现有属性：

| 属性 | step4.ts 解析函数 | 状态 |
|------|------------------|------|
| `filePath` | main.ts 从 file.path 获取 | ✅ |
| `fileName` | main.ts 从 file.basename 获取 | ✅ |
| `lineNumber` | main.ts 从 item.position 获取 | ✅ |
| `content` | main.ts 存储移除过滤器后的内容 | ✅ |
| `description` | utils.ts extractTaskDescription | ✅ |
| `completed` | step4.ts parseCheckboxStatus | ✅ |
| `cancelled` | step4.ts parseCheckboxStatus | ✅ |
| `format` | main.ts 从 detectFormat 获取 | ✅ |
| `priority` | step4.ts parseTasksPriority/parseDataviewPriority | ✅ |
| `createdDate` | step4.ts 日期解析 | ✅ |
| `startDate` | step4.ts 日期解析 | ✅ |
| `scheduledDate` | step4.ts 日期解析 | ✅ |
| `dueDate` | step4.ts 日期解析 | ✅ |
| `cancelledDate` | step4.ts 日期解析 | ✅ |
| `completionDate` | step4.ts 日期解析 | ✅ |
| `warning` | main.ts 设置警告 | ✅ |

### 📋 可选增强属性

以下属性在未来版本中可考虑添加，但不影响当前功能：

| 属性 | 类型 | 说明 | 优先级 |
|------|------|------|--------|
| `tags` | `string[]` | 任务标签（用于标签过滤） | 中 |
| `recurrence` | `string` | 重复任务规则 | 低 |
| `dependsOn` | `string[]` | 任务依赖关系 | 低 |
| `estimatedHours` | `number` | 预估工时 | 低 |
| `blockLink` | `string` | 块链接 | 低 |

## 新架构使用情况

### 调用方统计

| 调用方 | 文件 | 使用函数 |
|--------|------|----------|
| TaskCacheManager | taskManager.ts | parseTasksFromListItems |
| 任务搜索 | taskSearch.ts | parseTasksFromListItems |
| 向后兼容层 | taskParser.ts | 调用新模块实现 |

### 向后兼容性

`src/tasks/taskParser.ts` 保留原接口，内部委托给新实现：

```typescript
// 旧接口保持不变
export function parseTasksFromListItems(
    file: TFile,
    lines: string[],
    listItems: ListItemCache[],
    enabledFormats: string[],
    globalTaskFilter: string
): GanttTask[] {
    return newParseTasksFromListItems(...);
}
```

所有调用方无需修改代码。

## 编译验证

```bash
npm run build
# ✅ 编译成功，无错误
```

## 结论

### ✅ 当前状态
- GanttTask 接口设计完整
- 与新解析架构完全兼容
- 向后兼容性良好
- 编译测试通过

### 建议
1. **保持当前接口不变** - 满足现有需求
2. **暂不添加新属性** - 避免过度设计
3. **如需添加 tags** - 可在后续版本中按需添加
4. **继续使用新架构** - 通过 `./taskParser` 模块导入

### 迁移路径

如果未来需要添加 tags 属性：

1. 更新 GanttTask 接口添加 `tags?: string[]`
2. 在 `taskParser/step4.ts` 中添加标签解析函数
3. 在 `utils/extractTaskDescription` 中保留标签
4. 更新相关视图以显示标签
