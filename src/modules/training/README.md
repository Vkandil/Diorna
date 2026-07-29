# Training

Training turns repeated sport notes into structured, workspace-isolated progress data.

## Data model

- Activities represent a discipline such as strength, running, swimming or a custom sport.
- Exercises belong to an activity and choose the fields that are useful: load/repetitions,
  duration, distance, or a mixed set.
- The searchable catalogue provides over 100 common suggestions and aliases without closing the
  system: an unmatched name creates a custom exercise directly.
- Strength exercises distinguish external load, repetitions-only bodyweight, optional added load,
  and assisted movements. The chosen tracking mode is snapshotted into templates and sessions.
- Templates save exercise order, units and planned set counts.
- Sessions contain immutable exercise/result names so historical records remain readable if the
  library changes later.

Activities, exercises, templates and sessions are persisted in SQLite in the desktop build and in
the normal web-state persistence during browser development.

## Connections

- Scheduling a template creates a linked Calendar event.
- Starting that event links the Calendar item back to its Training session.
- Completing a tracked activity recalculates the matching Daily quantity entry in minutes.
- New Recaps include session count, time, volume, distance, activity distribution and records.
- The optional note importer recognizes dated entries such as `Leg curl 3x20 @ 25 kg`,
  `Running 5 km in 30 min`, and `Mobility 20 min`. It never modifies the source note.

## Progress rules

Strength volume is `load × repetitions` for completed sets. Progress charts use completed
sessions only. A Recap personal record is counted when the best load in the requested period is
higher than the best load recorded before that period.
