# Native core

The Tauri core owns OS capabilities and durable data. `storage.rs` handles
vaults, migrations, atomic writes, revisions, Canvas validation, FTS, and
backups. `lifecycle.rs` handles non-destructive imports, manifests, trash,
restore, and portable export. `secrets.rs` is the Windows DPAPI boundary.
`spreadsheet.rs` emits Excel workbooks without parsing untrusted spreadsheets.

Commands return serialisable domain errors. Paths are validated relative to a
known workspace root; file writes are temp/flush/atomic-replace; API keys live
under app data rather than the vault.
