# Calendar module

Owns the Day, Week, Month, and Agenda projections over one item entity. Tasks
and events share categories, recurrence, reminders, and linking. `parser.ts`
converts natural language into a previewable draft; `recurrence.ts` expands
RRULEs and exceptions; `reminders.ts` is the native-toast adapter.

Direct manipulation is optimistic but persists through the shared store. Note
deadlines and Daily time blocks communicate through defined item mutations,
not imports of either feature's UI.
