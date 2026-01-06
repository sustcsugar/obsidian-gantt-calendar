# 任务字段顺序保留问题 - 深度调试计划

## 1. 问题陈述

### 1.1 现象描述
当用户通过右键菜单编辑任务时，修改某个日期字段后，任务原始文本中的字段顺序会被改变：

**示例任务**:
```markdown
- [ ] 🎯 测试任务 ➕ 2025-01-10 🛫 2025-01-15 📅 2025-01-20
```

**编辑开始时间后变成**:
```markdown
- [ ] 🎯 测试任务 ➕ 2025-01-10 📅 2025-01-20 🛫 2025-01-16
```

**字段顺序变化**:
- 原始: 创建时间 ➔ 开始时间 ➔ 截止时间
- 修改后: 创建时间 ➔ 截止时间 ➔ 开始时间

### 1.2 附加问题
- 原始开始时间周围的空格被保留
- 新的开始时间被追加到截止时间后面，并添加了额外的空格

## 2. 代码流程分析

### 2.1 完整调用链

```
用户右键任务
  ↓
contextMenuIndex.ts: 打开上下文菜单
  ↓
editTask.ts: openEditTaskModal()
  ↓
EditTaskModal: 用户编辑并保存
  ↓
updateTaskProperties(task, updates, enabledFormats)
  ↓
readTaskLine(app, task) - 读取原始文件内容
  ↓
modifyDateInLine(taskLine, dateFieldName, newDate, format) - ⚠️ 问题函数
  ↓
app.vault.modify(file, newContent) - 写回文件
```

### 2.2 问题函数详细分析

**文件**: `src/tasks/taskUpdater.ts`
**函数**: `modifyDateInLine()` (第 25-78 行)

#### 当前实现 (Tasks 格式)

```typescript
function modifyDateInLine(
    taskLine: string,
    dateFieldName: string,
    newDate: Date | null,
    format: 'dataview' | 'tasks'
): string {
    // ... 映射定义 ...

    if (format === 'dataview') {
        // ... dataview 处理 ...
    } else {
        // Tasks 格式处理
        const emoji = emojiMap[dateFieldName];
        if (!emoji) return taskLine;

        // ⚠️ 第 67-68 行: 移除旧值
        const re = new RegExp(`${emoji}\\s*\\d{4}-\\d{2}-\\d{2}`, 'g');
        taskLine = taskLine.replace(re, '');

        // ⚠️ 第 71-73 行: 追加新值到行尾
        if (newDate !== null) {
            const dateStr = formatDate(newDate, 'YYYY-MM-DD');
            taskLine = taskLine.trimEnd() + ` ${emoji} ${dateStr}`;
        }
    }

    return taskLine;
}
```

#### 问题分解

**步骤 1**: 正则匹配并删除旧字段
```typescript
const re = new RegExp(`${emoji}\\s*\\d{4}-\\d{2}-\\d{2}`, 'g');
taskLine = taskLine.replace(re, '');
```

**示例执行**:
```typescript
// 输入
taskLine = "- [ ] 🎯 测试任务 ➕ 2025-01-10 🛫 2025-01-15 📅 2025-01-20"
emoji = "🛫"

// 正则表达式
/🛫\s*\d{4}-\d{2}-\d{2}/g

// 执行 replace 后
taskLine = "- [ ] 🎯 测试任务 ➕ 2025-01-10  📅 2025-01-20"
//                                            ^ 注意这里有两个空格
```

**步骤 2**: 追加新字段到行尾
```typescript
taskLine = taskLine.trimEnd() + ` ${emoji} ${dateStr}`;
```

**示例执行**:
```typescript
// 输入
taskLine = "- [ ] 🎯 测试任务 ➕ 2025-01-10  📅 2025-01-20"
// trimEnd() 移除尾部空格
taskLine = "- [ ] 🎯 测试任务 ➕ 2025-01-10  📅 2025-01-20"
// 追加新字段
taskLine = "- [ ] 🎯 测试任务 ➕ 2025-01-10  📅 2025-01-20 🛫 2025-01-16"
```

### 2.3 根本原因

**设计缺陷**: 函数采用了"删除-追加"策略，而非"原地替换"策略

**具体问题**:
1. `replace(re, '')` 从原位置删除字段，留下空隙（可能有残留空格）
2. `trimEnd() + ...` 将新字段追加到行尾
3. 结果：字段被从原位置移除并追加到末尾

**同样的问题也出现在**:
- Dataview 格式处理 (第 48-60 行)
- `updateTaskCompletion()` 中的完成日期处理 (第 152-159 行)

## 3. 深度调试方案

### 3.1 添加详细日志

在 `modifyDateInLine()` 函数中添加结构化日志：

```typescript
function modifyDateInLine(
    taskLine: string,
    dateFieldName: string,
    newDate: Date | null,
    format: 'dataview' | 'tasks'
): string {
    // 🐛 调试日志: 输入参数
    console.group(`[TaskUpdater] modifyDateInLine - ${dateFieldName}`);
    console.log('Input taskLine:', JSON.stringify(taskLine));
    console.log('Format:', format);
    console.log('New date:', newDate?.toISOString() || 'null');

    const originalLine = taskLine; // 保存原始值用于对比

    // ... 原有逻辑 ...

    // 🐛 调试日志: 中间状态
    if (format === 'tasks') {
        const emoji = emojiMap[dateFieldName];
        if (emoji) {
            const re = new RegExp(`${emoji}\\s*\\d{4}-\\d{2}-\\d{2}`, 'g');
            const afterRemove = taskLine.replace(re, '');
            console.log('After remove:', JSON.stringify(afterRemove));
            console.log('Removed pattern:', re.source);
            console.log('Matched:', taskLine.match(re));

            if (newDate !== null) {
                const finalLine = afterRemove.trimEnd() + ` ${emoji} ${formatDate(newDate, 'YYYY-MM-DD')}`;
                console.log('Final result:', JSON.stringify(finalLine));
            }
        }
    }

    // 🐛 调试日志: 对比
    console.log('Original:', JSON.stringify(originalLine));
    console.log('Modified:', JSON.stringify(taskLine));
    console.log('Fields changed:', originalLine !== taskLine);
    console.groupEnd();

    return taskLine;
}
```

### 3.2 字段位置追踪

添加函数来追踪字段位置变化：

```typescript
/**
 * 调试工具: 分析任务行中各字段的位置
 */
function debugTaskFieldPositions(taskLine: string): Record<string, { start: number; end: number; text: string }> {
    const fields: Record<string, { start: number; end: number; text: string }> = {};

    const emojiPatterns = {
        createdDate: '➕',
        startDate: '🛫',
        scheduledDate: '⏳',
        dueDate: '📅',
        completionDate: '✅',
        cancelledDate: '❌',
    };

    for (const [fieldName, emoji] of Object.entries(emojiPatterns)) {
        const regex = new RegExp(`${emoji}\\s*\\d{4}-\\d{2}-\\d{2}`, 'g');
        const match = regex.exec(taskLine);
        if (match) {
            fields[fieldName] = {
                start: match.index,
                end: match.index + match[0].length,
                text: match[0]
            };
        }
    }

    return fields;
}

// 在 modifyDateInLine 中使用
console.log('Field positions before:', debugTaskFieldPositions(taskLine));
// ... 修改 ...
console.log('Field positions after:', debugTaskFieldPositions(taskLine));
```

### 3.3 测试用例集

创建测试用例文件 `spec/task-field-order-test-cases.md`:

```markdown
# 任务字段顺序测试用例

## 测试用例 1: 基础字段顺序
**输入**:
```markdown
- [ ] Task 1 ➕ 2025-01-10 🛫 2025-01-15 📅 2025-01-20
```

**操作**: 修改 startDate (🛫) 为 2025-01-16

**预期输出**:
```markdown
- [ ] Task 1 ➕ 2025-01-10 🛫 2025-01-16 📅 2025-01-20
```

**当前错误输出**:
```markdown
- [ ] Task 1 ➕ 2025-01-10 📅 2025-01-20 🛫 2025-01-16
```

---

## 测试用例 2: 不同空格格式
**输入**:
```markdown
- [ ] Task 2 ➕2025-01-10 🛫  2025-01-15📅2025-01-20
```

**操作**: 修改 dueDate (📅) 为 2025-01-21

**预期输出**:
```markdown
- [ ] Task 2 ➕2025-01-10 🛫  2025-01-15📅2025-01-21
```

---

## 测试用例 3: Dataview 格式
**输入**:
```markdown
- [ ] Task 3 [created:: 2025-01-10] [start:: 2025-01-15] [due:: 2025-01-20]
```

**操作**: 修改 start 为 2025-01-16

**预期输出**:
```markdown
- [ ] Task 3 [created:: 2025-01-10] [start:: 2025-01-16] [due:: 2025-01-20]
```

---

## 测试用例 4: 清除日期字段
**输入**:
```markdown
- [ ] Task 4 ➕ 2025-01-10 🛫 2025-01-15 📅 2025-01-20
```

**操作**: 清除 startDate (设为 null)

**预期输出**:
```markdown
- [ ] Task 4 ➕ 2025-01-10 📅 2025-01-20
```

**检查点**: 不应留下多余空格

---

## 测试用例 5: 单字段任务
**输入**:
```markdown
- [ ] Task 5 📅 2025-01-20
```

**操作**: 修改 dueDate 为 2025-01-21

**预期输出**:
```markdown
- [ ] Task 5 📅 2025-01-21
```

---

## 测试用例 6: 包含优先级
**输入**:
```markdown
- [ ] ⏫ Task 6 ➕ 2025-01-10 🛫 2025-01-15
```

**操作**: 修改 startDate 为 2025-01-16

**预期输出**:
```markdown
- [ ] ⏫ Task 6 ➕ 2025-01-10 🛫 2025-01-16
```

**检查点**: 优先级位置不受影响

---

## 测试用例 7: 包含 Wiki 链接
**输入**:
```markdown
- [ ] [[Note]] Task 7 ➕ 2025-01-10 🛫 2025-01-15
```

**操作**: 修改 startDate 为 2025-01-16

**预期输出**:
```markdown
- [ ] [[Note]] Task 7 ➕ 2025-01-10 🛫 2025-01-16
```
```

### 3.4 自动化测试脚本

创建测试脚本 `spec/debug-test-script.js`:

```javascript
// 在 Obsidian 开发者控制台中运行

const testCases = [
    {
        name: 'Basic field order',
        input: '- [ ] Task 1 ➕ 2025-01-10 🛫 2025-01-15 📅 2025-01-20',
        field: 'startDate',
        newValue: new Date('2025-01-16'),
        expected: '- [ ] Task 1 ➕ 2025-01-10 🛫 2025-01-16 📅 2025-01-20'
    },
    // ... 更多测试用例
];

async function runTests() {
    console.group('Task Field Order Tests');
    const { modifyDateInLine } = app.plugins.plugins['obsidian-gantt-calendar']);

    for (const testCase of testCases) {
        console.group(`Test: ${testCase.name}`);
        console.log('Input:', testCase.input);

        const result = modifyDateInLine(
            testCase.input,
            testCase.field,
            testCase.newValue,
            'tasks'
        );

        console.log('Expected:', testCase.expected);
        console.log('Actual:', result);
        console.log('Pass:', result === testCase.expected ? '✅' : '❌');

        if (result !== testCase.expected) {
            console.warn('Field order changed!');
        }
        console.groupEnd();
    }

    console.groupEnd();
}

// 运行测试
runTests();
```

## 4. 修复方案详细设计

### 4.1 核心策略：原地替换

**关键思想**: 不删除整个字段，而是使用正则捕获组保留字段结构，只替换日期值。

### 4.2 Tasks 格式修复

#### 4.2.1 修改日期值（保留字段）

```typescript
if (newDate !== null) {
    // 原地替换：保留 emoji 和空格，只替换日期值
    const dateStr = formatDate(newDate, 'YYYY-MM-DD');
    const re = new RegExp(`(${emoji}\\s*)\\d{4}-\\d{2}-\\d{2}`, 'g');

    // 捕获组 $1: emoji + 原有空格
    // 替换: $1 + 新日期
    taskLine = taskLine.replace(re, `$1${dateStr}`);
}
```

**执行示例**:
```typescript
// 输入
taskLine = "- [ ] Task ➕ 2025-01-10 🛫 2025-01-15 📅 2025-01-20"
emoji = "🛫"

// 正则: /(🛫\s*)\d{4}-\d{2}-\d{2}/g
// 匹配: "🛫 2025-01-15"
// 捕获组 $1: "🛫 "

// 替换后
taskLine = "- [ ] Task ➕ 2025-01-10 🛫 2025-01-16 📅 2025-01-20"
//                                  ^^^^^^^^^^^^^^
//                                  原位置替换
```

#### 4.2.2 清除日期值（移除字段）

```typescript
else {
    // 清除：移除 emoji + 空格 + 日期，并清理前面可能的多余空格
    const re = new RegExp(`\\s*${emoji}\\s*\\d{4}-\\d{2}-\\d{2}`, 'g');

    // \s* 前缀: 清理前面的空格
    taskLine = taskLine.replace(re, '');

    // 清理可能残留的多个空格
    taskLine = taskLine.replace(/\s{2,}/g, ' ').trim();
}
```

**执行示例**:
```typescript
// 输入
taskLine = "- [ ] Task ➕ 2025-01-10 🛫 2025-01-15 📅 2025-01-20"
emoji = "🛫"

// 正则: /\s*🛫\s*\d{4}-\d{2}-\d{2}/g
// 匹配: " 🛫 2025-01-15" (包含前面的空格)

// 替换后
taskLine = "- [ ] Task ➕ 2025-01-10 📅 2025-01-20"
//                                ^ 没有多余空格
```

### 4.3 Dataview 格式修复

#### 4.3.1 修改日期值（保留字段）

```typescript
if (newDate !== null) {
    // 原地替换：保留字段结构，只替换日期值
    const dateStr = formatDate(newDate, 'YYYY-MM-DD');
    const re = new RegExp(`(\\[${fieldKey}::\\s*)\\d{4}-\\d{2}-\\d{2}(\\s*\\])`, 'g');

    // 捕获组 $1: [field::
    // 捕获组 $2:  ]
    // 替换: $1 + 新日期 + $2
    taskLine = taskLine.replace(re, `$1${dateStr}$2`);
}
```

**执行示例**:
```typescript
// 输入
taskLine = "- [ ] Task [created:: 2025-01-10] [start:: 2025-01-15] [due:: 2025-01-20]"
fieldKey = "start"

// 正则: /(\[start::\s*)\d{4}-\d{2}-\d{2}(\s*\])/g
// 匹配: "[start:: 2025-01-15]"
// 捕获组 $1: "[start:: "
// 捕获组 $2: "]"

// 替换后
taskLine = "- [ ] Task [created:: 2025-01-10] [start:: 2025-01-16] [due:: 2025-01-20]"
//                                                ^^^^^^^^^^^^^^^^^^^^
//                                                原位置替换
```

#### 4.3.2 清除日期值（移除字段）

```typescript
else {
    // 清除：移除整个字段，包括前面的空格
    const re = new RegExp(`\\s*\\[${fieldKey}::\\s*[^\\]]+\\]`, 'g');

    // \s* 前缀: 清理前面的空格
    taskLine = taskLine.replace(re, '');

    // 清理可能残留的多个空格
    taskLine = taskLine.replace(/\s{2,}/g, ' ').trim();
}
```

### 4.4 完整修复代码

```typescript
function modifyDateInLine(
    taskLine: string,
    dateFieldName: string,
    newDate: Date | null,
    format: 'dataview' | 'tasks'
): string {
    const fieldMap: Record<string, string> = {
        dueDate: 'due',
        startDate: 'start',
        scheduledDate: 'scheduled',
        createdDate: 'created',
        cancelledDate: 'cancelled',
        completionDate: 'completion',
    };
    const emojiMap: Record<string, string> = {
        dueDate: '📅',
        startDate: '🛫',
        scheduledDate: '⏳',
        createdDate: '➕',
        cancelledDate: '❌',
        completionDate: '✅',
    };

    if (format === 'dataview') {
        const fieldKey = fieldMap[dateFieldName];
        if (!fieldKey) return taskLine;

        if (newDate !== null) {
            // ✅ 修复：原地替换日期值，保持字段位置
            const dateStr = formatDate(newDate, 'YYYY-MM-DD');
            const re = new RegExp(`(\\[${fieldKey}::\\s*)\\d{4}-\\d{2}-\\d{2}(\\s*\\])`, 'g');
            taskLine = taskLine.replace(re, `$1${dateStr}$2`);
        } else {
            // ✅ 修复：移除字段时清理前面的空格
            const re = new RegExp(`\\s*\\[${fieldKey}::\\s*[^\\]]+\\]`, 'g');
            taskLine = taskLine.replace(re, '');
            // 清理多余空格
            taskLine = taskLine.replace(/\s{2,}/g, ' ').trim();
        }
    } else {
        // Tasks 格式
        const emoji = emojiMap[dateFieldName];
        if (!emoji) return taskLine;

        if (newDate !== null) {
            // ✅ 修复：原地替换日期值，保持字段位置
            const dateStr = formatDate(newDate, 'YYYY-MM-DD');
            const re = new RegExp(`(${emoji}\\s*)\\d{4}-\\d{2}-\\d{2}`, 'g');
            taskLine = taskLine.replace(re, `$1${dateStr}`);
        } else {
            // ✅ 修复：移除字段时清理前面的空格
            const re = new RegExp(`\\s*${emoji}\\s*\\d{4}-\\d{2}-\\d{2}`, 'g');
            taskLine = taskLine.replace(re, '');
            // 清理多余空格
            taskLine = taskLine.replace(/\s{2,}/g, ' ').trim();
        }
    }

    return taskLine;
}
```

## 5. 验证测试计划

### 5.1 单元测试（手动）

使用 Obsidian 开发者控制台测试：

```javascript
// 在控制台中运行
const { modifyDateInLine } = app.plugins.plugins['obsidian-gantt-calendar'];

// 测试用例 1: Tasks 格式 - 修改开始时间
let result = modifyDateInLine(
    '- [ ] Task ➕ 2025-01-10 🛫 2025-01-15 📅 2025-01-20',
    'startDate',
    new Date('2025-01-16'),
    'tasks'
);
console.log('Test 1:', result === '- [ ] Task ➕ 2025-01-10 🛫 2025-01-16 📅 2025-01-20');
console.log('Result:', result);

// 测试用例 2: Tasks 格式 - 清除日期
result = modifyDateInLine(
    '- [ ] Task ➕ 2025-01-10 🛫 2025-01-15 📅 2025-01-20',
    'startDate',
    null,
    'tasks'
);
console.log('Test 2:', result === '- [ ] Task ➕ 2025-01-10 📅 2025-01-20');
console.log('Result:', result);

// 测试用例 3: Dataview 格式 - 修改日期
result = modifyDateInLine(
    '- [ ] Task [created:: 2025-01-10] [start:: 2025-01-15] [due:: 2025-01-20]',
    'startDate',
    new Date('2025-01-16'),
    'dataview'
);
console.log('Test 3:', result === '- [ ] Task [created:: 2025-01-10] [start:: 2025-01-16] [due:: 2025-01-20]');
console.log('Result:', result);
```

### 5.2 集成测试（Obsidian UI）

1. **构建项目**:
   ```bash
   npm run build
   ```

2. **部署到 Obsidian**:
   - 复制 `main.js`, `manifest.json`, `styles.css` 到插件目录
   - 重新加载 Obsidian

3. **创建测试文件**:
   ```markdown
   ---
   title: 任务测试
   ---

   ## 测试任务

   - [ ] 任务1 ➕ 2025-01-10 🛫 2025-01-15 📅 2025-01-20
   - [ ] 任务2 [created:: 2025-01-10] [start:: 2025-01-15] [due:: 2025-01-20]
   - [ ] 任务3 ⏫ 任务3 ➕ 2025-01-10 🛫 2025-01-15
   ```

4. **测试步骤**:
   - 在日历视图中找到测试任务
   - 右键点击任务
   - 选择"编辑任务"
   - 修改开始时间为 2025-01-16
   - 保存
   - 打开原始 markdown 文件查看字段顺序

5. **验证点**:
   - ✅ 字段顺序保持不变
   - ✅ 没有多余空格
   - ✅ 只修改了指定字段
   - ✅ 其他字段位置不变

### 5.3 边界情况测试

| 测试场景 | 输入 | 操作 | 预期结果 |
|---------|------|------|---------|
| 空格不一致 | `➕2025-01-10 🛫  2025-01-15` | 修改🛫 | `➕2025-01-10 🛫  2025-01-16` (保留原空格) |
| 无空格 | `➕2025-01-10🛫2025-01-15` | 修改🛫 | `➕2025-01-10🛫2025-01-16` (保留紧凑格式) |
| 多个空格 | `➕  2025-01-10  🛫  2025-01-15` | 修改🛫 | `➕  2025-01-10  🛫  2025-01-16` (保留多空格) |
| 清除中间字段 | `➕2025-01-10 🛫2025-01-15 📅2025-01-20` | 清除🛫 | `➕2025-01-10 📅2025-01-20` (无多余空格) |
| 清除首字段 | `➕2025-01-10 🛫2025-01-15` | 清除➕ | `- [ ] Task 🛫2025-01-15` (无多余空格) |
| 清除尾字段 | `🛫2025-01-15 📅2025-01-20` | 清除📅 | `🛫2025-01-15` (无多余空格) |
| 优先级+日期 | `⏫Task 📅2025-01-20` | 修改📅 | `⏫Task 📅2025-01-21` (优先级不变) |
| Wiki链接+日期 | `[[Note]]Task 📅2025-01-20` | 修改📅 | `[[Note]]Task 📅2025-01-21` (链接不变) |

## 6. 实施步骤

### Phase 1: 添加调试日志（可选）
- [ ] 在 `modifyDateInLine()` 添加详细日志
- [ ] 添加 `debugTaskFieldPositions()` 辅助函数
- [ ] 构建并测试，确认日志输出

### Phase 2: 应用修复
- [ ] 备份当前 `taskUpdater.ts`
- [ ] 应用修复代码到 `modifyDateInLine()`
- [ ] 构建项目

### Phase 3: 测试验证
- [ ] 运行控制台单元测试
- [ ] 执行集成测试（Obsidian UI）
- [ ] 测试所有边界情况
- [ ] 验证现有功能未受影响

### Phase 4: 清理
- [ ] 移除调试日志
- [ ] 重新构建
- [ ] 最终验证

### Phase 5: 文档更新
- [ ] 更新 CHANGELOG
- [ ] 记录修复的问题

## 7. 回滚计划

如果修复引入新问题：

```bash
# 回滚到修复前
git checkout src/tasks/taskUpdater.ts
npm run build
```

或者使用备份：
```bash
cp taskUpdater.ts.backup taskUpdater.ts
npm run build
```

## 8. 相关函数检查清单

需要同样修复的其他函数：

- [ ] `updateTaskCompletion()` (第 152-159 行) - 完成日期处理
- [ ] 检查其他可能使用"删除-追加"模式的地方

## 9. 预期效果

修复后的行为：

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| 修改开始时间 | 字段移到末尾 | 字段保持在原位置 |
| 修改截止时间 | 字段移到末尾 | 字段保持在原位置 |
| 清除日期字段 | 留下多余空格 | 清理多余空格 |
| 空格格式 | 可能改变 | 保留原格式 |
| 字段顺序 | 被改变 | 保持不变 |

## 10. 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 正则表达式匹配错误 | 字段未被修改 | 充分测试各种格式 |
| 捕获组索引错误 | 字段被删除 | 代码审查 + 测试 |
| 空格处理不当 | 格式变化 | 边界测试 |
| 性能影响 | 编辑变慢 | 正则优化，通常影响很小 |

## 11. 后续改进建议

1. **添加单元测试框架** (Jest)
2. **添加字段顺序验证测试**
3. **重构为字段抽象层**，统一处理 Tasks 和 Dataview 格式
4. **添加格式化选项**，让用户选择是否自动格式化字段顺序

---

**文档版本**: 1.0
**创建日期**: 2025-12-25
**作者**: Claude Code
**状态**: 待实施
