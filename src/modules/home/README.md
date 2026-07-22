# Home module

Home assembles workspace-scoped read models into the configurable dashboard. It
does not own content: agenda entries, courses, projects, streaks, recent files,
and recap prompts are selected through the public store interface. Widget order
and visibility are persisted per workspace in `AppSettings`.

The dashboard is intentionally a projection. Mutations are routed through the
owning module by opening its tab or command, which preserves module boundaries
and workspace isolation.
