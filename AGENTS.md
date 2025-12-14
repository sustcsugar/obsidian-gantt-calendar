# Obsidian Gantt Calendar 插件

## 项目概述

- 目标：Obsidian Gantt Calendar 插件（TypeScript → 打包后的 JavaScript）
- 功能: 实现在obsidian内进行任务管理功能
    - 包含日历的日周月年四种日历视图
    - 包含甘特图视图
    - 具有全局任务filter功能,可自定义文字或者符号, 定义在任务条目的开头,下方任务格式示例中, 任务开头的`🎯 `即为定义的全局任务筛选字段
    - 兼容 Tasks 任务管理插件创建的任务格式 
        - [ ] 🎯  tasks插件的任务格式 🔺 highest ➕ 2025-12-14 🛫 2025-12-14 ⏳ 2025-12-14 📅 2025-12-14 ❌ 2025-12-14 ✅ 2025-12-14
    - 兼容 Dataview 插件创建的任务格式
        - [ ] 🎯  dataview插件任务格式  [priority:: highest]  [created:: 2025-12-14]  [start:: 2025-12-14]  [scheduled:: 2025-12-14]  [due:: 2025-12-14]  [cancelled:: 2025-12-14]  [completion:: 2025-12-14]
    - tasks格式的任务中,表情符号所代表的含义与Dataview任务格式的字段完全对照
- 入口点：`main.ts` 编译为 `main.js` 并由 Obsidian 加载
- 必需的发布产物：`main.js`、`manifest.json` 和可选的 `styles.css`

## 任务属性规范

每个任务具有以下属性：

### 1. globalFilter（全局筛选标记）
- **用途**：用于全局筛选任务，仅在任务行开头进行匹配
- **格式**：任务行开头的自定义文字或符号（如 `🎯 `）
- **示例**：`- [ ] 🎯 完成项目文档`
- **解析规则**：使用 `startsWith()` 检查任务行开头（去除复选框标记后），而不是全文搜索
- **在列表中显示**：与任务描述一起显示在"任务描述"列中

### 2. 任务描述（content）
- **用途**：描述任务的具体内容
- **格式**：纯文本，不包含属性标记
- **解析规则**：从原始任务内容中移除所有属性标记（emoji 和字段标记）后的干净文本
- **清理规则**：
  - 移除 Tasks 格式的 emoji 标记：`🔺 highest`、`➕ 2025-12-14` 等
  - 移除 Dataview 格式的字段标记：`[priority:: highest]`、`[due:: 2025-12-14]` 等
  - 清理多余空格
- **在列表中显示**：与 globalFilter 一起显示在"任务描述"列中

### 3. 优先级（priority）
- **类型**：可选属性
- **取值范围**：`highest`、`high`、`medium`、`normal`、`low`、`lowest`
- **Tasks 格式**：使用 emoji 表示优先级
  - `🔺` → highest（最高优先级）
  - `⏫` → high（高优先级）
  - `🔼` → medium（中优先级）
  - 无 emoji → normal（普通优先级）
  - `🔽` → low（低优先级）
  - `⏬` → lowest（最低优先级）
- **Dataview 格式**：使用字段表示优先级
  - `[priority:: highest]` → highest
  - `[priority:: high]` → high
  - `[priority:: medium]` → medium
  - 无字段 → normal
  - `[priority:: low]` → low
  - `[priority:: lowest]` → lowest
- **显示图标**：
  - `highest` → 🔴
  - `high` → 🟠
  - `medium` → 🟡
  - `normal` → ⚪（或不显示）
  - `low` → 🟢
  - `lowest` → 🔵
- **在列表中显示**：独立的"优先级"列，显示彩色圆圈图标

### 4. 时间属性
所有时间属性均为可选，格式为 `YYYY-MM-DD`：

#### created（创建日期）
- **Tasks 格式**：`➕ 2025-12-14`
- **Dataview 格式**：`[created:: 2025-12-14]`
- **在列表中显示**：独立的"创建"列

#### start（开始日期）
- **Tasks 格式**：`🛫 2025-12-14`
- **Dataview 格式**：`[start:: 2025-12-14]`
- **在列表中显示**：独立的"开始"列

#### scheduled（计划日期）
- **Tasks 格式**：`⏳ 2025-12-14`
- **Dataview 格式**：`[scheduled:: 2025-12-14]`
- **在列表中显示**：独立的"计划"列

#### due（截止日期）
- **Tasks 格式**：`📅 2025-12-14`
- **Dataview 格式**：`[due:: 2025-12-14]`
- **在列表中显示**：独立的"截止"列

#### cancelled（取消日期）
- **Tasks 格式**：`❌ 2025-12-14`
- **Dataview 格式**：`[cancelled:: 2025-12-14]`
- **在列表中显示**：独立的"取消"列

#### completion（完成日期）
- **Tasks 格式**：`✅ 2025-12-14`
- **Dataview 格式**：`[completion:: 2025-12-14]`
- **在列表中显示**：独立的"完成"列

### 任务列表显示布局

任务列表采用卡片式布局，每个任务卡片包含以下信息：

**任务筛选控制（工具栏右侧功能区）**
- 出现在插件主页工具栏的右边区域（功能区），仅在任务视图中显示
- **全部**按钮：显示所有任务
- **未完成**按钮：仅显示未完成的任务
- **已完成**按钮：仅显示已完成的任务
- 当前活跃的筛选按钮高亮显示
- 显示当前全局筛选状态：文案为“Global Filter: ...”
- 提供“刷新任务”按钮以重新加载任务列表

**第一行：任务基本信息**
1. **复选框**：显示任务完成状态
2. **任务描述**：显示 `globalFilter + content`（如：`🎯 完成项目文档`）
3. **优先级图标**：右侧显示彩色圆圈（🔴🟠🟡⚪🟢🔵）

**第二行：时间属性**（如果存在）
- 显示所有可用的时间属性标签和日期
- 逾期的截止日期会以红色高亮显示

**第三行：任务位置**
- 显示文件名和行号（如：`tasks.md:15`）

**视觉反馈**
- 已完成任务：半透明显示，左边框为绿色
- 待完成任务：正常显示，左边框为橙色
- 悬停效果：任务卡片略微向右平移

### 优先级显示

优先级在任务卡片右侧显示为彩色圆圈：
- 🔴 `highest`（最高优先级）
- 🟠 `high`（高优先级）
- 🟡 `medium`（中优先级）
- ⚪ `normal`（普通优先级，无优先级emoji/字段时）
- 🟢 `low`（低优先级）
- 🔵 `lowest`（最低优先级）

### 工具栏（主页）布局
插件主页顶部为工具条（toolbar），分为三个区域：左/中/右。

- 左侧：视图选择区，用于选择日历视图或任务视图。
- 中间：显示区，展示当前日期范围或标题；在日视图时可附加农历与节日信息。
- 右侧：功能区，内容随视图变化：
  - 日历视图：显示上一期、今天、下一期导航按钮。
  - 任务视图：显示筛选按钮（全部/未完成/已完成）、全局筛选状态文本（Global Filter: ...）、刷新任务按钮。

### 格式切换设置

插件提供格式选择设置，用户可以选择：
- **仅 Tasks 格式**：只解析 emoji 标记
- **仅 Dataview 格式**：只解析字段标记
- **两者都支持**：同时解析两种格式（默认）

### 完整任务示例

**Tasks 格式**：
```
- [ ] 🎯 完成项目文档 ⏫ ➕ 2025-01-10 🛫 2025-01-11 ⏳ 2025-01-12 📅 2025-01-15
```

**Dataview 格式**：
```
- [ ] 🎯 完成项目文档 [priority:: high] [created:: 2025-01-10] [start:: 2025-01-11] [scheduled:: 2025-01-12] [due:: 2025-01-15]
```

**解析结果**：
- globalFilter: `🎯`
- content: `完成项目文档`
- priority: `high`
- createdDate: `2025-01-10`
- startDate: `2025-01-11`
- scheduledDate: `2025-01-12`
- dueDate: `2025-01-15`

## 环境与工具

- Node.js：使用当前 LTS 版本（推荐 Node 18+）
- **包管理器：npm**（本示例项目必需 - `package.json` 定义了 npm 脚本和依赖）
- **打包工具：esbuild**（本示例项目必需 - `esbuild.config.mjs` 和构建脚本依赖它）。其他项目也可以使用 Rollup 或 webpack 等替代打包工具，但需要将所有外部依赖打包到 `main.js` 中
- 类型定义：`obsidian` 类型定义

**注意**：本示例项目对 npm 和 esbuild 有特定的技术依赖。如果你从头创建插件，可以选择不同的工具，但需要相应地替换构建配置。

### 安装

```bash
npm install
```

### 开发模式（监听）

```bash
npm run dev
```

### 生产构建

```bash
npm run build
```

## 文件和文件夹约定

- **将代码组织到多个文件中**：将功能拆分到单独的模块中，而不是将所有内容放在 `main.ts` 中
- 源代码位于 `src/` 中。保持 `main.ts` 小而专注于插件生命周期（加载、卸载、注册命令）
- **示例文件结构**：
  ```
  src/
    main.ts           # 插件入口点，生命周期管理
    settings.ts       # 设置接口和默认值
    commands/         # 命令实现
      command1.ts
      command2.ts
    ui/              # UI 组件、模态框、视图
      modal.ts
      view.ts
    utils/           # 工具函数、辅助函数
      helpers.ts
      constants.ts
    types.ts         # TypeScript 接口和类型
  ```
- **不要提交构建产物**：永远不要提交 `node_modules/`、`main.js` 或其他生成的文件到版本控制
- 保持插件体积小。避免大型依赖。优先选择浏览器兼容的包
- 生成的输出应放置在插件根目录或 `dist/` 中，具体取决于你的构建设置。发布产物必须位于仓库文件夹中的顶层（`main.js`、`manifest.json`、`styles.css`）

## Manifest 规则（`manifest.json`）

- 必须包含（非详尽列表）：
  - `id`（插件 ID；对于本地开发，它应与文件夹名称匹配）
  - `name`
  - `version`（语义化版本 `x.y.z`）
  - `minAppVersion`
  - `description`
  - `isDesktopOnly`（布尔值）
  - 可选：`author`、`authorUrl`、`fundingUrl`（字符串或映射）
- 发布后永远不要更改 `id`。将其视为稳定的 API
- 使用新 API 时保持 `minAppVersion` 准确
- 规范要求编码在此处：https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml

## 测试

- 手动安装测试：将 `main.js`、`manifest.json`、`styles.css`（如果有）复制到：
  ```
  <Vault>/.obsidian/plugins/<plugin-id>/
  ```
- 重新加载 Obsidian 并在**设置 → 社区插件**中启用插件

## 命令和设置

- 任何面向用户的命令都应通过 `this.addCommand(...)` 添加
- 如果插件有配置，请提供设置选项卡和合理的默认值
- 使用 `this.loadData()` / `this.saveData()` 持久化设置
- 使用稳定的命令 ID；一旦发布就避免重命名

### 命令注册
本项目命令 ID 统一使用 `gantt-calendar-` 前缀规范：
- `gantt-calendar-common` - 简单命令（通用功能）
- `gantt-calendar-editor` - 编辑器命令（编辑相关操作）
- `gantt-calendar-conditional` - 条件命令（条件判断后执行）

```typescript
// 简单命令
this.addCommand({
  id: 'gantt-calendar-common',  // 项目命令 ID 规范
  name: '用户可见的命令名称',
  callback: () => { /* 简单命令 */ }
});

// 编辑器上下文命令：
this.addCommand({
  id: 'gantt-calendar-editor',
  name: '编辑器命令',
  editorCallback: (editor: Editor, view: MarkdownView) => {
    editor.replaceSelection('text');
  }
});

// 条件可用命令：
this.addCommand({
  id: 'gantt-calendar-conditional',
  name: '条件命令',
  checkCallback: (checking: boolean) => {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view) {
      if (!checking) { /* 执行操作 */ }
      return true;  // 命令可用
    }
  }
});
```



## 版本控制和发布

- 在 `manifest.json` 中提升 `version`（SemVer）并更新 `versions.json` 以映射插件版本 → 最低应用版本
- 创建一个 GitHub 发布，其标签与 `manifest.json` 的 `version` 完全匹配。不要使用前导 `v`
- 将 `manifest.json`、`main.js` 和 `styles.css`（如果存在）作为单独的资产附加到发布中
- 初次发布后，按照要求遵循在社区目录中添加/更新插件的流程


## UI 和文案指南（用于 UI 文本、命令、设置）

- 标题、按钮和标题优先使用句子大小写
- 在分步文案中使用清晰的、面向行动的祈使句
- 使用**粗体**表示字面的 UI 标签。交互优先使用"选择"
- 使用箭头符号进行导航：**设置 → 社区插件**
- 保持应用内字符串简短、一致且无术语

## 性能

- 保持启动轻量。将繁重的工作推迟到需要时
- 避免在 `onload` 期间运行长时间任务；使用延迟初始化
- 批量磁盘访问并避免过度的仓库扫描
- 对响应文件系统事件的昂贵操作进行防抖/节流

## 编码约定

- 优先使用 `"strict": true` 的 TypeScript
- **保持 `main.ts` 最小化**：仅关注插件生命周期（onload、onunload、addCommand 调用）。将所有功能逻辑委托给单独的模块
- **拆分大文件**：如果任何文件超过约 200-300 行，考虑将其分解为更小的、专注的模块
- **使用清晰的模块边界**：每个文件应具有单一的、明确定义的职责
- 将所有内容打包到 `main.js` 中（没有未打包的运行时依赖）
- 如果你想要移动兼容性，避免使用 Node/Electron API；相应地设置 `isDesktopOnly`
- 优先使用 `async/await` 而不是 promise 链；优雅地处理错误

## 移动端

- 在可行的情况下，在 iOS 和 Android 上测试
- 除非 `isDesktopOnly` 为 `true`，否则不要假设仅桌面行为
- 避免大型内存结构；注意内存和存储限制

## AI 代理的注意事项

**应该做的**
- 添加具有稳定 ID 的命令（一旦发布就不要重命名）
- 在设置中提供默认值和验证
- 编写幂等代码路径，以便重新加载/卸载不会泄漏监听器或间隔
- 对所有需要清理的内容使用 `this.register*` 辅助函数

**不应该做的**
- 在没有明显的面向用户的原因和文档的情况下引入网络调用
- 发布需要云服务的功能而没有清楚的披露和明确的选择加入
- 除非必要并获得同意，否则不要存储或传输仓库内容

## 常见任务

### 将代码组织到多个文件中

**main.ts**（最小化，仅生命周期）：
```ts
import { Plugin } from "obsidian";
import { MySettings, DEFAULT_SETTINGS } from "./settings";
import { registerCommands } from "./commands";

export default class MyPlugin extends Plugin {
  settings: MySettings;

  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    registerCommands(this);
  }
}
```

**settings.ts**：
```ts
export interface MySettings {
  enabled: boolean;
  apiKey: string;
}

export const DEFAULT_SETTINGS: MySettings = {
  enabled: true,
  apiKey: "",
};
```

**commands/index.ts**：
```ts
import { Plugin } from "obsidian";
import { doSomething } from "./my-command";

export function registerCommands(plugin: Plugin) {
  plugin.addCommand({
    id: "do-something",
    name: "执行某操作",
    callback: () => doSomething(plugin),
  });
}
```

### 添加命令

```ts
this.addCommand({
  id: "your-command-id",
  name: "执行某项操作",
  callback: () => this.doTheThing(),
});
```

### 持久化设置

```ts
interface MySettings { enabled: boolean }
const DEFAULT_SETTINGS: MySettings = { enabled: true };

async onload() {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  await this.saveData(this.settings);
}
```

### 安全地注册监听器

```ts
this.registerEvent(this.app.workspace.on("file-open", f => { /* ... */ }));
this.registerDomEvent(window, "resize", () => { /* ... */ });
this.registerInterval(window.setInterval(() => { /* ... */ }, 1000));
```

## 故障排除

- 构建后插件无法加载：确保 `main.js` 和 `manifest.json` 位于 `<Vault>/.obsidian/plugins/<plugin-id>/` 下的插件文件夹的顶层
- 构建问题：如果缺少 `main.js`，运行 `npm run build` 或 `npm run dev` 来编译 TypeScript 源代码
- 命令未出现：验证 `addCommand` 在 `onload` 之后运行且 ID 是唯一的
- 设置未持久化：确保 `loadData`/`saveData` 被 await 并且在更改后重新渲染 UI
- 仅移动端问题：确认你没有使用仅桌面 API；检查 `isDesktopOnly` 并调整

## 参考资料

- Obsidian 示例插件：https://github.com/obsidianmd/obsidian-sample-plugin
- API 文档：https://docs.obsidian.md
- 开发者政策：https://docs.obsidian.md/Developer+policies
- 插件指南：https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- 样式指南：https://help.obsidian.md/style-guide
