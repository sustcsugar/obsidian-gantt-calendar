# Embedded Note Editor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the read-only daily note preview in DayView with a full Obsidian editor (Live Preview / Source mode) using WorkspaceLeaf DOM reparenting.

**Architecture:** Create a detached `WorkspaceLeaf` (not attached to workspace layout), mount its `containerEl` into the DayView's notes section, and open the daily note file via `leaf.openFile()`. This gives the user the complete Obsidian editing experience (Live Preview, wikilinks, embeds, hotkeys) embedded directly inside the DayView layout. A fallback to the original `MarkdownRenderer.render()` is included for robustness.

**Tech Stack:** Obsidian Plugin API (WorkspaceLeaf, MarkdownView, TFile), existing DayViewRenderer, existing `dailyNoteSettingsBridge` utilities.

---

## Task 1: Create EmbeddedNoteEditor class

**Files:**
- Create: `src/views/EmbeddedNoteEditor.ts`

**Step 1: Create the EmbeddedNoteEditor class**

This is the core class that manages the lifecycle of a detached WorkspaceLeaf embedded in a custom container.

```typescript
// src/views/EmbeddedNoteEditor.ts

import { App, WorkspaceLeaf, TFile, MarkdownView, MarkdownRenderer, Component } from 'obsidian';
import { findDailyNoteForDate, DailyNoteIndex } from '../utils/dailyNoteSettingsBridge';
import type { GanttCalendarSettings } from '../settings/types';
import { Logger } from '../utils/logger';

/**
 * 嵌入式笔记编辑器
 *
 * 通过创建 detached WorkspaceLeaf 并将其 DOM 挂载到自定义容器中，
 * 实现完整的 Obsidian 编辑体验（Live Preview / Source 模式）。
 *
 * 核心原理：
 * 1. new WorkspaceLeaf(workspace) 创建一个不挂在 workspace 布局树中的 leaf
 * 2. 将 leaf.containerEl 挂载到 DayView 的笔记区域 div
 * 3. leaf.openFile(file) 加载完整的 MarkdownView 编辑器
 * 4. 清理时调用 leaf.detach() 从 workspace 注销
 */
export class EmbeddedNoteEditor {
    private app: App;
    private container: HTMLElement;
    private leaf: WorkspaceLeaf | null = null;
    private currentFilePath: string | null = null;
    private fallbackComponent: Component | null = null;

    constructor(app: App, container: HTMLElement) {
        this.app = app;
        this.container = container;
    }

    /**
     * 为指定日期打开 daily note 编辑器
     */
    async openDate(
        date: Date,
        dailyNoteIndex: DailyNoteIndex,
        settings: GanttCalendarSettings,
        parentComponent: Component
    ): Promise<void> {
        const file = findDailyNoteForDate(date, dailyNoteIndex, this.app, settings);

        if (!file) {
            this.showEmpty('未找到 Daily Note');
            return;
        }

        await this.openFile(file, parentComponent);
    }

    /**
     * 打开指定文件的编辑器
     */
    async openFile(file: TFile, parentComponent: Component): Promise<void> {
        // 同一文件，无需重新加载
        if (this.currentFilePath === file.path && this.leaf) {
            return;
        }

        // 关闭旧的编辑器
        await this.close();

        this.currentFilePath = file.path;

        try {
            // 创建 detached leaf（不挂在 workspace 布局树中）
            this.leaf = new (WorkspaceLeaf as any)(this.app.workspace);

            // 将 leaf 的 DOM 挂载到我们的容器中
            this.container.empty();
            this.container.appendChild(this.leaf.containerEl);

            // 在 leaf 中打开文件（触发 MarkdownView 创建）
            await this.leaf.openFile(file);

            // 应用嵌入样式
            this.applyEmbeddedStyles();

            Logger.debug('EmbeddedNoteEditor', `Opened file: ${file.path}`);
        } catch (error) {
            Logger.error('EmbeddedNoteEditor', 'Failed to create embedded editor, falling back to preview', error);

            // 降级到只读预览模式
            this.leaf = null;
            await this.fallbackToPreview(file, parentComponent);
        }
    }

    /**
     * 关闭并清理编辑器
     */
    async close(): Promise<void> {
        // 清理 fallback component
        if (this.fallbackComponent) {
            this.fallbackComponent.unload();
            this.fallbackComponent = null;
        }

        // 清理 embedded leaf
        if (this.leaf) {
            try {
                if (this.leaf.containerEl.parentNode) {
                    this.leaf.containerEl.parentNode.removeChild(this.leaf.containerEl);
                }
                this.leaf.detach();
            } catch (e) {
                Logger.error('EmbeddedNoteEditor', 'Error closing leaf', e);
            }
            this.leaf = null;
        }

        this.currentFilePath = null;
    }

    /**
     * 获取当前打开的文件路径
     */
    getCurrentFilePath(): string | null {
        return this.currentFilePath;
    }

    /**
     * 显示空状态消息
     */
    private showEmpty(message: string): void {
        this.close();
        this.container.empty();
        this.container.createEl('div', { text: message, cls: 'gantt-task-empty' });
    }

    /**
     * 降级到只读预览模式（MarkdownRenderer）
     */
    private async fallbackToPreview(file: TFile, parentComponent: Component): Promise<void> {
        this.container.empty();

        const content = await this.app.vault.read(file);
        if (!content.trim()) {
            this.container.createEl('div', { text: '无内容', cls: 'gantt-task-empty' });
            return;
        }

        this.fallbackComponent = new Component();
        this.fallbackComponent.load();

        const noteBody = this.container.createDiv('gc-day-view__notes-body');
        await MarkdownRenderer.render(
            this.app,
            content,
            noteBody,
            file.path,
            this.fallbackComponent
        );
    }

    /**
     * 应用嵌入样式（隐藏不需要的 UI 元素，调整尺寸）
     */
    private applyEmbeddedStyles(): void {
        if (!this.leaf?.view) return;

        const containerEl = this.leaf.containerEl;

        // 确保 leaf 容器填满父容器
        containerEl.style.height = '100%';
        containerEl.style.width = '100%';
        containerEl.style.overflow = 'hidden';

        // 添加自定义 class 以便 CSS 选择器生效
        containerEl.classList.add('gc-embedded-editor');
    }
}
```

**Step 2: Verify the file compiles**

Run: `npm run build`
Expected: Build succeeds (the file is not imported yet, but should compile on its own)

**Step 3: Commit**

```bash
git add src/views/EmbeddedNoteEditor.ts
git commit -m "feat: add EmbeddedNoteEditor class for workspace leaf embedding"
```

---

## Task 2: Add BEM class names for embedded editor

**Files:**
- Modify: `src/utils/bem.ts` (add embedded editor block)

**Step 1: Add EMBEDDED_EDITOR to BLOCKS and create EmbeddedEditorClasses**

In `src/utils/bem.ts`, add the new block constant and class definitions.

Add to `BLOCKS` constant (around line 53, before the closing `} as const`):

```typescript
/** 嵌入式编辑器 */
EMBEDDED_EDITOR: 'embedded-editor',
```

Add after `DayViewClasses` (after line 211):

```typescript
/**
 * 嵌入式编辑器类名常量
 */
export const EmbeddedEditorClasses = {
    block: bem(BLOCKS.EMBEDDED_EDITOR),
};
```

**Step 2: Update EmbeddedNoteEditor to use the BEM class**

In `src/views/EmbeddedNoteEditor.ts`, update the import and `applyEmbeddedStyles`:

Add to imports:
```typescript
import { EmbeddedEditorClasses } from '../utils/bem';
```

Change in `applyEmbeddedStyles`:
```typescript
containerEl.classList.add(EmbeddedEditorClasses.block);
```

(Remove the hardcoded `'gc-embedded-editor'` string.)

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/utils/bem.ts src/views/EmbeddedNoteEditor.ts
git commit -m "feat: add BEM classes for embedded editor"
```

---

## Task 3: Integrate EmbeddedNoteEditor into DayViewRenderer

**Files:**
- Modify: `src/views/DayView.ts`

**Step 1: Add import and property**

At the top of `DayView.ts`, add:
```typescript
import { EmbeddedNoteEditor } from './EmbeddedNoteEditor';
```

Remove the `MarkdownRenderer` import (no longer used directly):
```typescript
// Remove: import { TFile, MarkdownRenderer, App } from 'obsidian';
// Replace with:
import { App } from 'obsidian';
```

Wait - `TFile` might be needed elsewhere. Check. Actually `TFile` is only used in `loadDayViewNotes` which we're replacing. `App` is used. So:

```typescript
// Change line 1 from:
import { TFile, MarkdownRenderer, App } from 'obsidian';
// To:
import { App } from 'obsidian';
```

Add property to `DayViewRenderer` class (after `private currentDate`):
```typescript
private embeddedEditor: EmbeddedNoteEditor | null = null;
```

**Step 2: Replace loadDayViewNotes method**

Replace the entire `loadDayViewNotes` method (lines 332-366) with:

```typescript
/**
 * 加载 Daily Note 内容
 * 使用嵌入式编辑器实现所见即所得的编辑体验
 * 支持 Obsidian 核心日记插件、Periodic Notes 插件和手动配置
 */
private async loadDayViewNotes(contentContainer: HTMLElement, targetDate: Date): Promise<void> {
    // 懒初始化 EmbeddedNoteEditor
    if (!this.embeddedEditor) {
        this.embeddedEditor = new EmbeddedNoteEditor(this.app, contentContainer);
        // 注册清理回调，视图切换时自动关闭
        this.registerDomCleanup(() => {
            this.embeddedEditor?.close();
            this.embeddedEditor = null;
        });
    }

    await this.embeddedEditor.openDate(
        targetDate,
        this.plugin.dailyNoteIndex,
        this.plugin.settings,
        this.plugin.calendarView
    );
}
```

**Step 3: Remove unused import**

Remove `import { findDailyNoteForDate } from '../utils/dailyNoteSettingsBridge';` from line 9 since `findDailyNoteForDate` is now called inside `EmbeddedNoteEditor.openDate()`, not in DayView directly.

Actually, wait - let me check if `findDailyNoteForDate` is used elsewhere in DayView.ts. Looking at the file... it's only used in `loadDayViewNotes` on line 337-341. So yes, remove this import.

**Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/views/DayView.ts
git commit -m "feat: integrate EmbeddedNoteEditor into DayView"
```

---

## Task 4: Add CSS styles for embedded editor

**Files:**
- Modify: `styles.css`

**Step 1: Add embedded editor styles**

Add these styles after the existing Day View section in `styles.css` (after the `.gc-day-view__notes-body` rule around line 2037):

```css
/* ==================== Embedded Note Editor ==================== */
/* 嵌入式编辑器 - 在 DayView 的笔记区域中嵌入完整的 Obsidian 编辑器 */

/* 嵌入式 leaf 容器 */
.gc-embedded-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: hidden;
}

/* 隐藏 MarkdownView 的顶部标题栏 */
.gc-embedded-editor .view-header {
    display: none;
}

/* 隐藏 MarkdownView 的 nav 区域 */
.gc-embedded-editor .workspace-leaf-content {
    display: flex;
    flex-direction: column;
    height: 100%;
}

/* 编辑器区域填满 */
.gc-embedded-editor .markdown-source-view,
.gc-embedded-editor .markdown-reading-view {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
}

/* 移除 leaf 的默认边框和阴影 */
.gc-embedded-editor .workspace-leaf-content[data-mode="source"] .cm-editor,
.gc-embedded-editor .workspace-leaf-content[data-mode="preview"] .markdown-preview-view {
    height: 100%;
}

/* 确保 CodeMirror 填满编辑区 */
.gc-embedded-editor .cm-editor {
    height: 100%;
}

.gc-embedded-editor .cm-scroller {
    overflow-y: auto;
}

/* 日视图笔记区内容容器调整 */
.gc-day-view__notes-content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds (CSS changes don't affect TypeScript compilation)

**Step 3: Commit**

```bash
git add styles.css
git commit -m "style: add CSS for embedded note editor in DayView"
```

---

## Task 5: Handle date navigation (reuse editor on same file)

**Files:**
- Modify: `src/views/EmbeddedNoteEditor.ts` (minor optimization)

**Context:** When the user navigates dates (previous/next day), `GCMainView.render()` is called which triggers `dayRenderer.runDomCleanups()` then `dayRenderer.render()`. The `runDomCleanups()` will call our registered cleanup, which closes the editor. Then `render()` creates a new editor for the new date.

This works correctly but could be optimized: if the date changes, we close the old editor and create a new one. The `openFile` method already checks `this.currentFilePath === file.path` to skip reloading the same file. This is sufficient.

No code changes needed for this task - the lifecycle is already correct through `registerDomCleanup`.

**Step 1: Verify the lifecycle works by tracing the code**

Trace the code path:
1. User clicks "next day" → `GCMainView.nextPeriod()` → `this.currentDate = date; this.render();`
2. `render()` calls `this.dayRenderer.runDomCleanups()` → triggers registered cleanup → `embeddedEditor.close()`
3. `render()` calls `this.dayRenderer.render(content, this.currentDate)` → `loadDayViewNotes(notesContent, date)`
4. `loadDayViewNotes()` creates new `EmbeddedNoteEditor` (since old one was nulled in cleanup) → `openDate(newDate)`

This is correct. No changes needed.

**Step 2: Commit (no changes - documentation only)**

Skip commit for this task (no code changes).

---

## Task 6: Handle the notesContent container reference for re-rendering

**Files:**
- Modify: `src/views/DayView.ts` (minor adjustment)

**Context:** There's a subtle issue: `loadDayViewNotes` receives `contentContainer` as a parameter, but the `EmbeddedNoteEditor` stores this reference. When `runDomCleanups()` is called (which closes the editor and removes it), then `render()` creates a new layout with new DOM elements, `loadDayViewNotes` is called with a **different** `contentContainer` (newly created div).

The current design handles this correctly because:
1. `runDomCleanups()` sets `this.embeddedEditor = null`
2. Next `loadDayViewNotes()` call checks `if (!this.embeddedEditor)` → creates new instance with the new container
3. New `EmbeddedNoteEditor` is bound to the new container

No code changes needed - this is already handled correctly by the null-check and re-creation pattern.

---

## Task 7: Ensure proper cleanup on view switch and plugin unload

**Files:**
- Modify: `src/views/DayView.ts` (add explicit cleanup override)

**Step 1: Verify GCMainView.onClose calls runDomCleanups**

Looking at `GCMainView.onClose()` (line 123-141):
```typescript
this.dayRenderer.runDomCleanups();
```
This is called, which triggers our registered cleanup. Good.

**Step 2: Verify plugin unload path**

In `main.ts` `onunload()` (line 69-77):
```typescript
this.app.workspace.getLeavesOfType(GC_VIEW_ID).forEach(leaf => leaf.detach());
```
This detaches the GCMainView leaf, which triggers `onClose()`, which calls `runDomCleanups()`. The chain is correct.

No code changes needed - the cleanup chain is already correct.

---

## Task 8: Build, deploy, and manually test

**Step 1: Build the plugin**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 2: Copy built files to vault**

```bash
cp main.js manifest.json styles.css "../../../.obsidian/plugins/obsidian-gantt-calendar/"
```

**Step 3: Test in Obsidian**

Manual testing checklist:
1. Open Gantt Calendar → Switch to Day View
2. Verify: Daily note section shows an editable editor (not static preview)
3. Click in the editor → verify cursor appears, can type text
4. Verify: Wikilinks autocomplete works (`[[` triggers suggestion)
5. Navigate to previous/next day → verify editor loads the new daily note
6. Switch to another view (Month/Week) → switch back to Day → verify editor recreates properly
7. Verify: No orphan leaves remain in workspace after view switches
8. Check browser console (Ctrl+Shift+I) for errors

**Step 4: Commit if testing passes**

```bash
git add -A
git commit -m "feat: embedded note editor in DayView with full editing capability"
```

---

## Task 9: Clean up unused code

**Files:**
- Modify: `src/views/DayView.ts` (remove unused import)

**Step 1: Remove unused imports**

After integration, verify no unused imports remain in `DayView.ts`. Specifically:
- `TFile` - was used in old `loadDayViewNotes`, now moved to `EmbeddedNoteEditor`
- `MarkdownRenderer` - was used in old `loadDayViewNotes`, now moved to `EmbeddedNoteEditor`
- `findDailyNoteForDate` - was used in old `loadDayViewNotes`, now called by `EmbeddedNoteEditor`

These should already be removed in Task 3. Verify.

**Step 2: Remove `notesBody` BEM class if no longer used**

Check if `DayViewClasses.elements.notesBody` is still referenced anywhere after the change. If only used in the old `loadDayViewNotes` and in `EmbeddedNoteEditor.fallbackToPreview` (which uses the hardcoded string), update it.

In `EmbeddedNoteEditor.ts` fallback method, it uses `'gc-day-view__notes-body'` - this should use the BEM class:

```typescript
import { DayViewClasses } from '../utils/bem';
// ...
const noteBody = this.container.createDiv(DayViewClasses.elements.notesBody);
```

**Step 3: Verify build and commit**

Run: `npm run build`

```bash
git add -A
git commit -m "chore: clean up unused imports and use BEM constants"
```

---

## Summary of all changes

| File | Action | Description |
|------|--------|-------------|
| `src/views/EmbeddedNoteEditor.ts` | Create | Core class: detached leaf + DOM reparenting + fallback |
| `src/utils/bem.ts` | Modify | Add `EMBEDDED_EDITOR` block + `EmbeddedEditorClasses` |
| `src/views/DayView.ts` | Modify | Replace `loadDayViewNotes` to use `EmbeddedNoteEditor` |
| `styles.css` | Modify | Add CSS for embedded editor (hide headers, fill space) |

**Risk mitigation:** If `new WorkspaceLeaf(workspace)` fails on a future Obsidian version, the `try/catch` in `openFile` automatically falls back to `MarkdownRenderer.render()` (the original read-only behavior).
