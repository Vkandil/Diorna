# Beta and clean-machine checklist

Use one row per machine and tester. Never ask testers to share a real vault;
provide a disposable fixture or let them create synthetic content.

## Required matrix

| Environment                | Architecture | Build               | Owner      | Result  |
| -------------------------- | ------------ | ------------------- | ---------- | ------- |
| Windows 10 1809+           | x64          | MSI and NSIS        | Unassigned | Pending |
| Windows 11 current         | x64          | MSI, NSIS, portable | Unassigned | Pending |
| Windows 11 current         | ARM64        | MSI, NSIS, portable | Unassigned | Pending |
| Windows 11 at 200% scaling | x64 or ARM64 | Installer           | Unassigned | Pending |

## Smoke test

1. Verify the SHA-256 file and Authenticode signature before installation.
2. Install without development tools; launch onboarding in English and French.
3. Rename, recolor, reorder, create, and delete workspaces.
4. Create a note; add an image, video, and PDF by file drag/drop; reorder the
   blocks; export the note to PDF.
5. Create a Map; drop the same media; move nodes; edit a linked note and verify
   its refreshed content in the Map.
6. Create calendar events and drag one between month cells.
7. Record a quantity habit and a metric in Daily.
8. Import the synthetic Obsidian and Notion fixtures, then undo the imports.
9. Configure a disposable OpenRouter key, preview and cancel an AI plan, create
   one Map, restructure it, inspect usage, then undo the batch.
10. Restart, verify persistence, quick capture, tray, global shortcut, backup,
    update check, uninstall, and retained user vault.

Record Windows build, hardware, display scale, Diorna commit, artifact hash,
duration, failures, and sanitised diagnostics in the release issue. Complete
the performance protocol in `docs/nfr-report.md` on the reference machine.
