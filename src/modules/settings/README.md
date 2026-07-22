# Settings module

Settings owns device preferences and lifecycle controls: appearance, locale,
vault location, workspaces, editor defaults, categories, calendar and Daily
defaults, recap privacy, keymap, backup, import/export, updates, and legal
information. Native effects are accessed only through `core/native.ts`; the UI
does not reach into Rust commands directly.

Settings and the human-readable keymap are mirrored to `.app/settings.json` and
`.app/keymap.json`. Portable mode disables updater and vault-move controls. The
hidden component-library route is maintained here for design-state review.
