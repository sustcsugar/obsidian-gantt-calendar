# Task Card Rendering Analysis

## Overview

This document provides a comprehensive analysis of how task cards are rendered across different views in the obsidian-gantt-calendar plugin, with a focus on task description sources and rendering differences.

## Table of Contents

1. [Task Data Flow](#task-data-flow)
2. [Task Description Processing](#task-description-processing)
3. [View-Specific Rendering](#view-specific-rendering)
4. [Key Differences Summary](#key-differences-summary)
5. [Rendering Flow Diagram](#rendering-flow-diagram)

---

## Task Data Flow

### Data Source

All views retrieve task data from the centralized cache system:

```
TaskCacheManager (Singleton)
    ↓
getAllTasks()
    ↓
Array<TaskItem>
```

**Location**: `src/taskManager.ts` (TaskCacheManager class)

**Task Parsing**: `src/tasks/taskParser.ts`
- Scans all markdown files in batches of 50
- Parses both Tasks plugin (emoji) and Dataview plugin (field) formats
- Creates `TaskItem` objects with cleaned descriptions

### Supported Task Formats

#### Tasks Format (Emoji-based)
```markdown
- [ ] 🎯 Task title ⏫ ➕ 2025-01-10 📅 2025-01-15
```

#### Dataview Format (Field-based)
```markdown
- [ ] 🎯 Task title [priority:: high] [created:: 2025-01-10] [due:: 2025-01-15]
```

---

## Task Description Processing

### 1. Initial Cleaning (Parser Level)

**Location**: `src/tasks/taskParser.ts` - `extractTaskDescription()` function

The parser removes all metadata from the raw task line:

| Pattern | Removed |
|---------|---------|
| Priority emojis | `🔺`, `⏫`, `🔼`, `🔽`, `⏬` |
| Date emojis + dates | `➕ 2025-01-10`, `📅 2025-01-15`, `🛫`, `⏳`, `✅`, `❌` |
| Dataview fields | `[priority:: high]`, `[due:: 2025-01-15]` |
| Extra whitespace | Collapsed to single space |

**Result**: Clean description text stored in `TaskItem.description`

**Example**:
```typescript
Input:  "- [ ] 🎯 Review project proposal ⏫ ➕ 2025-01-10 📅 2025-01-15"
Output: "Review project proposal"
```

### 2. Base Calendar Renderer

**Location**: `src/calendar/BaseCalendarRenderer.ts`

Provides shared methods for all views:

#### `cleanTaskDescription(raw: string): string`

Additional cleaning layer (though parser already handles most):
```typescript
protected cleanTaskDescription(raw: string): string {
    let text = raw;
    // Remove priority emojis
    text = text.replace(/\s*(🔺|⏫|🔼|🔽|⏬)\s*/g, ' ');
    // Remove date emojis with dates
    text = text.replace(/\s*(➕|🛫|⏳|📅|❌|✅)\s*\d{4}-\d{2}-\d{2}\s*/g, ' ');
    // Remove Dataview fields
    text = text.replace(/\s*\[(priority|created|start|scheduled|due|cancelled|completion)::[^\]]+\]\s*/g, ' ');
    // Collapse multiple spaces
    text = text.replace(/\s{2,}/g, ' ').trim();
    return text;
}
```

#### `renderTaskDescriptionWithLinks(container: HTMLElement, text: string): void`

Renders clickable Obsidian links, Markdown links, and URLs:

**Supported Patterns**:
- `[[Note]]` - Internal note link
- `[[Note|Alias]]` - Internal link with display text
- `[Text](url)` - Markdown link
- `http://example.com` - Bare URL

Each link is rendered as a clickable `<a>` element with appropriate handlers.

---

## View-Specific Rendering

### TaskView

**Location**: `src/views/TaskView.ts`

**Layout**: Full-width list view with filtering controls

**Description Rendering**:
```typescript
const cleaned = task.description;

// Optionally prepend global filter
const displayText = this.plugin?.settings?.showGlobalFilterInTaskText && gf
    ? `${gf} ${cleaned}`
    : cleaned;

// Render with link support
this.renderTaskDescriptionWithLinks(taskTextEl, cleaned);
```

**Displayed Elements**:
- Task description with clickable links
- Priority indicator (colored bar)
- All date properties (created, start, scheduled, due, completion, cancelled)
- File path and line number
- Warning icon for overdue tasks
- Checkbox for completion toggle
- Click-to-open file functionality

**Unique Features**:
- Rich filtering options (status, priority, dates, file path)
- Context menu for quick actions
- Inline task editing capability

---

### DayView

**Location**: `src/views/DayView.ts`

**Layout**: Split screen (optional) or tasks-only view

**Description Rendering**: Identical to TaskView

**Task Selection Logic**:
```typescript
// Filters tasks based on dateFilterField setting
// Options: createdDate, startDate, scheduledDate, dueDate, completionDate, cancelledDate
const tasksForDay = allTasks.filter(task => {
    const taskDate = task[this.plugin.settings.dateFilterField];
    return isSameDay(taskDate, viewDate);
});
```

**Displayed Elements**: Same as TaskView

**Unique Features**:
- Optional split view with Daily Note
- Date-specific task focus
- Previous/Next day navigation

---

### WeekView

**Location**: `src/views/WeekView.ts`

**Layout**: 7-column grid (Monday-Sunday)

**Description Rendering**:
```typescript
const cleaned = task.description;
this.renderTaskDescriptionWithLinks(taskTextEl, cleaned);
```

**Displayed Elements**:
- Task description with clickable links (compact)
- Priority indicator (colored dot)
- Checkbox

**Unique Features**:
- Tooltip on hover showing full task details
- Drag-and-drop between days
- Compact display (no extra metadata visible)
- Date-based filtering per column

**Visual Style**:
- Smaller font size
- Single line display
- Color-coded by priority

---

### MonthView

**Location**: `src/views/MonthView.ts`

**Layout**: Calendar grid (7 columns × 5-6 rows)

**Description Rendering**: Same as WeekView

**Task Limiting**:
```typescript
const maxTasks = this.plugin.settings.monthViewTaskLimit || 3;
const visibleTasks = dayTasks.slice(0, maxTasks);
const remainingCount = dayTasks.length - maxTasks;

// Show "+X more" if exceeds limit
if (remainingCount > 0) {
    const moreEl = dayCell.createEl('div', { cls: 'more-tasks' });
    moreEl.textContent = `+${remainingCount} more`;
}
```

**Displayed Elements**:
- Task description with links (very compact)
- Checkbox
- "+X more" indicator for overflow tasks

**Unique Features**:
- Tooltip on hover with full task details
- Task count limits per day (configurable)
- Navigate between months
- Today indicator

**Visual Style**:
- Smallest font size
- Truncated text with ellipsis
- Minimalist design

---

### GanttView

**Location**: `src/views/GanttView.ts`

**Layout**: Left panel (task cards) + Right panel (timeline)

**Description Rendering**:
```typescript
const cleaned = item.task.description;
let fullDescription = '';

// Optionally prepend global filter
if (this.plugin?.settings?.showGlobalFilterInTaskText && gf) {
    fullDescription = gf + ' ';
    taskCard.appendText(gf + ' ');
}

fullDescription += cleaned;

// Set tooltip on hover
taskCard.setAttr('title', fullDescription);

// Render with links
this.renderTaskDescriptionWithLinks(taskCard, cleaned);
```

**Displayed Elements**:
- Task description with clickable links
- Priority indicator
- Date range (start → due)
- Completion checkbox
- Visual timeline bar (duration)

**Unique Features**:
- Timeline visualization
- Date range display
- Expandable/collapsible tasks
- Drag-to-resize functionality
- Native browser tooltip (title attribute)

---

### YearView

**Location**: `src/views/YearView.ts`

**Layout**: 12 month cards in grid

**Description Rendering**: **Does NOT show task descriptions**

**Displayed Elements**:
- Task count per day (heatmap style)
- Month overview only

**Unique Features**:
- Heatmap visualization (color intensity = task count)
- Yearly overview
- Navigate to other views by clicking month
- No task details shown

**Purpose**: High-level calendar overview, not task management

---

## Key Differences Summary

| View | Description Display | Metadata Visible | Links Clickable | Tooltip | Compactness |
|------|---------------------|------------------|-----------------|---------|-------------|
| **TaskView** | Full text | All dates, priority, file path | ✓ | ✓ | Low |
| **DayView** | Full text | All dates, priority, file path | ✓ | ✓ | Low |
| **WeekView** | Full text | Priority only | ✓ | ✓ | Medium |
| **MonthView** | Truncated | None | ✓ | ✓ | High |
| **GanttView** | Full text | Priority, date range | ✓ | ✓ (native) | Low |
| **YearView** | **None** | None | N/A | N/A | N/A |

### Task Description Source

**All views** use the same description source:
```typescript
task.description  // Pre-cleaned by parser
```

The description is cleaned **once during parsing** and stored in the cache. Views do not perform additional cleaning (though `cleanTaskDescription()` is available in the base class).

### Global Filter Impact

When `showGlobalFilterInTaskText` setting is enabled:

```typescript
// Affected views: TaskView, DayView, GanttView
const displayText = globalFilter + ' ' + task.description;
```

This prepends the global filter tag (e.g., `#project`) to the displayed description.

---

## Rendering Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Markdown File                             │
│  - [ ] 🎯 Task title ⏫ ➕ 2025-01-10 📅 2025-01-15         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              TaskParser.extractTaskDescription()            │
│  • Remove priority emojis                                   │
│  • Remove date emojis + dates                               │
│  • Remove Dataview fields                                   │
│  • Collapse whitespace                                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              TaskItem.description = "Task title"            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   TaskCacheManager                          │
│              (Caches all tasks in memory)                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                     View Instance                           │
│  (TaskView, DayView, WeekView, MonthView, GanttView)       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│         renderTaskDescriptionWithLinks(container, text)     │
│  • Parse [[links]], [markdown](urls), http://urls           │
│  • Render clickable <a> elements                            │
│  • Attach event handlers                                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Rendered DOM                              │
│  <div class="task-text">                                    │
│    <a href="...">Task title</a> with <a>...</a>            │
│  </div>                                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Code References

| Component | File Location | Key Methods |
|-----------|---------------|-------------|
| Task Parser | `src/tasks/taskParser/main.ts` | `parseTasksFromListItems()`, `parseSingleTaskLine()` |
| Parser Utils | `src/tasks/taskParser/utils.ts` | `extractTaskDescription()` |
| Cache Manager | `src/taskManager.ts` | `getAllTasks()`, `updateFileCache()` |
| Base Renderer | `src/views/BaseViewRenderer.ts` | `cleanTaskDescription()`, `renderTaskDescriptionWithLinks()` |
| Task View | `src/views/TaskView.ts` | `renderTask()` |
| Day View | `src/views/DayView.ts` | `renderTasks()` |
| Week View | `src/views/WeekView.ts` | `renderDayTasks()` |
| Month View | `src/views/MonthView.ts` | `renderDayTasks()` |
| Gantt View | `src/views/GanttView.ts` | `renderTaskCard()` |
| Year View | `src/views/YearView.ts` | `render()` |

---

## Settings That Affect Description Rendering

| Setting | Type | Impact |
|---------|------|--------|
| `showGlobalFilterInTaskText` | boolean | Prepends global filter to description |
| `monthViewTaskLimit` | number | Limits visible tasks per day in MonthView |
| `dateFilterField` | string | Determines which date field filters tasks in date-based views |

---

## Conclusion

The task card rendering system is highly centralized and consistent:

1. **Single source of truth**: All views use `task.description` from the cache
2. **One-time cleaning**: Descriptions are cleaned during parsing, not during rendering
3. **Consistent link rendering**: All views use `renderTaskDescriptionWithLinks()` for clickable links
4. **View-specific display**: Differences are only in visual layout and metadata display density
5. **Performance optimization**: Cache-based system prevents re-parsing on view changes

The main variation between views is **display density** and **metadata visibility**, not the underlying description processing or source.
