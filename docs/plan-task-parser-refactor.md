# 任务解析模块重构设计文档

## 版本信息

- **版本号**: 1.1.6
- **更新日期**: 2024-12-26
- **重构类型**: 任务解析模块架构重构

## 概述

本次重构将硬编码的正则表达式统一迁移到专门的配置文件中，实现了任务解析的四步流程化架构，提高了代码的可维护性和可扩展性。

## 重构目标

1. **统一正则表达式管理** - 所有正则表达式集中在 `RegularExpressions.ts` 中管理
2. **四步解析流程** - 将任务解析拆分为清晰的四个步骤
3. **模块化架构** - 每个解析步骤独立成文件，便于维护和测试
4. **符号映射中间层** - 通过 `taskSerializerSymbols.ts` 统一管理格式符号
5. **向后兼容** - 保留原有函数接口，平滑迁移

## 架构设计

### 文件结构

```
src/
├── utils/
│   └── RegularExpressions.ts          # 正则表达式统一接口
├── tasks/
│   ├── taskSerializerSymbols.ts       # 格式符号映射配置
│   ├── taskParser.ts                  # 向后兼容层（@deprecated）
│   └── taskParser/
│       ├── index.ts                   # 统一导出入口
│       ├── step1.ts                   # 第一步：识别任务行
│       ├── step2.ts                   # 第二步：筛选任务行
│       ├── step3.ts                   # 第三步：判断格式
│       ├── step4.ts                   # 第四步：解析属性
│       ├── utils.ts                   # 工具函数
│       └── main.ts                    # 主解析函数
```

### 四步解析流程

```
原始文本
    │
    ▼
┌─────────────────────────────────┐
│ 第一步：识别任务行               │
│ 使用 RegularExpressions.taskRegex│
│ 匹配：缩进 + 列表标记 + 复选框    │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│ 第二步：筛选任务行               │
│ 根据 globalTaskFilter 过滤       │
│ 只处理插件关注的任务              │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│ 第三步：判断格式                 │
│ 检测 Tasks (emoji) 或 Dataview   │
│ (field::) 格式                   │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│ 第四步：解析属性                 │
│ 优先级、日期字段                 │
│ 映射到 GanttTask 对象            │
└─────────────────────────────────┘
    │
    ▼
  GanttTask 对象
```

## 模块详解

### 1. RegularExpressions.ts

**路径**: `src/utils/RegularExpressions.ts`

统一管理所有正则表达式，包含以下模块：

| 模块 | 说明 |
|------|------|
| `Tasks` | Tasks 格式正则（emoji） |
| `Dataview` | Dataview 格式正则（字段） |
| `DescriptionExtraction` | 描述提取正则 |
| `Checkbox` | 复选框状态常量 |

**示例**:
```typescript
// Tasks 格式优先级正则
RegularExpressions.Tasks.priorityRegex  // /\s*(🔺|⏫|🔼|🔽|⏬)\s*/g

// Dataview 格式日期正则
RegularExpressions.Dataview.dueDateRegex  // /\[due::\s*(\d{4}-\d{2}-\d{2})\]/gi

// 格式检测正则
RegularExpressions.Tasks.formatDetectionRegex
RegularExpressions.Dataview.formatDetectionRegex
```

### 2. taskSerializerSymbols.ts

**路径**: `src/tasks/taskSerializerSymbols.ts`

定义任务格式的符号映射和类型：

**类型定义**:
- `TaskFormatType` - `'tasks' | 'dataview'`
- `PriorityLevel` - `'highest' | 'high' | 'medium' | 'low' | 'lowest'`
- `DateFieldType` - 日期字段类型

**配置对象**:
- `TASKS_FORMAT_CONFIG` - Tasks 格式配置
- `DATAVIEW_FORMAT_CONFIG` - Dataview 格式配置
- `FORMAT_CONFIGS` - 格式注册表

**工具函数**:
```typescript
getFormatConfig(format)           // 获取格式配置
detectTaskFormat(content, formats) // 检测任务格式
parsePriorityFromEmoji(symbol)    // emoji 转优先级
parsePriorityFromDataview(value)  // 文本转优先级
```

### 3. step1.ts - 识别任务行

**路径**: `src/tasks/taskParser/step1.ts`

**主要函数**:
```typescript
interface TaskLineMatch {
    indent: string;
    listMarker: string;
    checkboxStatus: string;
    content: string;
}

isTaskLine(line: string): boolean
parseTaskLine(line: string): TaskLineMatch | null
extractTaskLines(lines: string[]): Array<{ lineNumber: number; match: TaskLineMatch }>
```

### 4. step2.ts - 筛选任务行

**路径**: `src/tasks/taskParser/step2.ts`

**主要函数**:
```typescript
interface FilterResult {
    passes: boolean;
    contentWithoutFilter: string;
}

passesGlobalFilter(content: string, globalTaskFilter?: string): boolean
removeGlobalFilter(content: string, globalTaskFilter?: string): string
applyFilter(content: string, globalTaskFilter?: string): FilterResult
```

### 5. step3.ts - 判断格式

**路径**: `src/tasks/taskParser/step3.ts`

**主要函数**:
```typescript
interface FormatDetectionResult {
    format: TaskFormatType | undefined;
    isMixed: boolean;
    hasTasksFormat: boolean;
    hasDataviewFormat: boolean;
}

detectFormat(content: string, enabledFormats: TaskFormatType[]): TaskFormatType | 'mixed' | undefined
detectFormatDetailed(content: string, enabledFormats: TaskFormatType[]): FormatDetectionResult
hasTasksFormat(content: string): boolean
hasDataviewFormat(content: string): boolean
isMixedFormat(content: string): boolean
```

### 6. step4.ts - 解析属性

**路径**: `src/tasks/taskParser/step4.ts`

**主要函数**:
```typescript
// 复选框状态
parseCheckboxStatus(status: string): CheckboxStatus
isIncomplete(status: string): boolean
isCompleted(status: string): boolean
isCancelled(status: string): boolean

// Tasks 格式解析
parseTasksPriority(content: string): PriorityLevel | undefined
parseTasksDates(content: string): ParsedDates
parseTasksAttributes(content: string): ParsedTaskAttributes

// Dataview 格式解析
parseDataviewPriority(content: string): PriorityLevel | undefined
parseDataviewDates(content: string): ParsedDates
parseDataviewAttributes(content: string): ParsedTaskAttributes

// 统一接口
parseTaskAttributes(content: string, format: TaskFormatType): ParsedTaskAttributes
parseDateField(content: string, field: DateFieldType, format: TaskFormatType): Date | undefined
```

### 7. utils.ts - 工具函数

**路径**: `src/tasks/taskParser/utils.ts`

**主要函数**:
```typescript
// 描述提取
extractTaskDescription(content: string): string
extractTasksDescription(content: string): string
extractDataviewDescription(content: string): string

// 字符串处理
escapeRegExp(string: string): string
normalizeSpaces(text: string): string
truncateText(text: string, maxLength: number): string

// 日期处理
isValidDateString(dateStr: string): boolean
formatDate(date: Date): string
parseDate(dateStr: string): Date | null

// 验证函数
hasAnyDate(dates: ParsedDates): boolean
hasValidPriority(priority?: string): boolean
```

### 8. main.ts - 主解析函数

**路径**: `src/tasks/taskParser/main.ts`

**主要函数**:
```typescript
parseTasksFromListItems(
    file: TFile,
    lines: string[],
    listItems: ListItemCache[],
    enabledFormats: TaskFormatType[],
    globalTaskFilter?: string
): GanttTask[]

parseTasksFromFile(
    file: TFile,
    fileContent: string,
    listItems: ListItemCache[],
    enabledFormats: TaskFormatType[],
    globalTaskFilter?: string
): GanttTask[]

parseSingleTaskLine(
    line: string,
    filePath?: string,
    fileName?: string,
    lineNumber?: number,
    enabledFormats?: TaskFormatType[],
    globalTaskFilter?: string
): GanttTask | null
```

## 格式支持

### Tasks 格式（Emoji）

**示例**:
```markdown
- [ ] 🎯 完成项目 ⏫ ➕ 2024-01-10 📅 2024-01-15
```

| 属性 | 符号 | 示例 |
|------|------|------|
| 最高优先级 | 🔺 | 🔺 |
| 高优先级 | ⏫ | ⏫ |
| 中优先级 | 🔼 | 🔼 |
| 低优先级 | 🔽 | 🔽 |
| 最低优先级 | ⏬ | ⏬ |
| 创建日期 | ➕ | ➕ 2024-01-10 |
| 开始日期 | 🛫 | 🛫 2024-01-10 |
| 计划日期 | ⏳ / ⌛ | ⏳ 2024-01-10 |
| 截止日期 | 📅 / 📆 / 🗓 | 📅 2024-01-15 |
| 取消日期 | ❌ | ❌ 2024-01-15 |
| 完成日期 | ✅ | ✅ 2024-01-15 |

### Dataview 格式（Field）

**示例**:
```markdown
- [ ] 🎯 完成项目 [priority:: high] [created:: 2024-01-10] [due:: 2024-01-15]
```

| 属性 | 字段 | 示例 |
|------|------|------|
| 优先级 | priority:: | [priority:: high] |
| 创建日期 | created:: | [created:: 2024-01-10] |
| 开始日期 | start:: | [start:: 2024-01-10] |
| 计划日期 | scheduled:: | [scheduled:: 2024-01-10] |
| 截止日期 | due:: | [due:: 2024-01-15] |
| 取消日期 | cancelled:: | [cancelled:: 2024-01-15] |
| 完成日期 | completion:: | [completion:: 2024-01-15] |

## 迁移指南

### 旧代码（已弃用）

```typescript
import { parseTasksFormat, parseDataviewFormat, extractTaskDescription } from './taskParser';

const task = { ... };
parseTasksFormat(content, task);
parseDataviewFormat(content, task);
const desc = extractTaskDescription(content);
```

### 新代码（推荐）

```typescript
import {
    parseTasksFromListItems,
    parseTaskLine,
    detectFormat,
    parseTasksPriority,
    extractTaskDescription
} from './taskParser';

// 完整解析流程
const tasks = parseTasksFromListItems(
    file,
    lines,
    listItems,
    ['tasks', 'dataview'],
    '🎯 '
);

// 单独使用各步骤
const match = parseTaskLine(line);
const format = detectFormat(content, ['tasks', 'dataview']);
const priority = parseTasksPriority(content);
const desc = extractTaskDescription(content);
```

## 向后兼容

原有的 `taskParser.ts` 文件保留为向后兼容层，所有旧函数继续可用：

- `parseTasksFormat()` - 标记 @deprecated
- `parseDataviewFormat()` - 标记 @deprecated
- `extractTaskDescription()` - 标记 @deprecated
- `escapeRegExp()` - 标记 @deprecated

## 扩展指南

### 添加新的正则表达式

1. 在 `RegularExpressions.ts` 中定义正则
2. 添加详细的 JSDoc 注释和使用示例
3. 在对应的步骤文件中使用

### 添加新的任务格式

1. 在 `taskSerializerSymbols.ts` 中定义格式配置
2. 实现 `TaskFormatConfig` 接口
3. 添加到 `FORMAT_CONFIGS` 注册表
4. 在 `step4.ts` 中添加解析函数

## 配置变更

### tsconfig.json

添加了 `exclude` 配置排除参考目录：

```json
{
  "exclude": [
    "node_modules",
    "ref",
    "**/*.test.ts"
  ]
}
```

## 测试验证

运行以下命令验证构建：

```bash
npm run build
```

构建成功后，将 `main.js`、`manifest.json`、`styles.css` 复制到 Obsidian 插件目录进行测试。

## 相关文档

- [Obsidian Tasks 插件文档](https://github.com/obsidian-tasks-group/obsidian-tasks)
- [Dataview 插件文档](https://blacksmithgu.github.io/obsidian-dataview/)
- `CLAUDE.md` - 项目总体架构说明
