# Obsidian 插件开发指南

## 项目架构

这是一个使用 TypeScript 构建并通过 esbuild 打包的 Obsidian 社区插件。入口文件是 `main.ts`，编译后生成 `main.js` 供 Obsidian 加载。

**发布所需的关键文件：**
- `main.js` - 打包后的插件代码（自动生成，切勿提交到 git）
- `manifest.json` - 插件元数据（id、version、minAppVersion）
- `styles.css` - 可选的插件样式文件

## 构建与开发工作流

**开发模式（监听模式）：**
```bash
npm run dev
```
此命令以监听模式运行 `esbuild.config.mjs`，生成内联 sourcemap。`main.ts` 的更改会自动重新构建 `main.js`。

**生产构建：**
```bash
npm run build
```
运行 TypeScript 类型检查（`tsc -noEmit -skipLibCheck`），然后构建压缩后的 `main.js`（不含 sourcemap）。

**测试更改：**
1. 将 `main.js`、`manifest.json` 和 `styles.css` 复制到 `<vault>/.obsidian/plugins/<plugin-id>/`
2. 重新加载 Obsidian（Ctrl+R 或重启）
3. 在设置 → 社区插件中启用插件

## 核心模式与约定

### 插件生命周期
- `onload()` - 初始化插件、注册命令/事件、加载设置
- `onunload()` - 清理工作由 `register*` 辅助方法自动处理

### 设置模式
```typescript
interface MyPluginSettings { mySetting: string; }
const DEFAULT_SETTINGS: MyPluginSettings = { mySetting: 'default' }

// 在插件类中：
async onload() {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
}
async saveSettings() {
  await this.saveData(this.settings);
}
```

### 安全的资源注册
始终使用这些辅助方法以防止插件禁用/重载时的内存泄漏：
```typescript
this.registerEvent(this.app.workspace.on('file-open', ...));
this.registerDomEvent(document, 'click', ...);
this.registerInterval(window.setInterval(...));
```

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

## 构建配置

**esbuild 配置（esbuild.config.mjs）：**
- 入口：`main.ts` → 输出：`main.js`
- 外部依赖：`obsidian`、`electron`、CodeMirror 包、内置 Node 模块
- 目标：ES2018，CommonJS 格式
- 开发模式：监听 + 内联 sourcemap
- 生产模式：压缩，无 sourcemap

**TypeScript 配置（tsconfig.json）：**
- 启用严格模式（`strictNullChecks`、`noImplicitAny`）
- 目标：ES6，包含 ES5/ES6/ES7 库
- 模块：ESNext，使用 node 解析

## 版本管理与发布流程

**版本升级工作流：**
```bash
npm version patch|minor|major
```
此脚本（`version-bump.mjs`）会自动：
1. 更新 `manifest.json` 和 `package.json` 中的 `version`
2. 在 `versions.json` 中添加新版本映射（插件版本 → minAppVersion）

**手动发布检查清单：**
1. 如果使用新 API，更新 `manifest.json` 中的 `minAppVersion`
2. 运行 `npm version patch`（或 minor/major）
3. 提交更改
4. 创建 GitHub release，标签需完全匹配版本号（不要添加 `v` 前缀）
5. 将 `manifest.json`、`main.js`、`styles.css` 作为发布资源附加

## 项目特定说明

**当前插件状态：** 这是示例插件模板（`id: "sample-plugin"`）。正式开发前需要：
1. 更新 `manifest.json`：修改 `id`、`name`、`description`、`author`
2. 更新 `package.json`：修改 `name`、`description`、`author`
3. 重命名 `main.ts` 中的类（如 `MyPlugin` → `实际插件名称`）

**移动端兼容性：** `isDesktopOnly: false` 意味着需避免使用 Node/Electron 特定 API。如果目标是跨平台，请在移动端测试。

## 常见陷阱

- **切勿提交** `node_modules/` 或 `main.js` 到 git
- **命令 ID 是永久性的** - 更改会破坏用户工作流
- **始终 await** `loadData()`/`saveData()` 以确保设置持久化
- **版本标签必须完全匹配** - GitHub 标签应为 `1.2.3` 而非 `v1.2.3`
- **打包所有内容** - `main.js` 中不允许有外部运行时依赖

## 参考文档

详见 `AGENTS.md`，包含全面的 Obsidian 插件开发指南，涵盖安全策略、用户体验规范和故障排除。
