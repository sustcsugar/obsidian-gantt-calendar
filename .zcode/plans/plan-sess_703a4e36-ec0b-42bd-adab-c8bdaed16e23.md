# 标签筛选器 Linear 风格重设计

## 设计理念
参考 Linear 的 label filter：彩色圆点标识标签身份、紧凑计数徽章、行高亮选中态、无多余装饰。

## 视觉变更清单

### 1. 标签行 — 从纯文本变为彩色圆点 + 标签名 + 计数徽章
- 每行前添加 **6px 彩色圆点**（颜色 = TagPill.getColorIndex(fullPath) 的 hash 取色）
- 标签名保持 `fullPath`（多级标签完整展示）
- 计数从纯灰文本改为 **圆角小徽章**（`min-width:20px; padding:0 5px; border-radius:8px; font-size:10px`）
- 选中行：`background: color-mix(accent 8%, transparent)` + 左侧 2px accent 竖条 + 文字 accent 色 + ✓ 勾选图标

### 2. 彩色圆点颜色来源
复用 `TagPill.getColorIndex(fullPath)` 的 hash 取色，与任务卡片中的标签胶囊**同一颜色**，形成视觉关联

### 3. 面板样式 — 走设计令牌
- 面板宽度统一为 `240px`
- 圆角改为 `var(--gc-radius-md)` (8px)
- 阴影改为 `var(--gc-elev-3)`
- 行 hover/选中使用 `color-mix` 而非硬编码

### 4. OR/AND/NOT — 改为底部胶囊切换器
- 三个选项放入一个圆角容器（`border-radius: var(--gc-radius-full)`，`background: var(--background-secondary)`）
- 选中项用 `background: var(--background-primary)` + `box-shadow` 浮起效果
- 移至面板**底部**（Linear 惯例：筛选条件在底部）

### 5. 触发按钮 — 已选计数徽章
- 工具栏/侧边栏的 tag 触发按钮上显示已选数量的**小徽章**（右上角圆形，accent 底色白字）

## 涉及文件
1. `TagTreeFilter.tsx` — 重写渲染逻辑（彩色圆点、徽章、选中样式）
2. `settings.css` / `react-base.css` — 新增 `.gc-tag-tree-filter__*` BEM 样式
3. `gantt.css` — 无改动（面板样式走 DropdownMenu 已有规则）
4. `Toolbar.tsx` / `TaskListPanel.tsx` — 触发按钮添加计数徽章

## 不改动
- DropdownMenu 组件本身（面板定位、动画、portal）
- TagPill / TagPillSpan（任务卡片中的标签胶囊不变）
- buildTagHierarchy / 颜色 hash 算法