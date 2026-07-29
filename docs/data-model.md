# Data model reference

The versioned schema is authoritative in
[`src-tauri/migrations/0001_initial.sql`](../src-tauri/migrations/0001_initial.sql).
All identifiers are opaque strings. Timestamps are ISO-8601 UTC unless the
field is a local calendar date (`YYYY-MM-DD`).

## Ownership

`workspace` is the isolation root. Notes, tags, courses, maps, categories,
items, habits, metrics, references, templates, saved searches, and recaps carry
an indexed `workspace_id`. Child records inherit ownership through constrained
parents. The repository construction and the database constraints both prevent
cross-workspace joins.

| Aggregate | Principal records                        | Durable source              |
| --------- | ---------------------------------------- | --------------------------- |
| Notes     | note, link, tag, property, revision      | Markdown + YAML frontmatter |
| Maps      | map metadata                             | `.canvas` JSON              |
| Study     | course, flashcard, review log, reference | SQLite; cards link to notes |
| Planning  | item, reminder, category                 | SQLite                      |
| Daily     | habit, habit entry, metric, metric entry | SQLite                      |
| Direction | project, goal, project links and updates | SQLite JSON aggregates      |
| Training  | activity, exercise, template, session    | SQLite JSON aggregates      |
| Focus     | priority, session, distraction, review   | SQLite JSON aggregates      |
| Reports   | recap and revision metadata              | SQLite + generated note     |

Items use one entity with kind `task` or `event`; recurrence is RFC 5545 RRULE
plus exception JSON. Habits have checkbox/quantity type, weekday bitmask, date
bounds, optional target, and immutable history when archived. Flashcards store
SM-2 ease, interval, due date, repetition/lapse counts, and an append-only
review log.

Projects and goals are versioned JSON aggregates in SQLite, each carrying
`workspaceId`. A project holds milestones, update entries and ID lists for
linked Notes, Maps, habits and Training activities. Calendar `item` has the
nullable `project_id` column. Deleting a project detaches Calendar items and
does not delete source resources. Progress is derived at read time from
milestones, project tasks or a metric, so cached percentages cannot go stale.

Focus priorities and sessions are versioned JSON aggregates carrying
`workspaceId`. A priority stores a local date, order, planned duration and an
optional typed source reference. A session stores planned minutes,
`elapsedSeconds` and `timerStartedAt`; the live elapsed value is derived at read
time so navigation or restart cannot reset the timer. Distractions and the
review are embedded evidence owned by the session. Calendar reservation is a
normal item referenced by `calendarItemId`; deleting either side does not
cascade into the user's source work.

## Vault layout

```text
<Vault>/.app/index.db, settings.json, keymap.json, logs/, revisions/
<Vault>/<Workspace>/notes/, attachments/, maps/, templates/, .trash/
```

Markdown and Canvas files are the content source of truth. Deleting `index.db`
does not delete them; startup detects the missing index and rebuilds it. The
database is the source of truth only for records without a natural portable
file representation.

## Migrations and recovery

Migrations are numbered, forward-only, and applied transactionally by sqlx.
Migration `0005_projects.sql` adds project/goal aggregates and Calendar links.
Migration `0006_focus.sql` adds Focus priorities and sessions.
Vault startup takes a backup before schema work. A failed migration does not
replace the old database. Files are atomic-replaced; lock/hash conflicts are
reported rather than silently merged. Trash manifests retain original paths
and deletion dates. Full export copies notes, Canvas, attachments, templates,
and a structured JSON dump.
