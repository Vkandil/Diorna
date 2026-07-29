# Diorna user manual

## First launch and the vault

The four-step wizard chooses a vault (default `Documents\Diorna`), theme,
Student/Personal workspace names, and optional import/examples. A workspace is
a hard privacy boundary. Switching it changes every module, palette result,
recent item, category, and capture target.

The default **Diorna** theme uses a warm cream base with navy text and cobalt
actions. Appearance settings also offer neutral light, dark, follow-Windows,
and a selectable accent color.

The sidebar opens Home, Notes, Maps, Calendar, Daily, Training, Recap, Projects,
and Focus.
`Ctrl+K` opens the command palette, `Ctrl+B` toggles the sidebar, and
`Ctrl+Alt+Space` opens quick capture from any Windows application. Plain
capture appends to Inbox, `[]` creates a task, and `#tag` creates a tagged note.
Recent Notes and Maps shown below their module are direct links; selecting one
opens that item immediately.

## Notes and study

Create or select a note in Notes. Formatting saves automatically within one
second and on close. Type `/` for blocks and choose **Page** to create and open
a linked child page. Typing `[[` still links existing notes. Both forms render as
accent-coloured, underlined page links while remaining portable `[[...]]` syntax
in Markdown. A back arrow above a child page names and returns to its parent page,
including through several nesting levels. Use Markdown shortcuts for structure, `$…$`/`$$…$$` for mathematics,
and cloze text as `{{c1::answer}}`. Properties, tags, course, counts, backlinks,
outline, and unlinked mentions surround the editor. Search accepts filters such as
`tag:exam`, `course:CS301`, `created:>2026-01-01`, phrases, and Boolean terms.

Templates substitute date, time, title, course, week, semester, and cursor.
Course dashboards collect notes/deadlines/maps/cards. Flashcard review uses
Again, Hard, Good, and Easy to schedule SM-2 intervals. Import BibTeX or CSL
JSON and format references as APA, IEEE, or Harvard. A deadline property creates
and synchronises a Calendar task.

Drop images, videos, audio files, or PDFs from Explorer directly at the desired
editor position; Diorna copies them into the workspace `attachments` folder and
keeps the note link portable. Hover a media block and drag its six-dot handle to
move it like a Notion block (or focus the handle and press `Alt+↑` / `Alt+↓`).
Selecting an image, video, or PDF exposes width and alignment controls. Use the
image itself to open a full-screen preview. PDF blocks provide page thumbnails,
previous/next navigation, zoom controls, and a selectable text panel. Select a
passage and choose **Quote into note** to insert a quote with a link back to its
exact PDF page. Use the download action to export the current note, folder, or
course as Markdown or as a directly saved PDF; printing remains available
separately.

Use **Insert link** or the `/` menu's **Web bookmark** command to choose between
a compact text link and a rich preview card. Pasting or dropping a standalone
public URL on an empty line creates the preview directly. Cards show the source,
thumbnail, title, and description, and expose open, copy, refresh, and
convert-to-text actions on hover. They use the same six-dot block handle as
media and render in PDF/print exports. Preview images are cached in the
workspace for offline use; disable automatic fetching under
Settings → Editor → Rich link previews.

## Maps

Maps are manually arranged spatial canvases; linked-page expansion only runs when
explicitly requested. Select a note node and choose **Expand all linked pages** to
lay out every recursively linked child note and connect the hierarchy with arrows.
Create text, note, image, link, group, or sub-map nodes; drag them freely and
connect border handles. Positions are stored as exact X/Y values. Use the
minimap and fit controls for navigation. Export the visible authored map to PNG
or SVG. The file is Obsidian Canvas-compatible in `<workspace>\maps`.

Images, videos, audio, PDFs, and other files can also be dropped directly from
Explorer onto a map. Diorna copies them into the workspace `attachments` folder
and creates resizable media nodes at the pointer position. Drag an image directly
from its surface; drag interactive video, audio, PDF, and file cards by their title
bar. Use the selection handles to resize any media. Multiple files dropped together
are arranged in a small grid instead of overlapping.

Drop a browser URL directly on the canvas or add a Link node and enter its
address in the Inspector. Public links become visual cards with their site,
favicon, image, title, description, and domain. Double-click opens the system
browser; Inspector actions open, copy, or refresh the cached preview. If the
website has no preview metadata or is offline, the URL card remains editable and
usable.

Linked note cards always render the current rich note, including headings, lists,
images, video, audio, PDFs, and file blocks. Their content is scrollable inside the
card and refreshes when the note is edited, renamed, or moved to another folder.
Node and edge settings live in the right Inspector panel. On narrower windows it
becomes an overlay that can be closed and reopened from the compact Inspector button.

## Calendar and tasks

Switch Day, Week, Month, and Agenda with the toolbar or D/W/M/A. Quick add
understands phrases such as `gym tomorrow 6pm #sport !high for 1h30` and shows
its interpretation before submission. Category chips filter every view.
Drag items between dates/times; drag an unscheduled task onto the timeline to
time-block it. Overdue tasks stay visible until completed or rescheduled.
Reminders use native Windows notifications.

## Projects and goals

Projects is the coordination layer for a finite outcome: a client campaign, a
business launch, an assignment, exam preparation, a move, a personal event, or
a health change. Create one from a tailored template or start blank. The
Portfolio shows progress and health; drag cards across the Board to update
status. Goals describe the longer-term reason and can be advanced by several
projects.

Open a project to edit its observable outcome, target date, goal, health,
stakeholders and one concrete next action. Add milestones and record periodic
updates with wins, blockers and next steps. Create tasks, deadlines or calls
from the project: they remain normal Calendar items and can be rescheduled
there. Likewise, project Notes and Maps remain fully available in their own
modules, while Daily habits and Training activities keep their native history.
Existing resources can be linked or unlinked without copying or deleting them.

Automatic progress combines linked task and milestone completion. The Reviews
view summarizes the local evidence and helps choose what needs attention.
Projects also appear on Home and their delivery is included in monthly and
yearly Recap statistics.

## Focus

Focus is Diorna's execution layer, not another task list. Its Today view places
your chosen priorities beside urgent Calendar tasks, events in the next 48
hours and next actions from active Projects. Add a free priority, or use the
plus button beside one of those recommendations. A priority may also point to a
Goal, Note, Map, Daily habit or Training activity.

Choose 25, 45, 60 or 90 minutes, an execution mode and a concrete definition of
done. **Start** runs the persistent timer; **Add to plan** reserves a normal
Calendar event when a schedule was entered. Use Deep work for demanding
professional work, Study for revision, Creative for generative work, Admin for
shallow operations, Meeting prep for a call or presentation, and Personal for
life administration. Projects and Calendar items also expose **Focus next** or
**Focus on this** shortcuts.

The mini-player in the left sidebar keeps the running session visible while you
open Notes, Maps or Calendar. Pause and resume freely. When an interruption
appears, use **Park a distraction** to capture a thought, message, new task or
environment issue without leaving the block.

**Finish & review** records actual time, focus quality, energy, outcome, wins,
blockers and the easiest next action. You decide whether to mark the linked
priority or task complete. A linked Daily quantity habit receives the actual
minutes automatically. History can turn a review's next action into today's
priority; Insights compares planned and actual time, focus quality,
distractions, modes and the last seven days. Monthly and yearly Recaps use the
same explicit evidence—Diorna never monitors other applications.

## Daily grid and metrics

Rows are habits and columns are dates. Arrow keys move, Space/Enter toggles,
digits enter quantities, Tab advances, and past days remain editable. Future
days are locked unless enabled in Settings. Disabled weekdays do not affect the
score. Metrics track numeric series used in Recap. CSV exports the visible
habit grid; XLSX exports both Habits and Metrics sheets.

## Training

Training stores repeated sport results as sessions instead of requiring a new
free-form note every week. Create an activity for a discipline, then add
exercises measured through load and repetitions, duration, distance, or a
combination. The exercise field searches a built-in catalogue of more than 100
common movements and French/English aliases. Enter any name that is not offered
to create it immediately. For strength movements, choose external load,
bodyweight repetitions, optional added load, or assistance; pure bodyweight
sets never show an irrelevant load field. Save commonly repeated exercise
orders as templates. **Repeat last
session** copies the previous structure and values while leaving every set
unchecked; the previous result remains visible beside the current entry.

History retains completed sessions and their notes. Progress charts can compare
maximum load, repetitions, strength volume, duration, and distance. Activities
can optionally create a Daily quantity habit; completing a session then
recalculates that date's tracked minutes automatically.

Use a template's Calendar button to schedule it. The resulting event exposes a
**Start training** action and links back to the created session. New Recaps
include session count, time, activity distribution, volume, distance, and
personal records.

Existing logs can be migrated with **Import note**. Diorna previews recognized
dates and lines such as `Leg curl 3×20 @ 25 kg`, `Running 5 km in 30 min`, and
`Mobility 20 min` before importing; the original note is never modified.

## Recap

Generate a monthly or yearly recap from completion, calendar, Training,
flashcard, and metric facts. Every displayed number comes from deterministic
aggregation. With no model configured, the template is fully usable. A remote
OpenAI-compatible provider receives only the previewed payload after consent;
Ollama stays local. Invalid model numbers are rejected and regenerated once
before template fallback. Recaps are ordinary revisioned notes and can print to
PDF.

The optional onboarding step configures OpenRouter with Kimi K2.6. Existing
users can choose the same preset in Settings → Recap, paste their OpenRouter
API key, and press **Save key**. The key is stored per Windows user with DPAPI,
outside the vault. Changing the endpoint or model remains possible for any
OpenAI-compatible provider.

With an OpenRouter key configured, **Diorna AI** appears directly above Settings.
It can prepare projects, notes, maps, calendar items, Daily habits and Focus
blocks in the active workspace. It can turn a natural-language priority into a
realistic block, link an exact Diorna resource, add it to today's priorities and
reserve Calendar time. It reviews recent planned/actual evidence but never
starts a timer automatically. Type `/` in its composer to attach a specific note as context. Diorna
shows the exact outbound payload on first use and always displays the complete
creation plan before anything is applied. Use **Undo this batch** to reverse the
result. A project plan can create supporting material and attach each generated
resource after creation; **Plan with Diorna AI** on a project preloads that
project's outcome for a contextual update.

## Data lifecycle

Settings imports Obsidian or Notion into a dated folder without modifying the
source. Each import has an operation manifest for one-step undo. Deleted content
moves to workspace trash. Back up manually or on schedule; ten daily backups
are retained. Full export creates a portable tree containing Markdown, Canvas,
attachments, templates, and structured JSON. If the database is lost, restart
to rebuild the index from Markdown and Canvas.

## Privacy and troubleshooting

Diorna has no telemetry. The app works offline; only a requested remote recap,
a confirmed Diorna AI request, optional update check, and optional link preview
need a network. API keys use Windows DPAPI and stay outside the vault. If a
screen fails, copy diagnostics from the error view and inspect local rotating
logs under `%APPDATA%\Diorna`. Never edit files simultaneously in two sync
clients; Diorna reports hash/lock conflicts instead of choosing one silently.
