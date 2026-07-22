# Diorna user manual

## First launch and the vault

The four-step wizard chooses a vault (default `Documents\Diorna`), theme,
Student/Personal workspace names, and optional import/examples. A workspace is
a hard privacy boundary. Switching it changes every module, palette result,
recent item, category, and capture target.

The sidebar opens Home, Notes, Maps, Calendar, Daily, and Recap. `Ctrl+K` opens
the command palette, `Ctrl+B` toggles the sidebar, and `Ctrl+Alt+Space` opens
quick capture from any Windows application. Plain capture appends to Inbox,
`[]` creates a task, and `#tag` creates a tagged note.

## Notes and study

Create or select a note in Notes. Formatting saves automatically within one
second and on close. Type `/` for blocks, `[[` for links, Markdown shortcuts
for structure, `$…$`/`$$…$$` for mathematics, and cloze text as
`{{c1::answer}}`. Properties, tags, course, counts, backlinks, outline, and
unlinked mentions surround the editor. Search accepts filters such as
`tag:exam`, `course:CS301`, `created:>2026-01-01`, phrases, and Boolean terms.

Templates substitute date, time, title, course, week, semester, and cursor.
Course dashboards collect notes/deadlines/maps/cards. Flashcard review uses
Again, Hard, Good, and Easy to schedule SM-2 intervals. Import BibTeX or CSL
JSON and format references as APA, IEEE, or Harvard. A deadline property creates
and synchronises a Calendar task.

## Maps

Maps are manually arranged spatial canvases, never automatic note graphs.
Create text, note, image, link, group, or sub-map nodes; drag them freely and
connect border handles. Positions are stored as exact X/Y values. Use the
minimap and fit controls for navigation. Export the visible authored map to PNG
or SVG. The file is Obsidian Canvas-compatible in `<workspace>\maps`.

## Calendar and tasks

Switch Day, Week, Month, and Agenda with the toolbar or D/W/M/A. Quick add
understands phrases such as `gym tomorrow 6pm #sport !high for 1h30` and shows
its interpretation before submission. Category chips filter every view.
Drag items between dates/times; drag an unscheduled task onto the timeline to
time-block it. Overdue tasks stay visible until completed or rescheduled.
Reminders use native Windows notifications.

## Daily grid and metrics

Rows are habits and columns are dates. Arrow keys move, Space/Enter toggles,
digits enter quantities, Tab advances, and past days remain editable. Future
days are locked unless enabled in Settings. Disabled weekdays do not affect the
score. Metrics track numeric series used in Recap. CSV exports the visible
habit grid; XLSX exports both Habits and Metrics sheets.

## Recap

Generate a monthly or yearly recap from completion, calendar, flashcard, and
metric facts. Every displayed number comes from deterministic aggregation. With
no model configured, the template is fully usable. A remote OpenAI-compatible
provider receives only the previewed payload after consent; Ollama stays local.
Invalid model numbers are rejected and regenerated once before template
fallback. Recaps are ordinary revisioned notes and can print to PDF.

The optional onboarding step configures OpenRouter with Kimi K2.6. Existing
users can choose the same preset in Settings → Recap, paste their OpenRouter
API key, and press **Save key**. The key is stored per Windows user with DPAPI,
outside the vault. Changing the endpoint or model remains possible for any
OpenAI-compatible provider.

## Data lifecycle

Settings imports Obsidian or Notion into a dated folder without modifying the
source. Each import has an operation manifest for one-step undo. Deleted content
moves to workspace trash. Back up manually or on schedule; ten daily backups
are retained. Full export creates a portable tree containing Markdown, Canvas,
attachments, templates, and structured JSON. If the database is lost, restart
to rebuild the index from Markdown and Canvas.

## Privacy and troubleshooting

Diorna has no telemetry. The app works offline; only a requested remote recap,
optional update check, and optional link preview need a network. API keys use
Windows DPAPI and stay outside the vault. If a screen fails, copy diagnostics
from the error view and inspect local rotating logs under `%APPDATA%\Diorna`.
Never edit files simultaneously in two sync clients; Diorna reports hash/lock
conflicts instead of choosing one silently.
