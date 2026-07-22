# Daily module

Owns the spreadsheet-like habit and metric grids. `logic.ts` defines
applicability, quantity completion, exact score semantics, streaks, period
summaries, weekday averages, and month-over-month metric deltas. Inactive
weekdays and out-of-range dates are excluded; an empty applicable set yields no
score. Archived habits leave the live grid while an explicit historical mode
keeps their records in past Recaps.

Cell changes are optimistic and completely keyboard accessible. Date windows,
collapsed category groups, and custom ranges persist per workspace. Habit and
metric definitions plus their entry histories cross the native structured-data
port into SQLite. CSV is a browser download; XLSX crosses the native
spreadsheet port and contains typed Habits and Metrics worksheets for the
visible or custom range.

`DailyView.tsx` contains the dense frozen-row/frozen-column interface, inline
quantity and metric entry, row and cell context actions, drag ordering, archive
management, contribution heatmaps, and full metric charts. The application
shell reads the selected habit through the store to render its statistics in
the right context panel without breaking workspace isolation.
