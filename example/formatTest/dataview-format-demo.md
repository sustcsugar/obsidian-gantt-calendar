# Dataview 格式 (Field) 完整演示

本文档演示了 Dataview 插件格式的所有功能，使用字段语法来表示优先级、日期等信息。

## 基本格式

### 最简单的任务
```markdown
- [ ] 这是一个待办任务
- [x] 这是一个已完成任务
```

示例：
- [ ] 这是一个待办任务
- [x] 这是一个已完成任务

## 优先级

### 优先级字段对照表

| 字段值 | 优先级 | 说明 |
|--------|--------|------|
| `[priority:: highest]` | 最高 | 最紧急重要的任务 |
| `[priority:: high]` | 高 | 需要优先处理的任务 |
| `[priority:: medium]` | 中 | 普通优先级任务 |
| `[priority:: low]` | 低 | 可以延后处理的任务 |
| `[priority:: lowest]` | 最低 | 有空再做的任务 |

### 优先级示例

- [ ] 最高优先级任务 [priority:: highest]
- [ ] 高优先级任务 [priority:: high]
- [ ] 中等优先级任务 [priority:: medium]
- [ ] 低优先级任务 [priority:: low]
- [ ] 最低优先级任务 [priority:: lowest]

## 日期类型

### 日期字段对照表

| 字段名 | 日期类型 | 说明 |
|--------|----------|------|
| `[created:: ]` | 创建日期 | 任务创建的时间 |
| `[start:: ]` | 开始日期 | 任务开始执行的时间 |
| `[scheduled:: ]` | 计划日期 | 计划执行的时间 |
| `[due:: ]` | 到期日期 | 任务截止时间 |
| `[completion:: ]` | 完成日期 | 任务完成的时间 |
| `[cancelled:: ]` | 取消日期 | 任务被取消的时间 |

### 日期格式示例

- [ ] 带创建日期的任务 [created:: 2024-01-10]
- [ ] 带开始日期的任务 [start:: 2024-01-15]
- [ ] 带计划日期的任务 [scheduled:: 2024-01-20]
- [ ] 带到期日期的任务 [due:: 2024-01-25]
- [x] 带完成日期的任务 [completion:: 2024-01-10]
- [-] 带取消日期的任务 [cancelled:: 2024-01-15]

## 组合示例

### 完整任务示例
- [ ] 完整任务示例 [priority:: high] [created:: 2024-01-10] [start:: 2024-01-15] [scheduled:: 2024-01-18] [due:: 2024-01-20]

### 实际场景示例

#### 项目开发任务
- [ ] 需求调研 [priority:: highest] [created:: 2024-01-08] [due:: 2024-01-15]
- [ ] 系统设计 [priority:: high] [created:: 2024-01-10] [start:: 2024-01-15] [due:: 2024-01-25]
- [/] 前端开发 [priority:: medium] [created:: 2024-01-20] [start:: 2024-01-22] [due:: 2024-02-10]
- [ ] 后端开发 [priority:: high] [created:: 2024-01-20] [start:: 2024-01-22] [due:: 2024-02-10]
- [ ] 测试验证 [priority:: medium] [created:: 2024-02-05] [due:: 2024-02-20]
- [ ] 部署上线 [priority:: highest] [created:: 2024-02-20] [due:: 2024-02-28]

#### 学习计划任务
- [ ] 阅读 Rust 官方文档 [priority:: medium] [created:: 2024-01-01] [due:: 2024-02-29]
- [ ] 完成算法练习 [priority:: medium] [created:: 2024-01-10] [due:: 2024-03-31]
- [x] 学习 Go 语言基础 [completion:: 2024-01-05]
- [/] React 源码研读 [priority:: high] [created:: 2024-01-15] [start:: 2024-01-18] [due:: 2024-02-15]

#### 生活任务
- [ ] 购买日用品 [priority:: low] [created:: 2024-01-10] [due:: 2024-01-15]
- [x] 健身房锻炼 [completion:: 2024-01-08]
- [ ] 预约牙医检查 [priority:: medium] [due:: 2024-01-20]
- [ ] 整理房间 [priority:: low] [due:: 2024-01-25]

## 任务状态

### 状态符号对照表

| 符号 | 状态 | 说明 |
|------|------|------|
| `[ ]` | 待办 (todo) | 未开始的普通任务 |
| `[x]` | 已完成 (done) | 已完成的任务 |
| `[!]` | 重要 (important) | 重要任务 |
| `[-]` | 已取消 (canceled) | 已取消的任务 |
| `[/]` | 进行中 (in_progress) | 正在进行的任务 |
| `[?]` | 有疑问 (question) | 有疑问需要确认的任务 |
| `[n]` | 已开始 (start) | 已开始但未标记为进行中 |

### 状态示例

- [ ] 待办任务
- [x] 已完成任务
- [!] 重要任务
- [-] 已取消任务
- [/] 进行中任务
- [?] 有疑问任务
- [n] 已开始任务

## 自定义字段

### 带标签的任务（使用 tags 字段）
- [ ] 工作 [priority:: high] [created:: 2024-01-10] [due:: 2024-01-15] [tags:: work]
- [ ] 个人 [priority:: low] [created:: 2024-01-10] [due:: 2024-01-20] [tags:: personal]
- [ ] 学习 [priority:: high] [created:: 2024-01-08] [due:: 2024-01-31] [tags:: learning, programming]
- [ ] 健康 [priority:: medium] [due:: 2024-01-25] [tags:: health]

### 带分类的任务
- [ ] 任务A [priority:: high] [category:: 工作] [due:: 2024-01-15]
- [ ] 任务B [priority:: medium] [category:: 学习] [due:: 2024-01-20]
- [ ] 任务C [priority:: low] [category:: 生活] [due:: 2024-01-25]

### 带进度的任务
- [ ] 任务A [progress:: 0%] [due:: 2024-01-15]
- [/] 任务B [progress:: 50%] [due:: 2024-01-20]
- [ ] 任务C [progress:: 75%] [due:: 2024-01-25]

## 带链接的任务

- [ ] 完成 [[项目文档]] 的编写 [priority:: medium] [created:: 2024-01-10] [due:: 2024-01-15]
- [ ] 查看 [[任务管理|任务管理笔记]] [priority:: high] [created:: 2024-01-10] [due:: 2024-01-20]
- [ ] 学习 [Rust 官方教程](https://www.rust-lang.org/learn) [priority:: medium] [created:: 2024-01-05] [due:: 2024-02-29]

## 混合元素任务

- [ ] 复杂任务示例 [priority:: highest] [created:: 2024-01-08] [start:: 2024-01-10] [scheduled:: 2024-01-15] [due:: 2024-01-20] [tags:: work, important] [project:: 项目A]
- [ ] 带链接和标签的任务 [priority:: high] [created:: 2024-01-10] [due:: 2024-01-25] [tags:: learning] [ref:: [[技术文档]]]
- [/] 多个日期的任务 [priority:: medium] [created:: 2024-01-05] [start:: 2024-01-10] [scheduled:: 2024-01-12] [due:: 2024-01-20] [tags:: project]

## 字段位置灵活

Dataview 格式的字段可以放在任务行的任何位置：

### 字段在前面
- [priority:: high] [created:: 2024-01-10] [due:: 2024-01-15] - [ ] 这是一个任务

### 字段在后面
- [ ] 这是一个任务 [priority:: high] [created:: 2024-01-10] [due:: 2024-01-15]

### 字段分散在中间
- [ ] 这是 [priority:: high] 一个任务 [created:: 2024-01-10] [due:: 2024-01-15]

## 大小写不敏感

Dataview 格式的字段名和值不区分大小写：

- [ ] 任务 [priority:: HIGH] [created:: 2024-01-10]
- [ ] 任务 [Priority:: high] [Created:: 2024-01-10]
- [ ] 任务 [PRIORITY:: High] [CREATED:: 2024-01-10]

## 格式要点总结

1. **任务必须以 `- ` 开头**，后跟复选框 `[ ]` 或其他状态符号
2. **字段格式** 为 `[字段名:: 值]`
3. **字段位置** 灵活，可以在任务行的任何位置
4. **日期格式** 必须是 `yyyy-MM-dd`
5. **优先级字段** 使用 `priority`，可选值：highest, high, medium, low, lowest
6. **日期字段** 包括：created, start, scheduled, due, completion, cancelled
7. **自定义字段** 可以添加任意自定义字段，如 tags, category, progress 等
8. **大小写不敏感** 字段名和值都不区分大小写
