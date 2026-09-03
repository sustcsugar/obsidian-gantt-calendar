# 标签系统审查报告

**日期**: 2026-08-28
**范围**: 标签解析、颜色分配、多级标签、6 个场景的标签渲染一致性

---

## 一、标签解析机制

| 特性 | 实现 | 状态 |
|------|------|------|
| 提取正则 | `/#([a-zA-Z\u4e00-\u9fa5][a-zA-Z0-9_/\u4e00-\u9fa5]*)/g` | ✅ |
| 多级标签 `#project/sub` | 解析为 `"project/sub"` 整串（`/` 在字符集中） | ✅ 不拆分 |
| 中文标签 | 支持基本区 `\u4e00-\u9fa5` | ✅ |
| `#123` 数字开头 | ❌ 不识别（首字符不允许数字） | ⚠️ 与 Obsidian 原生不一致 |
| `#tag-with-hyphen` | ❌ 截断为 `tag`（字符集不含 `-`） | ⚠️ 与 Obsidian 原生不一致 |
| 层级树 | `TagHierarchyBuilder` 拆 `project/sub` 为两级，自动创建中间节点 | ✅ |

## 二、颜色分配机制

- **算法**: 32 位 hash → `Math.abs(hash) % 6` → color-0~5
- **色板**: blue / green / orange / yellow / purple / pink（tokens.css CSS 变量）
- **多级标签**: `"project/sub"` 整串 hash，与 `"project"` 独立且稳定
- **缺陷**: `colorIndex` 无 clamp，传入 ≥6 时静默退化为灰底

## 三、6 个场景标签渲染一致性

| 场景 | 组件 | 颜色 | 胶囊外观 | 一致性 |
|------|------|------|---------|--------|
| 任务卡片 | `TagPillSpan` | ✅ hash 取色 | ✅ 彩色圆角胶囊 | ✅ |
| 悬浮提示（React） | `TagPillSpan` | ✅ | ✅ | ✅ |
| 悬浮提示（甘特图命令式） | `TagPill.createMultiple` | ✅ | ✅ | ✅ |
| 创建/编辑面板选择器 | `SelectableTagPill`（自实现） | ✅ | ✅ + 可点选态/× 后缀 | ⚠️ 三实现并存 |
| 侧边栏标签筛选树 | 自渲染行 | ❌ **无颜色** | ❌ 纯文本 + 计数 + 缩进 | ❌ |
| 工具栏标签筛选菜单 | DropdownMenu 项 | ❌ **无颜色** | ❌ 纯文本 `#tag` | ❌ |

## 四、不一致问题清单

### 严重
1. **筛选器/菜单无颜色胶囊**（TaskListPanel.tsx:311、Toolbar.tsx:177）——同一标签在卡片是彩色胶囊、筛选菜单是纯文本
2. **tooltip CSS 整段重复**：tooltip.css:1-95 与 week-view.css:1-95 全量重复，且优先级颜色 fallback 值不同步

### 中等
3. **TagPillSpan 能力缺失**：不支持 selectable/selected/suffix，迫使 TagSelector 重写几乎相同的组件
4. **全局 tooltip 样式错放在 week-view.css**（含唯一的 `__tags` 容器规则）
5. **标签容器间距不一致**：卡片 gap:4px vs tooltip gap:6px
6. **筛选行为不一致**：工具栏支持 AND/OR/NOT，侧边栏只有 OR/AND
7. **多级标签显示不统一**：卡片显示 `#project/sub`，侧边栏树按层级展开

### 死代码
- `TagHierarchyClasses`（bem.ts:283-302）零引用
- `ToolbarClasses.components.tagFilter`（bem.ts:514-533）零引用
- `task-card.css:1-171` 旧筛选面板 CSS（已被 DropdownMenu 取代）
- `TagHierarchyBuilder` 中 7 个函数无调用方
- `getSmartTagDisplay` 无调用方

---

## 五、修复建议

### 第一批（视觉一致性）
1. 筛选器/菜单标签改用彩色胶囊（复用 TagPillSpan 或 TagClasses）
2. 合并重复 tooltip CSS 到 tooltip.css，删除 week-view.css 中的重复
3. 统一标签容器间距为 4px

### 第二批（代码统一）
4. TagPillSpan 补齐 selectable/suffix/data-selected，合并三实现
5. addSvgClass/addSvgClass 去重 → 公共 utils
6. 死代码清理（TagHierarchyClasses、旧筛选 CSS、无调用函数）

### 第三批（解析增强）
7. 正则支持数字开头标签、连字符标签（与 Obsidian 原生对齐）
8. colorIndex clamp 防御
