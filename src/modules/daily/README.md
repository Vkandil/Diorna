# Daily module

Owns the spreadsheet-like habit and metric grids. `logic.ts` defines
applicability, quantity completion, exact score semantics, streaks, and
statistics. Inactive weekdays, archived habits, and out-of-range dates are
excluded; an empty applicable set yields no score.

Cell changes are optimistic and completely keyboard accessible. CSV is a
browser download; XLSX crosses the native spreadsheet port and contains typed
Habits and Metrics worksheets.
