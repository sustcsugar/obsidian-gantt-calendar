# Obsidian Gantt Calendar Tree

[简体中文](./README_zh.md)

A local-first fork and extension of [obsidian-gantt-calendar](https://github.com/sustcsugar/obsidian-gantt-calendar) (baseline `v1.6.2`, commit `1d2f00e`) built for **multi-project, multi-model parallel R&D scheduling** in Obsidian.

It runs as an **independent plugin** (`id: "gantt-calendar-tree"`, display name **Gantt Calendar Tree**) so it can coexist side-by-side with the upstream plugin with zero ID, view, or storage conflicts, while preserving all original calendar, timeline, task list, sidebar, recurring task, and Feishu sync capabilities.

---

## Table of Contents

- [What's New in Gantt Calendar Tree](#whats-new-in-gantt-calendar-tree)
- [Recommended Vault Structure & Markdown Contract](#recommended-vault-structure--markdown-contract)
- [Installation & Coexistence](#installation--coexistence)
- [Gantt Tree Controls & Settings](#gantt-tree-controls--settings)
- [Inherited Upstream Capabilities](#inherited-upstream-capabilities)
- [Development, Testing & Packaging](#development-testing--packaging)
- [Credits & License](#credits--license)

---

## What's New in Gantt Calendar Tree

### 1. Multi-Level Tree Grouping & Dimension Switching
- **Four-level hierarchy**: `Project Folder → Model Document (.md) → Parent Task → Indented Sub-tasks (unlimited depth)`.
- **Grouping dimension toggle**: Switch anytime between **Project → Model** (`project-model`) and **Model Only** (`model-only`) for cross-project model schedule comparison; file and task collapse states stay intact across switches.
- **Tree / Flat view toggle**: Switch between **Tree Group** and **Flat List** (original flat Gantt behavior), with both view mode, grouping mode, and collapsed node IDs persisted automatically to `data.json`.
- **Natural & chronological sorting**: Folders and documents sort in `zh-CN` natural numeric order (`Item-2 → Item-10 → Plan-B`); sibling tasks sort by `start → end → lineNumber`.

### 2. Two-Phase Indented Task Parser & Virtual Parent Isolation
- **Unified lexical parser**: Cold start, file rename, creation, and live edits share one two-phase parser (`parseTasksFromContent`) that skips YAML Frontmatter and fenced code blocks (`` ``` `` / `~~~`).
- **Monotonic indentation stack**: Normalizes `1 Tab = 4 spaces`, supports mixed/jumping indents (`0 → 6 → 2`), preserves parent-child links across blank lines and indented notes, and resets cleanly on Markdown headings (`#`), horizontal rules, or zero-indent non-task paragraphs.
- **Virtual parent retention & facade isolation**: When `globalTaskFilter` (e.g. `🎯 `) is active, unmarked parent tasks that contain matching descendants are retained as `isVirtualContainer = true` for Gantt tree display only. `TaskStore.getAllTasks()` filters them out by default so Day / Week / Month / Year / Task views, sidebar, status bar, and sync remain completely clean.
- **Parent date inheritance**: Dateless sub-tasks indented under a dated parent task are automatically preserved and inherit the parent's schedule (rendered as subtle translucent dashed bars; dragging assigns them explicit dates).

### 3. Roll-Up Summary Brackets & Real-Time Progress
- **Classic Gantt summary brackets**: Project folders, model files, and dateless/virtual parent tasks render as read-only bracket `<path>` bars with single-day/narrow width protection and right-side grid row tinting aligned with the left tree column.
- **Live completion roll-up**: Recursively computes `completedTaskCount / leafTaskCount` and `progressRatio` across all levels, rendering an internal progress fill layer, trailing percentage label (`60%`), left `completed/total` badge, and rich Rollup Tooltip (level, date span, inclusive day count, task count, completion progress).
- **Out-of-bounds child warning**: Dated parent tasks whose children extend past the parent's handwritten dates keep their handwritten bar draggable and display a subtle dashed warning outline + `⚠` indicator + tooltip note.

### 4. Filter-Aware Pruning, Live Search & Viewport Stability
- **Live keyword search**: Matches task text, model filename, and project folder name simultaneously; integrates with status and hierarchical tag filters.
- **Ancestor chain preservation**: Matching leaf tasks retain their full `Folder → Model → Parent` path, and rollup brackets shrink dynamically to the visible matches.
- **Scroll & column-width stability**: Resizing the task column updates SVG `<foreignObject>` widths in real time with single-line ellipsis truncation; collapsing, expanding, or searching preserves `scrollLeft` and `scrollTop` instead of jumping back to Today.

### 5. Safe Write-Back & Atomic Cascade Drag
- **Double-layer rollup protection**: Rollup bars have no resize handles or drag bindings and are additionally guarded in both `GanttView` and `TaskUpdateHandler`.
- **Non-destructive virtual parent checkboxes**: Toggling a `isVirtualContainer` checkbox swaps `[ ]` ↔ `[x]` in place under `withFileLock()` without calling `serializeTask()` or injecting `globalTaskFilter`, preserving indentation and unrecognized inline tokens byte-for-byte.
- **Strict line-drift & CRLF protection**: `locateTaskLineStrict()` rejects ambiguous duplicate titles instead of overwriting the wrong line, and preserves Windows `\r\n` endings.
- **Optional atomic parent-child cascade drag**: Enable **Cascade child dates when dragging parent** in settings to shift a dated parent and all dated descendants in the same file by the same day delta in a single `app.vault.process()` pass, complete with a one-click **Undo** Notice that pre-validates every line before restoring.

---

## Recommended Vault Structure & Markdown Contract

```text
Projects/                          # Optional: set as "Gantt Tree Root Folder" in settings
├── Project-Alpha/                 # Level 0: Project Folder
│   ├── Model-A.md                 # Level 1: Item / Document
│   ├── Model-B.md
│   └── Model-C.md
└── Project-Beta/
    └── Release-1.md
```

Example inside `Projects/Project-Alpha/Model-A.md`:

```markdown
## Schedule
- [ ] Phase 1: Design
  - [ ] Architecture Review 🛫 2026-09-10 📅 2026-09-17
  - [ ] Core Implementation 🛫 2026-09-18 📅 2026-09-25
- [ ] Phase 2: Verification 🛫 2026-09-20 📅 2026-10-05
  - [ ] Integration Testing 🛫 2026-09-20 📅 2026-09-28
  - [ ] Release Sign-off 🛫 2026-09-29 📅 2026-10-05
  - [ ] Archive release notes (dateless sub-task inherits parent schedule)
```

> All tasks stay 100% standard plain-text Markdown (Tasks emoji or Dataview inline fields). No proprietary syntax is introduced.

---

## Installation & Coexistence

### Requirements
- **Obsidian**: `1.13.0` or later (`isDesktopOnly: false`, works on desktop & mobile).

### Manual Installation
1. Build locally (`npm install && npm run build`) or take the packaged bundle from `dist/gantt-calendar-tree/` (or unzip `dist/gantt-calendar-tree-v1.6.2.zip`).
2. Copy the three required files into your vault:
   ```text
   <YourVault>/.obsidian/plugins/gantt-calendar-tree/
   ├── main.js
   ├── manifest.json
   └── styles.css
   ```
3. In Obsidian, open **Settings → Community plugins**, click **Reload**, and enable **Gantt Calendar Tree**.

> **Coexistence note**: Because `manifest.json` uses `id: "gantt-calendar-tree"` and isolated view/storage IDs (`gantt-calendar-tree-view`, `gantt-calendar-tree-sidebar-view`, `gantt-calendar-view-filters-tree`), it can be enabled alongside the original `gantt-calendar` plugin without conflict.
>
> **First-launch tip**: Fresh installs default `Global task filter` to `🎯 `. If your vault tasks do not start with `🎯 `, clear it in **Settings → Gantt Calendar Tree → Tasks** (or copy your existing `.obsidian/plugins/gantt-calendar/data.json` into `.obsidian/plugins/gantt-calendar-tree/data.json` and reload).

---

## Gantt Tree Controls & Settings

### Embedded Gantt Control Bar
- **Tree Group / Flat List**: Toggle between hierarchical tree Gantt and original flat list.
- **Project → Model / Model Only**: Toggle folder grouping vs. direct cross-project model comparison.
- **Expand All / Models Only / Collapse All**: Quickly switch between full detail and a multi-model overview dashboard.
- **Search Box**: Filter live by task title, model filename, or project folder name.

### Gantt-Specific Settings (**Settings → Gantt Calendar Tree → Gantt Chart**)
| Setting Key | Default | Description |
| :--- | :--- | :--- |
| `ganttStartField` | `startDate` | Task date field used for bar start (falls back to `createdDate` / `startDate` when missing). |
| `ganttEndField` | `dueDate` | Task date field used for bar end. |
| `ganttRootFolder` | `""` | Folder scope & prefix stripped in Gantt tree mode only (case-insensitive segment match; does not limit Day/Week/Month/Year/Task views). |
| `ganttCascadeParentDrag` | `false` | When enabled, translating a dated parent task atomically shifts all dated descendant tasks in the same file via `vault.process` with Undo support. |
| `ganttDisplayMode` / `ganttGroupMode` / `ganttCollapsedIds` | `'tree'` / `'project-model'` / `[]` | Persisted automatically to `data.json` across restarts. |

---

## Inherited Upstream Capabilities

All original features from `obsidian-gantt-calendar` remain intact:
- **6 Views**: Day / Week / Month / Year / Task / Gantt + Right Sidebar (Task List + Daily Timeline).
- **Dual Task Formats**: Native parsing & write-back for both Tasks emoji (`🛫`, `📅`, `⏫`, `🔁`) and Dataview inline fields (`[start:: ...]`, `[due:: ...]`).
- **Continuous Timeline Canvas**: Minute-level blocks (`YYYY-MM-DD HH:mm`), click-to-create, 15-min snap resize (`Alt` for 5-min), touch long-press gestures on mobile.
- **Festivals, Lunar Calendar & Year Heatmap**: Solar/lunar festivals, 24 solar terms, 8 heatmap palettes.
- **Recurring Tasks & Feishu Sync**: Virtual recurring instances across views and OAuth 2.0 bidirectional Feishu Task sync.

---

## Development, Testing & Packaging

```bash
# Install dependencies
npm install

# Development watch mode (esbuild)
npm run dev

# Type-check only
npx tsc --noEmit

# Production build (outputs root main.js + styles.css)
npm run build

# Lint (ESLint + eslint-plugin-obsidianmd)
npm run lint

# Run Jest test suite
npm test
```

- Architecture specification: [SPEC_gantt_calendar_tree.md](./SPEC_gantt_calendar_tree.md)
- Core tree Gantt modules:
  - [src/constants.ts](./src/constants.ts) — Isolated plugin/view/storage IDs
  - [src/tasks/taskParser/main.ts](./src/tasks/taskParser/main.ts) — Unified two-phase indented parser
  - [src/gantt/dateRangeResolver.ts](./src/gantt/dateRangeResolver.ts) — Shared date range & fallback resolver
  - [src/gantt/treeBuilder.ts](./src/gantt/treeBuilder.ts) — Pure tree builder, filter pruning, roll-up & flattener
  - [src/gantt/wrappers/rollupGeometry.ts](./src/gantt/wrappers/rollupGeometry.ts) — Summary bracket & progress fill SVG geometry
  - [src/tasks/taskUpdater.ts](./src/tasks/taskUpdater.ts) & [src/tasks/taskUndo.ts](./src/tasks/taskUndo.ts) — Strict line-drift protection, non-destructive virtual checkbox write-back, and atomic `vault.process` batch shift + undo

---

## Credits & License

- Built on top of [obsidian-gantt-calendar](https://github.com/sustcsugar/obsidian-gantt-calendar) by [Sugar](https://github.com/sustcsugar).
- Licensed under the same terms as the upstream repository ([LICENSE](./LICENSE)).
