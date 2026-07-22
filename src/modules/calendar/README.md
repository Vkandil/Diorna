# Calendar module

Owns the Day, Week, Month, and Agenda projections over one item entity. Tasks
and events share categories, recurrence, reminders, and linking. `parser.ts`
converts natural language into a previewable draft; `recurrence.ts` expands
RRULEs and exceptions; `reminders.ts` is the native-toast adapter.

Direct manipulation is optimistic but persists through the shared store. Note
deadlines and Daily time blocks communicate through defined item mutations,
not imports of either feature's UI.

`CalendarView.tsx` owns the per-workspace/per-view display preferences and the
undo boundary. It expands RRULE occurrences only for the visible range, asks
for an occurrence scope before mutations, and keeps the underlying series as
the persisted entity. Pure RRULE construction, splitting, and whole-series
date normalisation live in `series.ts`. `noteTasks.ts` recognises dated task-list blocks and
maintains their note ID plus stable task-line link so completion can round-trip
between the editor and calendar. Native structured persistence stores that
line in `item.source_note_line`; toast action payloads reopen the matching item.
