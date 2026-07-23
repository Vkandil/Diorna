# Diorna — Product Specification

*Personal knowledge & productivity suite for Windows*

**Document version:** 2.1 — final
**Status:** Approved for build. No open decisions.
**Platform:** Windows desktop only
**Audience:** Development team (complete build, from empty repository to signed installer)

---

## 0. How to read this document

This is a **complete and binding specification**. Every product decision has been made. Where earlier drafts listed alternatives, this version states a single choice — see **Appendix A** for the settled decisions and their rationale. The team is not expected to re-open them.

Requirements are numbered (`REQ-XXX-N`) and are all **mandatory** unless explicitly marked *Optional*. Non-functional requirements are numbered `NFR-N`. Anything not specified here is left to the team's professional judgement, provided it complies with §16 (engineering standards).

Nothing is left blank. The product is named **Diorna**, and that name is final for the purposes of this build.

---

## 1. Overview

Diorna is a **local-first Windows desktop application** that unifies five modules a student-and-builder needs daily, in one place, with one shared data layer:

| # | Module | Purpose |
|---|---|---|
| A | **Notes** | Rich, block-based note-taking — Notion-grade editing, Obsidian-grade linking, tuned for coursework |
| B | **Maps** | Free-form spatial canvases where the user positions and connects ideas on an X/Y plane |
| C | **Calendar & Tasks** | Day / week / month planning with category filters |
| D | **Daily Grid** | Spreadsheet-style recurring-habit tracker with daily completion scoring |
| E | **Recap** | Automatically generated narrative reports of what the user accomplished each month and year |

Everything lives inside **Workspaces**, which enforce a hard separation between the user's **Student** life and **Personal / Projects** life.

### 1.1 Product principles

These govern every ambiguous implementation choice.

| Principle | Consequence for implementation |
|---|---|
| **Local-first** | All data lives on the user's disk. Fully functional offline. No account, no sign-up, no server. |
| **Files you own** | Notes are plain Markdown on disk; maps are portable JSON. The database is a rebuildable index, never the sole source of truth. |
| **Keyboard-first** | Every frequent action has a shortcut. The command palette can reach everything. A power user should rarely need the mouse outside the Maps module. |
| **Zero-friction capture** | Creating a note, task, or habit entry never takes more than two keystrokes. |
| **Speed is a feature** | See §14. Perceived latency is treated as a bug, not a trade-off. |
| **Privacy by construction** | Zero telemetry. Outbound model calls happen only for user-triggered recap generation or a confirmed Diorna AI request, and can be routed to a fully local model. |
| **Open source** | Clean module boundaries, documented APIs, reproducible build, no proprietary service in the core. |

### 1.2 Target user

A graduate student who simultaneously runs personal projects and ventures. They need one tool that handles coursework (dense technical notes, mathematics, code, lecture PDFs, deadlines, revision) and personal life (projects, training, habits) **without ever mixing the two contexts**.

---

## 2. Out of scope

Explicitly **not** to be built. Listed to prevent scope drift; proposals to add them should be declined.

- ❌ **Passive activity tracking of any kind.** No screen recording, no app or window usage tracking, no browser history capture, no keystroke logging, no automatic file-system watching outside the vault, no "how long were you in this app" metrics.
- ❌ Automatic ingestion from external tools (Git, IDE, email, messaging) — v1 and v2.
- ❌ Real-time multi-user collaboration, sharing links, comments, or permissions.
- ❌ macOS, Linux, mobile, web, or browser-extension clients.
- ❌ Cloud sync, hosted accounts, or any server component.
- ❌ Code execution inside notes.
- ❌ Passive AI writing assistance inside the editor (autocomplete or automatic rewrite). Diorna AI is an explicit command surface governed by §9.6.

> **The Recap module derives its content exclusively from data the user entered in the app** — tasks, habits, metrics, calendar events, notes, flashcard reviews. Nothing is observed in the background. This is a product commitment, not an implementation detail.

---

## 3. Glossary

| Term | Definition |
|---|---|
| **Vault** | The single root folder on disk holding all user data. |
| **Workspace** | Top-level container enforcing hard data separation. Two are seeded (`Student`, `Personal`); the user can create, rename, recolor, and delete more. Nothing crosses workspace boundaries except application settings. |
| **Note** | A Markdown document with YAML frontmatter, composed of blocks. |
| **Block** | The atomic editable unit of a note (paragraph, heading, image, code, table…). |
| **Map** | A user-authored spatial canvas. Nodes sit at explicit X/Y coordinates and are joined by edges. |
| **Node** | An element on a Map: note reference, text card, image, link, group, or sub-map. |
| **Item** | A task or an event in the Calendar module (one shared entity, two kinds). |
| **Category** | User-defined colored label shared across items, habits, and metrics (Work, Study, Sport…). Drives all filtering and color coding. |
| **Habit** | A recurring daily item; one row of the Daily Grid. |
| **Entry** | One habit × one day cell (checked, unchecked, or a numeric value). |
| **Metric** | A named numeric series with a unit (bench press kg, weight kg, sleep h) used for progress tracking and charts. |
| **Recap** | A generated monthly or yearly narrative report, stored as a note. |

---

## 4. Application shell

### 4.1 Window & layout

**REQ-SHELL-1** — Single main window, resizable, minimum 1024 × 640, remembering size, position, monitor, and maximised state across restarts. Multi-monitor aware (restores onto the correct display, falls back to primary if that display is gone).

**REQ-SHELL-2** — Persistent left sidebar, collapsible (`Ctrl+B`) and resizable by drag, containing top to bottom:
1. Workspace switcher — current workspace name, its color dot, dropdown listing all workspaces plus "New workspace…"
2. Module rail — **Notes · Maps · Calendar · Daily · Recap**, each with an icon and a keyboard shortcut badge
3. Context panel for the active module (note tree, list of maps, category legend, habit list…)
4. Settings and vault indicator, pinned at the bottom

**REQ-SHELL-3** — Tabbed main area. Any note, map, or module view opens as a tab. Tabs are reorderable by drag, pinnable, closable (`Ctrl+W`), and restored on restart. `Ctrl+Tab` cycles by recency.

**REQ-SHELL-4** — Split view: any tab can be split horizontally or vertically, up to four panes. Panes are individually resizable and each keeps its own tab strip. Layout is restored on restart.

**REQ-SHELL-5** — Right-hand context panel, collapsible, showing per-context information: backlinks and outline for notes, node inspector for maps, item details for the calendar, habit statistics for the daily grid.

### 4.2 Command palette & quick capture

**REQ-SHELL-6** — Command palette (`Ctrl+K`): fuzzy search over notes, maps, tasks, commands, and settings. Ranked by recency then relevance. Every command in the application must be reachable from it, and each entry displays its shortcut. Prefixes: `>` commands only, `#` tags, `@` courses, `/` files.

**REQ-SHELL-7** — Global quick capture (`Ctrl+Alt+Space`, registered system-wide even when the app is not focused): a small always-on-top window that accepts a line of text and routes it by prefix — plain text → inbox note, `[]` → task, `#tag` → tagged note. Closes on `Esc` or submit and returns focus to the previous application. Must work when the main window is minimised or the app is in the tray.

**REQ-SHELL-8** — System tray icon with: Show/Hide, Quick capture, Today's completion score, Quit. Closing the main window minimises to tray by default (setting to quit instead).

### 4.3 Workspace isolation

**REQ-SHELL-9** — Switching workspace (`Ctrl+Shift+1…9`) swaps the entire application context. After a switch, **no note, map, task, event, habit, metric, tag, category, template, or search result from the previous workspace is visible or reachable anywhere in the UI**, including the command palette, recent files, and quick capture.

**REQ-SHELL-10** — Isolation is enforced in the data-access layer: every query is scoped by `workspace_id` by construction, not by each call site remembering to filter. A test suite must prove isolation for every entity type.

**REQ-SHELL-11** — Each workspace has a home dashboard, opened by default when it is activated:
- **Student** — next deadlines and exams (countdown, color-coded by course), courses grid, flashcards due today, today's completion score, recently edited notes
- **Personal** — today's agenda, today's completion score with the habit list, active projects, current streaks, recently edited notes

Widgets are reorderable by drag and individually hideable.

---

## 5. Module A — Notes

### 5.1 Editor

**REQ-NOTE-1** — Block-based WYSIWYG editor. Blocks are inserted via a slash menu (`/`) with fuzzy search, reordered by drag handle or `Alt+↑/↓`, and selected/duplicated/deleted as units. Multi-block selection supported.

**REQ-NOTE-2** — Required block types:

| Category | Blocks |
|---|---|
| **Text** | Paragraph · Heading 1–4 · Bulleted list · Numbered list · Checkbox list · Quote · Callout (icon + color, 6 presets) · Divider · Toggle (collapsible section) |
| **Technical** | Code block with syntax highlighting, language selector, and copy button · Inline code · **Math block and inline math (LaTeX)** · Mermaid diagram block |
| **Media** | Image · Video (local file + YouTube/Vimeo embed) · Audio player · **PDF (inline viewer)** · Generic file attachment with icon and size |
| **Structure** | Table (add/remove rows and columns, resize, alignment, header row) · Columns (2–4 side by side, resizable) · Note embed (live transclusion) · Web bookmark card (title, description, favicon, thumbnail) · Table of contents (auto from headings) |
| **Study** | Flashcard block (see REQ-STUD-5) · Highlight/cloze inline mark |

**REQ-NOTE-3** — Markdown input shortcuts while typing: `# `, `## `, `- `, `1. `, `[] `, `> `, ` ``` `, `$$`, `---`, `**bold**`, `*italic*`, `~~strike~~`, `==highlight==`, `` `code` ``.

**REQ-NOTE-4** — Images: drag-and-drop from Explorer, clipboard paste (including screenshots from `Win+Shift+S`), and file picker. Files are copied into the workspace `attachments/` folder and referenced by relative path. Resize by drag, alignment left/center/right, optional caption, click to open full-screen lightbox.

**REQ-NOTE-5** — PDF block: embedded viewer with page navigation, zoom, page thumbnails, and text selection. Selecting text offers **"Quote into note"**, which inserts a quote block carrying a page-anchored back-link to the source PDF. Essential for working from lecture slides.

**REQ-NOTE-6** — Autosave, debounced ≤ 1 s, plus save on blur and on window close. No explicit save action exists. Local revision history: the last 50 revisions or 30 days per note, whichever is greater, with a diff view and one-click restore.

**REQ-NOTE-7** — Editor comfort features: focus mode (hides all chrome), typewriter scrolling, configurable line width (narrow/normal/wide/full), word and character count, reading-time estimate, and a document outline in the right panel.

### 5.2 Linking & organisation

**REQ-NOTE-8** — Wiki-links: typing `[[` opens autocomplete over note titles, showing folder and course for disambiguation. `[[Note|alias]]` supported. Renaming a note rewrites every reference to it across the workspace.

**REQ-NOTE-9** — Creating a link to a non-existent note creates it on click, in the same folder, pre-titled.

**REQ-NOTE-10** — Backlinks panel: every note linking to the current one, with the surrounding sentence as context, grouped by source note.

**REQ-NOTE-11** — Unlinked mentions: notes whose text contains the current note's title without a link, with one-click conversion.

**REQ-NOTE-12** — Tags (`#tag`), including nested tags (`#course/statistics/inference`). A tag browser lists all tags hierarchically with counts and supports rename-across-workspace.

**REQ-NOTE-13** — Frontmatter properties edited through a typed UI panel, not raw YAML. Types: text, number, date, checkbox, single-select, multi-select, URL, and note-reference. Properties are filterable and sortable in list views.

**REQ-NOTE-14** — Folder tree with unlimited nesting, drag-and-drop, rename, duplicate, and delete-to-trash. Files can also be starred/pinned to a favourites section.

**REQ-NOTE-15** — **Graph view** (auto-generated, read-only): nodes = notes, edges = links, sized by connection count. Filters by tag, folder, and course; adjustable link depth from the active note; click to open. *This is distinct from the Maps module (§6) and must not be presented as a substitute for it.*

### 5.3 Search

**REQ-NOTE-16** — Full-text search over note body, title, tags, and properties, with highlighted excerpts in results.

**REQ-NOTE-17** — Query syntax: `tag:`, `folder:`, `course:`, `property:value`, `created:>2026-01-01`, `updated:`, `has:image`, `is:task`, quoted phrases, and boolean `AND` / `OR` / `NOT` with parentheses.

**REQ-NOTE-18** — Saved searches, pinnable in the sidebar, live-updating.

**REQ-NOTE-19** — Search-and-replace across a folder or the whole workspace, with a preview of every affected line and undo.

### 5.4 Student features

These make the Notes module genuinely fit for coursework. All mandatory, all shipping in v1.

**REQ-STUD-1** — **Courses.** A first-class entity with name, code, color, semester, instructor, ECTS credits, and schedule. A note can be assigned to a course. Each course gets an auto-generated dashboard: its notes grouped by week, upcoming deadlines, linked maps, flashcard statistics, and a progress bar for the semester.

**REQ-STUD-2** — **Templates.** User-editable, with variables `{{date}}`, `{{time}}`, `{{title}}`, `{{course}}`, `{{week}}`, `{{semester}}`, and cursor placement `{{cursor}}`. One template can be set as the default for a course, so a new lecture note is one keystroke. Ship four built-in templates: Lecture, Exercise session, Exam preparation, Project.

**REQ-STUD-3** — **First-class mathematics.** LaTeX rendering must be fast and reliable: inline `$…$`, display `$$…$$`, a searchable symbol picker, common-macro autocomplete, error highlighting for malformed expressions, and correct rendering in PDF export. Equation numbering and `\ref` supported.

**REQ-STUD-4** — **Code.** Syntax highlighting for at least Python, R, SQL, JavaScript, TypeScript, Bash, JSON, YAML, and LaTeX. Line numbers toggle, word wrap toggle, copy button, and an optional filename caption.

**REQ-STUD-5** — **Flashcards with spaced repetition.** Two authoring forms: a flashcard block (front/back) and inline cloze deletions (`{{c1::hidden text}}`) inside any paragraph. A dedicated Review view surfaces due cards with a 4-grade response (Again / Hard / Good / Easy) driving an SM-2 scheduling algorithm. Cards are filterable by course, tag, and note. Review statistics (cards reviewed, retention rate, streak) feed the Recap module. Cards always link back to their source note.

**REQ-STUD-6** — **Bibliography.** Import a `.bib` file or a Zotero CSL-JSON export into a per-workspace reference library. Insert citations with `@` autocomplete. A reference-list block auto-generates the bibliography for the current note. Citation styles: APA, IEEE, and Harvard.

**REQ-STUD-7** — **Deadlines.** A note property of type `deadline` automatically creates a linked task in the Calendar. Editing the date in either location updates the other. Deleting the note offers to keep or delete the task.

**REQ-STUD-8** — **Exam & deadline countdown** widget on the Student dashboard: the next ten items, sorted, color-coded by course, with days remaining and an urgency treatment inside seven days.

**REQ-STUD-9** — **Export.** A note, a folder, or a course to PDF and to Markdown, with mathematics, images, tables, code, and callouts rendered correctly. PDF export offers a title page, page numbers, and a table of contents.

---

## 6. Module B — Maps

> This module is the product's **primary differentiator**. It is a *manual, authored, spatial* organisation tool: the user drags things onto an infinite plane and arranges them meaningfully. It is **not** the auto-generated graph view of REQ-NOTE-15, and it must never be conflated with it in the UI or in the code.

### 6.1 Reference scenario — build and test against this

> The user creates a map named **"Gym"**. On it they place a node **"Programme"** holding their training programme; that node is connected by edges to several nodes holding the details of individual sessions. Elsewhere on the same canvas, unconnected, they place a node **"Stretching"** holding their stretching routines. They freely drag every node along the X and Y axes, and add new nodes wherever they choose. Opening the "Programme" node's sub-map reveals a second canvas detailing each training block.

Acceptance for milestone M2 is the ability to reproduce this scenario end to end, close the app, reopen it, and find every node at exactly the coordinates where it was left.

### 6.2 Canvas

**REQ-MAP-1** — Infinite pannable, zoomable canvas. Zoom 10 %–400 % via `Ctrl`+scroll, pinch, and `Ctrl+±`. Pan via space-drag, middle-mouse drag, two-finger scroll, and scrollbars. Commands: zoom to fit, zoom to selection, reset zoom.

**REQ-MAP-2** — Node position is stored as explicit `x`, `y` floats and persists exactly. **No auto-layout is ever applied to user-placed nodes**, at any time, for any reason.

**REQ-MAP-3** — Selection: click, `Shift`+click to extend, marquee drag on empty canvas, `Ctrl+A` for all. Group move, copy, cut, paste (pasting offsets by a small delta), duplicate (`Ctrl+D`), delete.

**REQ-MAP-4** — Alignment and distribution: align left / center / right / top / middle / bottom; distribute horizontally and vertically; match width and height. Optional snap-to-grid with configurable size, and smart alignment guides that appear while dragging.

**REQ-MAP-5** — Undo/redo, minimum 100 steps, covering node creation, movement, resizing, styling, edges, and deletion.

**REQ-MAP-6** — Minimap in the bottom-right corner, toggleable, click-to-navigate.

**REQ-MAP-7** — Read-only presentation mode: hides all chrome and steps through nodes in a user-defined order, one per keypress, animating the camera between them.

### 6.3 Nodes

**REQ-MAP-8** — Node types:

| Type | Behaviour |
|---|---|
| **Note node** | References an existing note. Shows the title and a live content preview. Double-click opens the full note in the right panel; `Ctrl`+double-click opens it in a new tab. Edits propagate both ways in real time. |
| **Text card** | Free Markdown text living only on the canvas. |
| **Image node** | Image file, resizable, preserving aspect ratio by default. |
| **Link node** | External URL with favicon, title, and description fetched once and cached. |
| **Group / Frame** | Labeled, colored rectangle. Moving it moves its contents. Collapsible to a title bar. |
| **Sub-map node** | Opens another map, enabling hierarchy. Breadcrumb navigation shows the full path; maps can nest at least five levels deep. |
| **Task node** | *Optional, if effort allows:* references a task from the Calendar module and reflects its completion state. |

**REQ-MAP-9** — Every node supports: free resize by corner and edge handles, background color (12-swatch palette), border color and width, an optional emoji or icon, a collapse toggle (title only vs full preview), and a lock toggle preventing accidental movement.

**REQ-MAP-10** — Creation methods: double-click empty canvas, toolbar button, drag a note from the sidebar onto the canvas, paste an image or a URL directly onto the canvas, and `Ctrl+Enter` to create a connected node from the current selection.

### 6.4 Edges

**REQ-MAP-11** — Connect by dragging from an anchor handle on a node's border to another node, or to empty canvas to create and connect a new node in one gesture.

**REQ-MAP-12** — Edge properties: optional label, color, width, line style (solid, dashed, dotted), and arrowheads (none, one-way, bidirectional).

**REQ-MAP-13** — Edges reroute automatically as nodes move. Routing modes: bezier (default), straight, and orthogonal.

### 6.5 Persistence & portability

**REQ-MAP-14** — Each map is one JSON file at `<workspace>/maps/*.canvas`. **The format must be compatible with the Obsidian Canvas JSON specification**, so a user's maps remain readable by other tools. Any proprietary extensions live in an additive namespaced field that other readers can ignore.

**REQ-MAP-15** — Unlimited maps per workspace, organised in sidebar folders, searchable by name and by node content.

**REQ-MAP-16** — Export a map to PNG (configurable scale, transparent or solid background) and to SVG.

---

## 7. Module C — Calendar & Tasks

### 7.1 Views

**REQ-CAL-1** — Four views, switchable by segmented control and by keyboard (`D`, `W`, `M`, `A`):

- **Day** — hourly timeline over 24 h, current-time indicator, configurable visible hours (default 07:00–23:00 with scroll to the rest)
- **Week** — seven columns × hourly rows, week starting Monday (configurable), all-day row pinned at the top
- **Month** — classic grid, up to four items per cell with a "+N more" overflow popover
- **Agenda** — flat chronological list of everything upcoming, grouped by day

**REQ-CAL-2** — Navigation: "Today" button, arrow keys and on-screen arrows for previous/next period, and a date picker for jumping. Mini-month calendar in the sidebar for orientation and quick jumps.

### 7.2 Items

**REQ-CAL-3** — One `item` entity with two kinds sharing a single timeline:
- **Event** — a start and an end time, or all-day
- **Task** — a due date, optionally a due time, and a completion state

**REQ-CAL-4** — Item fields: title, rich-text description, **category (required)**, date and time, duration, priority (none / low / medium / high), subtask checklist, linked note, linked course, recurrence rule, and reminders.

**REQ-CAL-5** — Recurrence via RRULE: daily, weekly on selected weekdays, monthly by date or by weekday position, yearly; ending after N occurrences or on a date. Individual occurrences can be edited, moved, or skipped without breaking the series; the user is asked "this occurrence / this and following / all".

**REQ-CAL-6** — Direct manipulation: drag an item to another day or time; drag its bottom edge to change duration; `Ctrl`+drag to duplicate. Changes persist immediately with optimistic UI and undo.

**REQ-CAL-7** — Quick add with natural-language parsing. `gym tomorrow 6pm #sport` creates a Sport event tomorrow at 18:00. The parser handles relative dates (today, tomorrow, next monday, in 3 days), absolute dates in several formats, times and ranges (`6pm`, `18:00`, `2-4pm`), durations (`for 1h30`), `#category`, `!priority`, and `every monday` for recurrence. Parsed elements are highlighted live in the input as the user types, so the interpretation is always visible before committing.

**REQ-CAL-8** — Completing a task strikes it through and keeps it visible for the rest of the day; a "hide completed" toggle is available per view.

**REQ-CAL-9** — Overdue tasks are visually flagged and collected in a persistent "Overdue" section at the top of the current view until completed or rescheduled, with a one-click "move all to today".

**REQ-CAL-10** — Time-blocking: dragging an unscheduled task from the sidebar onto the calendar assigns it a time slot, converting it into a scheduled task without losing its task nature.

**REQ-CAL-11** — Reminders fire as **native Windows toast notifications**, with configurable lead time per item and a global default. Clicking the toast opens the item.

### 7.3 Categories & filtering

**REQ-CAL-12** — User-defined categories with name, color, and icon, managed in settings and reorderable. Seeded per workspace:
- **Student** — Courses, Assignments, Exams, Revision, Admin
- **Personal** — Work, Projects, Sport, Health, Social, Errands

**REQ-CAL-13** — A filter bar of toggleable category chips sits above every calendar view. Multi-select; state persists per view and per workspace. `Alt`+click a chip isolates that category alone; a "reset" control restores all.

**REQ-CAL-14** — Item color derives from its category everywhere it appears — calendar, dashboard, search results, and recap charts.

### 7.4 Integration

**REQ-CAL-15** — A checkbox block in a note carrying a date annotation appears as a task in the calendar. Checking it in either place updates both. The task links back to its source note and line.

**REQ-CAL-16** — Every item can link to a note and to a course; notes and course dashboards display their linked items in a panel.

---

## 8. Module D — Daily Grid

> Mental model: **a spreadsheet.** Rows are the things done every day; columns are days; cells are checkmarks. It must feel as fast and as dense as a spreadsheet, not like a mobile habit app.

### 8.1 Structure

**REQ-DAILY-1** — Grid layout: habits as **rows**, days as **columns**. The habit-name column is frozen during horizontal scrolling; the date header row is frozen during vertical scrolling.

**REQ-DAILY-2** — **Default window: seven columns — the three previous days, today, and the three upcoming days.** Today's column carries a distinct accent border and background. Weekend columns are tinted differently. Each column header shows the weekday abbreviation, the day number, and the day's completion score.

**REQ-DAILY-3** — The window is adjustable by preset and by custom range:
- Presets: **±3 days (default)**, 7 days, 14 days, 30 days, This week, This month, Custom
- Custom: explicit start and end date pickers
- The selection persists across sessions, per workspace

**REQ-DAILY-4** — Horizontal navigation moves the window through time by arrow controls, `Shift`+scroll, and keyboard. A "Today" button re-centres it.

### 8.2 Habits

**REQ-DAILY-5** — Habit definition fields:

| Field | Description |
|---|---|
| **Name** | e.g. "Take supplements", "Read 30 min", "Training", "Deep work" |
| **Category** | The shared category system of §7.3 — drives color and grouping |
| **Type** | `Checkbox` (done / not done) or `Quantity` (numeric value with a unit — 30 min, 3 sets, 2 L) |
| **Target** | For quantity habits: the daily goal. The cell counts as complete when value ≥ target. |
| **Active weekdays** | Which days it applies to (default: all seven). Inactive days render as disabled cells and are excluded from every score. |
| **Start / End date** | Optional. The habit exists only inside this range. |
| **Order** | Manual drag-to-reorder within its group |
| **Note** | Optional free-text description or protocol |
| **Archived** | Removed from the grid; all history retained and still counted in past recaps |

**REQ-DAILY-6** — Habits are grouped by category with collapsible, colored group headers showing the group's own completion score.

### 8.3 Interaction

**REQ-DAILY-7** — Click a cell to toggle. For quantity habits, click opens a compact inline numeric input with `+`/`−` steppers and unit display; `Enter` commits, `Esc` cancels.

**REQ-DAILY-8** — Complete keyboard operation: arrow keys move the cell cursor, `Space` or `Enter` toggles, digits type a quantity directly, `Tab` moves to the next habit, `Ctrl+↓` fills a whole column. **Entering an entire day for fifteen habits must be possible in under fifteen seconds without touching the mouse.**

**REQ-DAILY-9** — **Past days are fully editable** — back-filling is a core use case, not an edge case. Future days are read-only by default, with a setting to allow pre-checking.

**REQ-DAILY-10** — Right-click context menu on a cell, a row, and a column: add a note to the entry, clear, fill the row for the visible window, edit the habit, archive the habit.

### 8.4 Scoring & statistics

**REQ-DAILY-11** — **Daily completion score**, shown large for today, in each column footer, in the tray, and on the workspace dashboard:

```
score(day) = completed_applicable_habits(day) / applicable_habits(day) × 100
```

Displayed as `40% done` with a progress bar. `applicable_habits` excludes habits inactive on that weekday, archived habits, and habits outside their date range. If no habit is applicable, the day shows `—`, never `0%`.

**REQ-DAILY-12** — Per-row statistics: current streak, longest streak, and completion rate over the visible window, shown inline at the end of each row.

**REQ-DAILY-13** — Statistics panel: completion rate for the week, month, and year to date; best and worst habit; average score by weekday (revealing which day of the week is weakest); and a GitHub-style contribution heatmap per habit over the trailing twelve months.

**REQ-DAILY-14** — **Metrics** — a second grid, sharing the same interaction model, for tracked numeric values that are not habits: `bench press: 80 kg`, `body weight: 74 kg`, `sleep: 7.5 h`. Each metric has a name, unit, category, and optional target. Metrics render as sparklines in the grid and as full line charts on click, with month-over-month deltas. **Metrics are a required input to the Recap module** — they are what makes a statement like "bench press 72 → 80 kg, +11 %" possible.

**REQ-DAILY-15** — Export the grid and the metrics to CSV and to XLSX, for the visible window or any custom range.

---

## 9. Module E — Recap

### 9.1 Purpose

At the close of each month, the application produces a **narrative report of what the user actually accomplished** — readable prose backed by charts, not a dashboard of raw numbers.

### 9.2 Reference output — build and test against this

> **September — Personal**
>
> **Gym: significant progress.** You trained 18 times this month, four more than in August, and you were remarkably consistent — never more than two days without a session. Your strongest gains were on bench press (72 → 80 kg, +11 %) and squat (95 → 105 kg, +10.5 %). Stretching went the other way: 9 sessions against 15 last month.
>
> **Personal projects.** You made real progress on *CartUnlock* — 23 linked notes and 11 completed tasks — and started exploring the dental SaaS idea. Project work accounted for 34 % of everything you completed this month.
>
> **Habits.** Overall completion 78 %, up 6 points. Strongest: supplements at 97 %. Weakest: reading at 41 % — the third consecutive monthly decline.

### 9.3 Input data

**REQ-RECAP-1** — The engine reads **only** the following, all of it entered by the user:

| Source | Extracted signal |
|---|---|
| Daily Grid | Completion rate per habit, streaks, best and worst performers, month-over-month deltas, weekday patterns |
| Metrics | First and last value, absolute and percentage change, trend direction, new personal records |
| Calendar & Tasks | Tasks completed per category, events attended, distribution of effort across categories, on-time versus overdue ratio |
| Notes | Notes created and edited, their titles, tags, courses and linked projects, total words written |
| Maps | Maps and nodes created |
| Flashcards | Cards reviewed, retention rate, courses revised (Student workspace) |

**REQ-RECAP-2** — Aggregation happens **locally and deterministically**. The application first computes a structured statistics object; the language model's only job is to turn that object into prose. **Every number appearing in the narrative must be traceable to the computed statistics.** The prompt must forbid the model from introducing any figure not present in its input, and generated output is validated against the statistics object before display — a numeric mismatch triggers a regeneration, then a fallback to a template-based narrative.

### 9.4 Generation

**REQ-RECAP-3** — Summarisation sits behind a single `Summarizer` interface with two implementations, both shipping in v1:
- **Remote** — an OpenAI-compatible chat-completions endpoint. Default provider OpenRouter; the endpoint URL, model identifier, and parameters live in a user-editable configuration so a new model can be adopted without an application release. The user supplies their own API key.
- **Local** — Ollama on `localhost:11434`, for fully offline generation. The app detects whether Ollama is running and lists its installed models.

**REQ-RECAP-4** — The user's API key is stored using the **Windows Data Protection API (DPAPI)**, never in plain text, never in the vault, never in a synced file.

**REQ-RECAP-5** — Before any data leaves the machine for the first time with a given provider, the app shows exactly what will be sent and requires explicit opt-in. A setting restricts transmission to aggregated statistics only, excluding note titles and all free text.

**REQ-RECAP-6** — Triggers: automatically on the first day of each month for the month just ended (toggleable, on by default), on 1 January for the year just ended, and manually via "Generate now" for any past period. Generation runs in the background with a progress indicator and a toast on completion.

**REQ-RECAP-7** — Periods: **Month** (primary), **Year**, and **Custom range**. The yearly recap aggregates the twelve monthly recaps plus full-year statistics and a twelve-month trend chart per key metric.

**REQ-RECAP-8** — Recaps are generated per workspace, with a toggle to produce a combined all-workspaces report.

**REQ-RECAP-9** — Graceful degradation: with no summariser configured, the app still produces the full statistics, charts, and highlights using a deterministic template-based narrative. The language model enriches the report; it is never required for it to exist.

### 9.5 Presentation

**REQ-RECAP-10** — The Recap tab shows a vertical timeline of periods, newest first. Each entry is a card: period name, a one-line generated headline, three headline statistics, and a Read action. Periods with no recap yet show a Generate action.

### 9.6 Diorna AI command center

**REQ-AI-1** — When a remote OpenRouter key is configured, the left sidebar exposes a
`Diorna AI` launcher directly above Settings. It opens a drawer beside the sidebar and
becomes an overlay on narrow windows. Every conversation is local and scoped
to the active workspace.

**REQ-AI-2** — A request never mutates data directly. The configured model returns a
versioned, JSON-Schema-constrained plan containing only `create_note`, `create_map`,
`create_calendar_item`, and `create_habit` operations. Diorna validates the complete plan
locally, displays every operation and assumption, and requires explicit confirmation
before applying it.

**REQ-AI-3** — Applying a plan uses the ordinary store and persistence APIs. The active
workspace ID is supplied locally and cannot be selected by the model. A resulting change
set records every created entity and exposes an Undo action.

**REQ-AI-4** — Typing `/` in the composer opens a keyboard-accessible picker containing
only non-trashed notes from the active workspace. A selection is stored as a stable note
ID and rendered as a title chip. Only explicitly mentioned note bodies are included in
the remote payload; renamed or moved notes remain resolvable.

**REQ-AI-5** — Map plans describe semantic nodes and edges, not coordinates. Diorna lays
out the graph deterministically, keeps a requested central node fixed, and resolves note
nodes created by earlier operations in the same plan.

**REQ-AI-6** — Calendar dates are validated as ISO timestamps in the local timezone.
Daily duration goals compile to quantity habits with a numeric target, unit, and active
weekdays. Missing durations or categories appear as visible assumptions in the preview.

**REQ-AI-7** — The model receives the active workspace name, current local date, timezone,
the user's prompt, and explicitly mentioned notes only. The first request previews the
exact outbound payload and requires provider consent. Provider routing requires support
for structured outputs and denies providers that collect prompts where supported.

**REQ-AI-8** — The feature degrades safely: with no key, invalid JSON, a schema violation,
cross-workspace references, unsupported operations, or a network failure, no entity is
created. Tests use mocked provider responses and never depend on a live model.

**REQ-RECAP-11** — A full recap page contains, in order:
1. **Headline statistics** — four to six key numbers with month-over-month deltas and directional arrows
2. **Narrative sections** — one per category that has data (Sport, Projects, Study, Health…), each with a bold lead sentence
3. **Charts** — metric progression lines, habit completion bars, task distribution by category, and a daily-score heatmap for the month
4. **Highlights** — new records, longest streaks, largest improvements, milestones reached
5. **Trends** — an explicit two-column what-improved / what-declined comparison against the previous period

**REQ-RECAP-12** — Every generated recap is saved as an ordinary note in the workspace, making it searchable, linkable, embeddable in maps, and editable. Regeneration creates a new revision rather than destroying the previous one.

**REQ-RECAP-13** — Export a recap to PDF, laid out for reading and printing, charts included.

---

## 10. Settings

**REQ-SET-1** — A settings window organised in sections, searchable:

| Section | Contents |
|---|---|
| **General** | Language (English, French), start-with-Windows, minimise-to-tray, default workspace on launch, update channel |
| **Appearance** | Theme (light / dark / follow Windows), accent color, interface font, editor font, font size, line width, density (compact / comfortable) |
| **Vault** | Vault location, move vault, open in Explorer, re-index, storage usage by workspace |
| **Workspaces** | Create, rename, recolor, reorder, delete (with a typed confirmation), set the dashboard layout |
| **Editor** | Spell-check and its language, auto-pair brackets, tab behaviour, default new-note folder, default template |
| **Categories** | Manage categories per workspace: name, color, icon, order |
| **Calendar** | Week start day, visible hours, default event duration, default reminder lead time |
| **Daily Grid** | Default window preset, allow future check-in, week start |
| **Recap** | Provider (Remote / Local / None), endpoint, model, API key, auto-generate toggles, privacy mode |
| **Shortcuts** | Full, editable keymap with conflict detection and reset-to-default |
| **Backup** | Backup location, frequency, retention count, "back up now", restore from backup |
| **Import / Export** | Import from Obsidian, import from Notion, export the whole vault |
| **About** | Version, licence, third-party notices, repository link, release notes |

**REQ-SET-2** — Settings are stored as human-readable JSON in the vault's `.app/` folder, editable by hand, hot-reloaded on external change.

---

## 11. Onboarding, import & data lifecycle

**REQ-ONB-1** — First run: a four-step wizard — choose the vault location (with a sensible default under Documents), pick a theme, name the two seeded workspaces, and optionally import an existing vault. Completing it in under sixty seconds must be possible.

**REQ-ONB-2** — Each module presents a one-time inline coach mark on first visit, dismissible and re-showable from Help. No blocking tutorials.

**REQ-ONB-3** — Sample content is offered, not imposed: a "load example workspace" button demonstrating a course, a map matching the §6.1 scenario, a week of tasks, and a habit set.

**REQ-IMP-1** — **Obsidian import (priority)**: point at a vault; notes, folder structure, wiki-links, tags, frontmatter, attachments, and `.canvas` files are imported with links preserved. A report lists anything that could not be converted.

**REQ-IMP-2** — **Notion import**: accept a Notion Markdown-and-CSV export; convert pages to notes, databases to notes with properties, and preserve internal links, images, and file attachments.

**REQ-IMP-3** — Import runs into a chosen workspace, into a dated folder, non-destructively, and is undoable as a single operation.

**REQ-DATA-LC-1** — **Trash**: deleted notes, maps, and items move to a per-workspace trash, restorable with their original location, purged after thirty days or on demand.

**REQ-DATA-LC-2** — **Backups**: an automatic local backup of the entire vault, daily and before every schema migration, to a user-chosen folder, retaining the last ten. Restore from the settings UI.

**REQ-DATA-LC-3** — **Full export**: a single command produces a portable folder — Markdown notes, `.canvas` maps, attachments, and a JSON dump of tasks, habits, entries, metrics, and recaps. The user must always be able to leave with everything.

---

## 12. Data model

### 12.1 On-disk layout

```
<Vault>/
├── .app/
│   ├── index.db                # SQLite: search index + structured data
│   ├── settings.json
│   ├── keymap.json
│   ├── logs/
│   └── revisions/              # note revision history
├── Student/
│   ├── notes/                  # *.md with YAML frontmatter
│   ├── attachments/
│   ├── maps/                   # *.canvas (Obsidian-compatible JSON)
│   ├── templates/
│   └── .trash/
└── Personal/
    └── … same structure
```

**Markdown files are the source of truth for note content.** SQLite holds the search index plus the structured data that has no natural file representation (tasks, habits, entries, metrics, flashcard scheduling, recap statistics). **Deleting `index.db` must never lose note or map content**: the app detects its absence and rebuilds the index from disk on next launch, with a progress indicator.

### 12.2 Core schema

```sql
workspace(id, name, color, folder_name, sort_order, created_at)

note(id, workspace_id, path, title, course_id NULL,
     created_at, updated_at, word_count)
note_link(source_note_id, target_note_id, context, position)
tag(id, workspace_id, name)                       -- nested via 'a/b/c'
note_tag(note_id, tag_id)
note_property(note_id, key, value, value_type)
note_revision(id, note_id, content, created_at)

course(id, workspace_id, name, code, color, semester,
       instructor, credits, sort_order)

map(id, workspace_id, path, name, parent_map_id NULL, updated_at)
-- node and edge geometry live inside the .canvas JSON file

category(id, workspace_id, name, color, icon, sort_order)

item(id, workspace_id, kind,                      -- 'task' | 'event'
     title, description, category_id,
     start_at, end_at, all_day,
     due_at NULL, completed_at NULL,
     priority, rrule NULL, rrule_exceptions,
     parent_item_id NULL, note_id NULL, course_id NULL,
     source_note_line NULL, created_at, updated_at)
item_reminder(id, item_id, minutes_before)

habit(id, workspace_id, name, category_id,
      type,                                       -- 'checkbox' | 'quantity'
      unit NULL, target NULL,
      active_weekdays,                            -- 7-bit mask
      start_date, end_date NULL,
      description, sort_order, archived)
habit_entry(habit_id, date, done, value NULL, note NULL,
            PRIMARY KEY(habit_id, date))

metric(id, workspace_id, name, unit, category_id, target NULL, sort_order)
metric_entry(metric_id, date, value, PRIMARY KEY(metric_id, date))

flashcard(id, note_id, block_id, front, back, card_type,
          ease, interval_days, due_date, reps, lapses, last_reviewed_at)
review_log(id, flashcard_id, reviewed_at, grade, interval_before, interval_after)

reference(id, workspace_id, citation_key, csl_json)

recap(id, workspace_id, period_type, period_start, period_end,
      note_id, stats_json, narrative, model_used, generated_at, revision)
```

**REQ-DATA-1** — Every table carrying user content includes `workspace_id`, indexed. Cross-workspace joins are impossible by construction in the data-access layer.

**REQ-DATA-2** — Schema migrations are versioned, forward-only, transactional, and preceded by an automatic backup. A failed migration leaves the previous database intact and reports the failure clearly.

**REQ-DATA-3** — All writes are atomic (write to a temporary file, fsync, rename). A power loss or force-quit must never leave a truncated note, a corrupted `.canvas`, or a half-written database.

---

## 13. Technology & platform

### 13.1 Stack — prescribed

| Layer | Choice | Rationale |
|---|---|---|
| **Shell** | **Tauri 2** (Rust core + WebView2 frontend) | Small binaries, native Win32 access, low memory, strong local-first story. Windows-only means WebView2 is the single rendering target — no cross-browser compatibility work. |
| **Frontend** | **React 18 + TypeScript**, `strict: true` | Required by the editor and canvas libraries below |
| **Build** | **Vite** | — |
| **Editor** | **TipTap** (ProseMirror) | Proven block editor, extensible node types, exactly the model §5 describes |
| **Mathematics** | **KaTeX** | Fast, sufficient coverage, reliable in print |
| **Canvas** | **React Flow** | Node/edge model with explicit X/Y coordinates — a direct match for §6 |
| **PDF viewing** | **PDF.js** | — |
| **Diagrams** | **Mermaid** | — |
| **Calendar** | Custom components over **date-fns** + **rrule** | A library would fight the specific behaviour required in §7 |
| **Charts** | **Recharts** | Declarative, sufficient for §9 |
| **Database** | **SQLite** via `sqlx` (Rust side), WAL mode | Embedded, fast, single file |
| **Search** | **SQLite FTS5** with a Porter tokenizer | Meets NFR-3 without an external service |
| **State** | **Zustand** + TanStack Query | Minimal boilerplate |
| **Styling** | **Tailwind CSS** + CSS variables for theming | — |
| **Icons** | **Lucide** | — |
| **Testing** | **Vitest** (unit), **Playwright** (end-to-end), **cargo test** (Rust) | — |
| **Packaging** | Tauri bundler → **MSI and NSIS** installers | — |

### 13.2 Windows platform requirements

**REQ-WIN-1** — Supported: **Windows 10 version 1809 (build 17763) and later, and Windows 11**, x64 and ARM64.

**REQ-WIN-2** — The installer bundles the **WebView2 evergreen bootstrapper** and installs the runtime if absent. Installation must succeed on a clean machine with no developer tooling.

**REQ-WIN-3** — Both **MSI** (for managed environments) and **NSIS** (`.exe`, for individuals) installers, per-user by default with a per-machine option. Silent install flags supported.

**REQ-WIN-4** — The installer and the executable are **Authenticode code-signed** with a certificate supplied by the client. No SmartScreen warning on a released build.

**REQ-WIN-5** — Native Windows integration:
- Global hotkeys via `RegisterHotKey`, user-remappable, with a clear error if a combination is already taken
- System tray icon with context menu (§4.2)
- **Toast notifications** through the Windows notification system for reminders, with actionable buttons
- Taskbar **jump list**: New note, Quick capture, Today
- File associations for `.md` and `.canvas`, opening in the correct workspace
- `Win+Shift+S` screenshot paste directly into notes
- High-DPI awareness and correct rendering on mixed-DPI multi-monitor setups
- Respects the Windows accent color, dark-mode setting, and reduced-motion preference

**REQ-WIN-6** — Auto-update through the Tauri updater: background check, download, prompt, install on restart. Signed update manifests. A settings toggle disables it entirely; a portable build performs no update checks.

**REQ-WIN-7** — Paths: the vault defaults to `%USERPROFILE%\Documents\Diorna`; application data to `%APPDATA%\Diorna`; logs to `%APPDATA%\Diorna\logs`. Long paths (> 260 characters) and non-ASCII paths must be handled correctly. The vault may sit inside a OneDrive-synced folder without corruption — file locking and sync conflicts are detected and reported, never silently resolved.

**REQ-WIN-8** — A **portable build** is also produced: a single folder, no installer, no registry writes, vault beside the executable.

---

## 14. Non-functional requirements

Measured on a reference machine — Intel i5 11th generation, 16 GB RAM, SSD — against a reference vault of 5 000 notes, 50 maps, 3 000 tasks, and 24 months of habit history.

| ID | Requirement |
|---|---|
| **NFR-1** | Cold start to interactive: **< 2 s**. Warm start: < 1 s. |
| **NFR-2** | Note open: **< 100 ms**. Keystroke to render in the editor: **< 16 ms** (60 fps), with no dropped frames while typing in a 10 000-word note. |
| **NFR-3** | Search results: **< 200 ms**. Incremental results appear as the user types. |
| **NFR-4** | Map canvas: **60 fps** panning and zooming with 200 nodes visible; usable up to 1 000 nodes. |
| **NFR-5** | Calendar view switch: < 100 ms. Daily Grid cell toggle: < 30 ms perceived, optimistic. |
| **NFR-6** | Memory: **< 400 MB** idle with the reference vault; < 700 MB under heavy use. |
| **NFR-7** | Installer size < 30 MB. Installed footprint < 150 MB excluding user data. |
| **NFR-8** | Fully functional offline. The only outbound calls are user-triggered recap or confirmed Diorna AI generation, update checks (toggleable), and link-preview fetching (toggleable). |
| **NFR-9** | **Zero telemetry.** No analytics, no crash reporting, no phone-home, not even anonymised, not even opt-out. Verifiable by inspecting the source. |
| **NFR-10** | Data safety: atomic writes, no data loss on crash or forced termination, automatic backup before every migration, and a recovery path from a corrupted database that never loses note or map content. |
| **NFR-11** | Accessibility: complete keyboard operation, visible focus indicators, ARIA labels on all controls, contrast ratio ≥ 4.5:1 in both themes, respects the Windows reduced-motion setting, and works at 200 % display scaling. |
| **NFR-12** | Localisation: all user-facing strings externalised; **English and French** ship at v1, with dates, numbers, and week start following the chosen language. |
| **NFR-13** | Error handling: no unhandled exception ever produces a blank window. Errors surface as a readable message with a "copy diagnostics" action. Local rotating logs, capped at 50 MB. |
| **NFR-14** | The application remains fully usable with no summariser configured, no internet connection, and no imported data. |

---

## 15. Design direction

**REQ-DES-1** — Visual register: **dense, calm, and precise** — a professional tool, not a consumer app. Generous whitespace inside content areas, tight and information-dense in chrome. No decorative illustration, no gradients on surfaces, no bounce animations.

**REQ-DES-2** — Typography: one interface sans-serif (Inter or the system UI font), one editor serif or sans (user-selectable), one monospace (JetBrains Mono). A defined type scale; no ad-hoc sizes.

**REQ-DES-3** — Color: a neutral grey base carrying nearly the whole interface; color is reserved for **meaning** — category identity, state, and emphasis. A single user-selectable accent. Category palettes must remain distinguishable in both themes and under common color-vision deficiencies.

**REQ-DES-4** — Motion: 120–200 ms, ease-out, on state changes only. No animation on the critical typing, cell-toggle, or canvas-drag paths.

**REQ-DES-5** — A documented design-token system (color, spacing on a 4 px grid, radius, shadow, type) implemented as CSS variables and consumed by every component. No hard-coded values in components.

**REQ-DES-6** — Every interactive element defines its default, hover, active, focus, disabled, and loading states. Every list defines its empty state with a useful next action.

**REQ-DES-7** — Deliverable: a component library page inside the app, in a hidden developer route, rendering every component in every state — used for visual review and regression testing.

---

## 16. Engineering standards & repository

**REQ-ENG-1** — Public Git repository from day one, trunk-based with short-lived feature branches, conventional commits, pull requests with at least one review, and a squash merge.

**REQ-ENG-2** — Continuous integration on every pull request: type check, lint, unit tests, end-to-end tests, Rust tests, and a Windows build. Merging is blocked on a red pipeline.

**REQ-ENG-3** — Test coverage: **≥ 80 %** on business logic — scoring, recurrence, spaced repetition, statistics aggregation, natural-language parsing, and workspace isolation. Every one of these has a dedicated test suite with edge cases enumerated.

**REQ-ENG-4** — Architecture: strict module boundaries mirroring §5–§9. Cross-module communication passes through defined interfaces, never direct imports of another module's internals. The `Summarizer` interface, the storage layer, and the import layer are each swappable without touching feature code.

**REQ-ENG-5** — Documentation deliverables in the repository: architecture overview with a diagram, data-model reference, module READMEs, a build-and-release guide, a contribution guide, and an end-user manual.

**REQ-ENG-6** — Reproducible build: a documented, pinned toolchain producing an identical installer from a clean checkout on a clean Windows machine.

**REQ-ENG-7** — **Licence: AGPL-3.0.** All contributors sign a Contributor Licence Agreement assigning copyright to the client, so the project can be dual-licensed commercially later without tracing every contributor. Third-party licences are compiled into an attribution file shipped in the About screen.

**REQ-ENG-8** — Security: no secret in the repository; API keys via DPAPI only; all rendered Markdown and HTML sanitised; external links opened in the system browser with `noopener`; dependencies audited in CI and pinned by lockfile.

---

## 17. Milestones & acceptance

Each milestone ends with a demonstrable build, its tests green, and its acceptance criterion met.

| # | Milestone | Content | Acceptance criterion |
|---|---|---|---|
| **M0** | **Foundations** | Tauri shell, window management, workspace system, SQLite schema and migrations, file-system layer, settings, theming, command palette, tray, global hotkey | Two workspaces created and switched with **provably zero data leakage** — an automated test asserts isolation for every entity type |
| **M1** | **Notes** | Editor with every block type, links, backlinks, tags, properties, folders, search, revisions, graph view | A 200-note vault is fully usable; §5.1–5.3 pass; NFR-2 and NFR-3 verified |
| **M2** | **Maps** | Canvas, all node types, edges, sub-maps, `.canvas` persistence, export | **The §6.1 gym scenario is reproducible end to end**, survives a restart with exact coordinates, and the file opens correctly in Obsidian |
| **M3** | **Calendar & Tasks** | Four views, items, recurrence, categories, filters, drag-and-drop, natural-language quick add, note integration, toast reminders | A full week is planned and then rescheduled entirely by drag-and-drop; the parser passes a 50-case test suite |
| **M4** | **Daily Grid** | Habits, entries, sliding window, scoring, statistics, metrics, exports | **A fifteen-habit day is entered in under fifteen seconds, keyboard only**; scoring is correct across every edge case in the test suite |
| **M5** | **Student features** | Courses, templates, mathematics, flashcards and spaced repetition, bibliography, deadlines, dashboard, PDF export | A complete course of lecture notes is taken, revised, and exported in-app |
| **M6** | **Recap** | Statistics aggregation, `Summarizer` interface, both backends, numeric validation, presentation, charts, template fallback, PDF export | **A recap matching §9.2 in structure and factual accuracy** is generated from real data; every figure is traceable; the template fallback produces a usable report with no model configured |
| **M7** | **Import & lifecycle** | Obsidian import, Notion import, trash, backups, full export, onboarding | A real Obsidian vault imports with links intact; a deleted note is restored; a vault is backed up and restored |
| **M8** | **Hardening & release** | Performance passes, accessibility, localisation, installers, signing, auto-update, portable build, documentation | Every NFR measured and met on the reference machine; a clean-machine install succeeds with no warning |

**REQ-ACC-1** — Definition of done for every requirement: implemented, unit-tested, covered by an end-to-end test where user-facing, documented, reviewed, and demonstrated on Windows 10 and Windows 11.

**REQ-ACC-2** — Final handover comprises: the source repository, signed MSI and NSIS installers, the portable build, all documentation of REQ-ENG-5, a green test suite, and a measured NFR report.

---

## Appendix A — Decisions already taken

Settled. Not to be reopened without the client's written agreement.

| Question | Decision | Rationale |
|---|---|---|
| Platform | **Windows desktop only** | The user's machine. Single rendering target, no cross-platform compromise, faster delivery. |
| Shell technology | **Tauri 2** rather than Electron | A tenth of the footprint, native performance, and the local-first posture the product claims. |
| Licence | **AGPL-3.0 + copyright assignment to the client** | Prevents a closed commercial fork while keeping the door open to a future dual licence. |
| Workspaces | **Arbitrary creation from v1**, seeded with Student and Personal | The isolation machinery is identical; capping it would only add an artificial constraint. |
| Flashcards | **Ship in v1** | Core value for the student use case, and a required input to the Recap module. |
| Import priority | **Obsidian first, Notion second — both in v1** | Obsidian is Markdown-native and nearly free to support; Notion needs a conversion layer. |
| Recap model | **Configurable OpenAI-compatible endpoint, default OpenRouter; Ollama local option in v1** | Model choice changes faster than release cycles; configuration outlives any hard-coded name. |
| Recap without a model | **Deterministic template fallback, always available** | The product must never be broken by a missing API key. |
| Cloud sync | **Not built.** The vault may live in OneDrive at the user's discretion | Sync is a large surface area with little value for a single-machine user. |
| Passive tracking | **Never** | Explicitly rejected by the client; it is also the single largest privacy liability such an app could carry. |
| Telemetry | **None** | Non-negotiable, and verifiable in the source. |
| Product name | **Diorna** | Derived from the Roman *acta diurna*, the daily register of things done — the product's core idea. Coined rather than borrowed, so it is distinctive and protectable. |
