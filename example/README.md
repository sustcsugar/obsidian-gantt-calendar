# Obsidian 甘特图日历插件 - 示例库

这是一个完整的 Obsidian 示例库，用于演示 **obsidian-gantt-calendar** 插件的所有功能。

## 📁 目录结构

```
example/
├── .obsidian/               # Obsidian 配置文件夹
│   └── plugins/
│       └── obsidian-gantt-calendar/
│           └── data.json    # 插件配置
├── dailynote/               # 每日笔记示例
│   ├── 2024-01-08.md
│   ├── 2024-01-09.md
│   ├── 2024-01-10.md
│   ├── 2024-01-11.md
│   ├── 2024-01-12.md
│   ├── 2024-01-13.md
│   └── 2024-01-14.md
├── tasks/                   # 分类任务文件
│   ├── 项目规划.md
│   ├── 学习计划.md
│   ├── 生活杂务.md
│   ├── 阅读清单.md
│   └── 健康计划.md
├── formatTest/              # 任务格式演示
│   ├── tasks-format-demo.md       # Tasks (Emoji) 格式
│   ├── dataview-format-demo.md    # Dataview (Field) 格式
│   └── mixed-format-demo.md       # 混合格式
├── taskviewTest/            # 任务视图功能演示
│   ├── 状态过滤演示.md
│   ├── 优先级演示.md
│   ├── 日期范围演示.md
│   └── 搜索功能演示.md
├── calendarviewTest/        # 日历视图功能演示
│   ├── 年视图功能.md
│   ├── 月视图功能.md
│   ├── 周视图功能.md
│   └── 日视图功能.md
└── ganttTest/               # 甘特图功能演示
    ├── 甘特图基础功能.md
    ├── 甘特图项目管理.md
    └── 甘特图里程碑.md
```

## 🚀 快速开始

### 1. 安装插件

1. 将插件文件复制到 Obsidian 插件目录：
   ```
   <Vault>/.obsidian/plugins/obsidian-gantt-calendar/
   ```

2. 在 Obsidian 中启用插件

### 2. 打开示例库

1. 在 Obsidian 中打开此 `example` 文件夹作为仓库
2. 插件会自动识别配置并加载示例任务

### 3. 浏览演示

打开不同文件夹下的文件，查看各类功能演示：

- **formatTest** - 了解两种任务格式的语法
- **taskviewTest** - 学习任务视图的筛选和搜索
- **calendarviewTest** - 探索日历视图的功能
- **ganttTest** - 查看甘特图的项目管理能力

## 📝 任务格式说明

### Tasks 格式 (Emoji)

```markdown
- [ ] 任务标题 ⏫ ➕ 2024-01-10 📅 2024-01-15
```

**优先级 Emoji**：🔺(最高) ⏫(高) 🔼(中) 🔽(低) ⏬(最低)
**日期 Emoji**：➕(创建) 🛫(开始) ⏳(计划) 📅(到期) ✅(完成) ❌(取消)

### Dataview 格式 (Field)

```markdown
- [ ] 任务标题 [priority:: high] [created:: 2024-01-10] [due:: 2024-01-15]
```

**优先级值**：highest, high, medium, low, lowest
**日期字段**：created, start, scheduled, due, completion, cancelled

## 🎯 功能概览

### 视图系统

| 视图 | 说明 |
|------|------|
| 年视图 | 全年任务概览，适合长期规划 |
| 月视图 | 单月详细视图，日常任务管理 |
| 周视图 | 周度规划，精确的时间安排 |
| 日视图 | 单日详细视图，精确到小时 |
| 任务视图 | 列表视图，支持多维度筛选 |
| 甘特图 | 项目时间线，依赖关系可视化 |

### 任务管理

- ✅ 支持 7 种任务状态（待办、已完成、进行中等）
- ✅ 支持 5 种优先级级别
- ✅ 支持 6 种日期类型
- ✅ 兼容 Tasks 插件和 Dataview 插件格式
- ✅ 支持标签、链接等丰富内容

## 📊 示例数据说明

### 时间范围

示例任务主要集中在 **2024年1月8日 - 2024年3月31日** 期间。

### 任务数量

- 总计约 **300+** 个示例任务
- 涵盖工作、学习、生活等多个场景
- 包含各种状态、优先级和日期组合

## 💡 使用建议

1. **从格式演示开始** - 先了解任务格式的语法
2. **在 dailynote 中实践** - 尝试创建自己的每日笔记
3. **使用视图筛选** - 学习如何筛选和查找任务
4. **探索甘特图** - 体验项目管理的可视化

## 🔧 自定义配置

插件配置位于 `.obsidian/plugins/obsidian-gantt-calendar/data.json`：

```json
{
  "defaultView": "month",
  "taskFormat": "tasks",
  "dateFormat": "yyyy-MM-dd",
  "showWeekNumbers": true,
  "startOfWeek": 1
}
```

可以根据需要修改配置。

## 📚 更多资源

- 插件源码：[GitHub 仓库]
- 问题反馈：[Issues]
- 功能建议：[Discussions]
