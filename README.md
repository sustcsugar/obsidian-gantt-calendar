# Obsidian Gantt Calendar

[简体中文](./README_zh.md)

<div align="center" style="padding: 20px; border: 2px solid #8b5cf6; border-radius: 12px; background: linear-gradient(135deg, rgba(139, 92, 246, 0.05) 0%, rgba(59, 130, 246, 0.05) 100%); margin: 20px 0;">

A powerful visual task management plugin for Obsidian.

**Multi-View Calendar** — Task / Year / Month / Week / Day / Gantt — six views with seamless switching

**Festival Display** — Solar festivals, lunar festivals, and 24 solar terms

**Data Visualization** — Task heatmap, daily task counts, 8 gradient palettes

**Smart Task Management** — Global filter, priority tags, 6 date fields, time precision (HH:mm)

**Timeline View** — Day/Week views with 24-hour timeline layout, drag & drop, quick create

**Daily Note Integration** — Embedded editor with edit/preview mode toggle

**Sidebar View** — Task search, filter & sort + daily timeline

**Highly Customizable** — Festival colors, heatmap palettes, task display count, and more

**Dual Format** — Full support for Tasks plugin (emoji) and Dataview plugin (inline field) formats

**Recurring Tasks** — daily/weekly/monthly/yearly repeat with virtual instance display

**Feishu Sync** — Bidirectional task sync with Feishu (Lark) via OAuth 2.0

</div>

---

## Screenshots

Year View
![YearView](./docs/images/gantt-calendar-YearView.png)

Gantt View
![GanttView](./docs/images/gantt-view.png)

Week Timeline View
![WeekTimeline](./docs/images/gantt-calendar-weekview-timeline.png)

Sidebar View (Task List + Daily Timeline)
![SidebarView](./docs/images/gantt-calendar-sidebar-timeline.png)

Day View with Embedded Editor
![DayViewEditor](./docs/images/gantt-calendar-day-view.png)

## Installation

### Via BRAT

1. Install and enable the community plugin [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. Run the command `BRAT: Add a beta plugin for testing`
3. Enter the repository URL: `https://github.com/sustcsugar/obsidian-gantt-calendar`

### Manual

1. Download the latest [Release](https://github.com/sustcsugar/obsidian-gantt-calendar/releases)
2. Extract and copy the folder to `<your-vault>/.obsidian/plugins/`
3. Restart Obsidian and enable the plugin in Settings

## Quick Start

### Open the View

- Click the **sidebar icon** to open the main calendar view
- Use the **view switcher** in the toolbar to switch between views

### Create Tasks

Use the **Add Task** button in the toolbar, or manually write tasks in any Markdown file:

```markdown
- [ ] 🎯 Complete project documentation 📅 2025-12-20
```

Refresh the plugin and the task will appear in the calendar and task list.

## Features

### Layout

The plugin uses a **toolbar + content area** layout:

- **Toolbar Left** — View switcher (6 views)
- **Toolbar Center** — Current date range / title
- **Toolbar Right** — Functional buttons (navigation, sort, filter, add task, etc.)

### Task Formats

**Tasks Plugin Format (Emoji)**

```markdown
- [ ] 🎯 Complete project documentation ⏫ ➕ 2025-01-10 📅 2025-01-15
```

| Emoji | Meaning | Emoji | Meaning |
|-------|---------|-------|---------|
| `🎯` | Global filter marker | `🔺` | Highest priority |
| `⏫` | High priority | `🔼` | Medium priority |
| `🔽` | Low priority | `⏬` | Lowest priority |
| `➕` | Created date | `🛫` | Start date |
| `⏳` | Scheduled date | `📅` | Due date |
| `✅` | Completion date | `❌` | Cancelled date |
| `🔁` | Recurring task | - | - |

**Dataview Plugin Format (Inline Fields)**

```markdown
- [ ] 🎯 Complete project documentation [priority:: high] [created:: 2025-01-10] [due:: 2025-01-15]
```

| Field | Meaning | Field | Meaning |
|-------|---------|-------|---------|
| `priority::` | Priority | `created::` | Created date |
| `start::` | Start date | `scheduled::` | Scheduled date |
| `due::` | Due date | `completion::` | Completion date |
| `cancelled::` | Cancelled date | `repeat::` | Recurrence rule |

**Time Precision**

- Date: `YYYY-MM-DD` (e.g., `2026-04-27`)
- Time: `YYYY-MM-DD HH:mm` (e.g., `2026-04-27 14:00`)
- Tasks with time automatically display in timeline layout

**Recurring Task Syntax**

```markdown
🔁 every day              # Every day
🔁 every 3 days           # Every 3 days
🔁 every week on Monday   # Every Monday
🔁 every month on 15      # Every month on the 15th
🔁 every year on 01-01    # Every year on Jan 1
🔁 every weekday          # Every weekday
🔁 when done              # Restart after completion
```

### Year View

- **Year Overview** — 12 month cards showing full-year task distribution
- **Task Heatmap** — 5-level color gradient for task density
  - 8 palette options: blue / green / red / purple / orange / cyan / pink / yellow
  - 3D heatmap effect (off / slight / prominent)
- **Responsive Layout** — Auto-switches between 4×3 / 3×4 / 2×6 / 1×12 grids
- **Task Count** — Optional per-day task total display
- **Lunar Calendar** — Chinese lunar dates in month cards
- **Click Navigation** — Click a date to switch to Day View

### Month View

- **Monthly Calendar** — Standard month grid layout with daily tasks
- **Week Numbers** — ISO week numbers shown in the first column
- **Task Display Limit** — Configurable per-day task count (1–10) with "+N more" overflow
- **Task Popup** — Click a date to view all tasks for that day
- **Festival Display** — Solar/lunar/solar-term festivals with distinct colors
- **Drag & Drop** — Drag task cards between days to reschedule
- **Recurring Tasks** — Virtual instances for repeating tasks
- **Week Start** — Configurable Monday or Sunday start

### Week View

- **Dual Mode Layout**
  - **List Mode** — When no timed tasks exist, displays 7-column card layout
  - **Timeline Mode** — When timed tasks are detected, shows 24-hour vertical time grid with 7 days side by side
- **Today Highlight** — Current day is visually emphasized
- **Navigation** — Previous week / This week / Next week
- **Drag & Drop** — Drag tasks to any day or hour slot
- **Quick Create** — Hover over empty time slots to reveal "+" button for fast task creation
- **Current Time Indicator** — Red line marking the current time
- **Lunar Info** — Lunar dates and festivals in day headers

### Day View

- **Task List** — Detailed view of all tasks for the selected day
- **Timeline Layout** — When timed tasks exist, renders 0:00–23:00 time grid with tasks positioned at their hours
- **Drag & Drop** — Drag tasks to any hour slot to adjust time
- **Quick Create** — Hover over empty slots for "+" quick-create button
- **Current Time Indicator** — Red line at the current time
- **Daily Note Integration**
  - Embedded full editor (WorkspaceSplit mode)
  - Edit / Preview mode toggle
  - Auto-loads daily note for the selected date
  - Supports Obsidian core daily notes, Periodic Notes plugin, and custom paths
- **Resizable Split** — Draggable divider between task and note panes (horizontal or vertical layout)
- **Lunar Info Bar** — Lunar date, festivals, and solar terms

### Task View

- **Task List** — Centralized display of all tasks
- **Date Range Filter** — All / Today / This Week / This Month / Custom range
- **Time Field Selector** — Filter by any of 6 date fields
- **Multi-dimensional Filtering** — Status, priority, and tags (AND/OR/NOT operators)
- **Sorting** — 7 sort fields with asc/desc toggle
- **Persistent State** — Filter and sort settings persist across refreshes

### Gantt View

- **Interactive Gantt Bars** — Custom SVG rendering engine
  - Drag entire bar to shift dates
  - Drag endpoints to adjust start/end dates
  - Drag to change progress percentage
  - Click to open task edit modal
- **Navigation** — Jump to today / scroll left / scroll right
- **Incremental Refresh** — Smart update strategy to avoid full redraws
- **Tag & Status Filtering** — Filter gantt bars by tags and status
- **Configurable Fields** — Choose which date fields map to gantt start/end

### Sidebar View

Two-tab sidebar for quick task access:

**Task List Tab**
- Keyword search (debounced)
- Multi-dimensional filters: status, priority, tags (OR/AND), date range
- Sort by: priority / due date / start date
- Click task to navigate to source file

**Daily Timeline Tab**
- 24-hour timeline for today's timed tasks
- All-day task section
- Current time indicator line
- Drag & drop to adjust time
- Quick create on empty slots

### Context Menu

Right-click any task for:

- **Edit Task** — Full edit modal (description, priority, dates, repeat, tags)
- **Create Note** — Generate a wiki-linked note from the task (same name or alias)
- **Set Priority** — 6 levels: highest / high / medium / normal / low / lowest
- **Set Status** — Custom statuses (important, question)
- **Postpone** — Delay 1/3/7 days (from due date or from today)
- **Cancel / Restore** — Toggle cancelled state
- **Delete** — Remove task from markdown file

### Feishu (Lark) Sync

- **Bidirectional Sync** — Push local tasks to Feishu and pull Feishu tasks to Obsidian
- **OAuth 2.0** — Secure authentication with automatic token refresh
- **Push Filters** — Filter by file paths, completion status, and date
- **Conflict Resolution** — Multiple strategies: local-wins, remote-wins, newest-wins, manual
- **Auto Sync** — Configurable automatic sync interval
- **Sync Result Modal** — Detailed per-task sync results with statistics

## Roadmap

### Task Parsing
- [x] Tasks and Dataview dual-format parsing
- [x] Global filter markers
- [x] Task tags
- [x] Task description
- [x] 6 priority levels
- [x] 6 date fields with time precision (HH:mm)
- [x] Recurring task recognition and display
- [ ] Nested tag recognition
- [ ] Multi-line task recognition
- [ ] Sub-task recognition
- [ ] Task dependency relationships

### Views
- [x] Day View with Daily Note integration (embedded editor)
- [x] Day View timeline layout
- [x] Week View dual mode (list + timeline)
- [x] Week/Month View drag & drop
- [x] Year View heatmap and task count
- [x] Task View (multi-dimensional filter + date range)
- [x] Gantt View (drag + incremental refresh + navigation)
- [x] Sidebar View (task list + daily timeline)

### Toolbar
- [x] View switcher
- [x] Tag / status / priority filtering
- [x] Date navigation buttons
- [x] Time field selector
- [x] Add task button

### Interactions
- [x] Task cards (description, tags, priority)
- [x] Context menu (edit, create note, priority, status, postpone, cancel, delete)
- [x] Hover tooltips
- [x] Quick create on empty time slots

### Future Plans (v2.0.0)
- [ ] Third-party calendar subscription (Feishu Calendar, Outlook Calendar)
- [ ] Microsoft To Do sync
- [ ] Google / Apple Calendar via CalDAV

## Contributing

Issues and Pull Requests are welcome!

## License

[MIT](LICENSE)

---

<div align="center">

Found a bug or have a suggestion? Open an [Issue](https://github.com/sustcsugar/obsidian-gantt-calendar/issues)

Enjoying the plugin? Give it a ⭐!

</div>
