# Non-functional requirements report

This file is the reproducible acceptance record. Measurements must be repeated
on the reference machine (11th-generation Intel i5, 16 GB RAM, SSD) and on clean
Windows 10 1809 and Windows 11 systems before a signed public release.

## Automated evidence — 2026-07-28

| Gate                      | Result                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| TypeScript strict build   | Pass                                                                                          |
| ESLint, zero warnings     | Pass                                                                                          |
| Business-logic unit tests | 223/223 pass across 23 suites                                                                 |
| Business-logic coverage   | 97.34% statements, 80.89% branches, 97.05% functions, 98.07% lines                            |
| Parser corpus             | 63 cases pass                                                                                 |
| Workspace isolation       | 19 tests covering all 16 content entity classes                                               |
| Rust tests                | 24/24 pass, including link-preview SSRF guards, import+undo, recovery, trash, DPAPI, and XLSX |
| Playwright acceptance     | 21/21 pass, including rich links, AI Maps, PDF quoting, month drag/drop, media, and WCAG      |
| Reference web performance | Pass at 5,000 notes, 50 maps, 3,000 items, and 730 days of habit history                      |
| npm production audit      | 0 known vulnerabilities                                                                       |
| RustSec audit             | Pass with three documented upstream/unused-feature exceptions below                           |
| Production web build      | Pass; shell entry 488.66 kB minified / 157.99 kB gzip; PDF.js and feature modules lazy-loaded |
| Native release compile    | Pass; optimized `diorna.exe` built from a clean Cargo target                                  |
| Windows bundles           | Pass; x64 EN/FR MSI and NSIS generated locally                                                |

## Design evidence

- NFR-8/9/14: no account or telemetry dependency; deterministic recap and all
  core modules work offline. Network adapters are explicit and user-triggered.
- NFR-10: atomic file replacement, WAL/full-sync database, pre-migration and
  daily backup paths, revisions, trash, and index reconstruction are tested.
- NFR-11: keyboard paths, focus-visible styles, semantic controls, responsive
  200% layout, and reduced-motion CSS exist; automated axe plus manual screen
  reader/contrast checks are release gates.
- NFR-12: English/French locale resources and locale setting ship; the string
  extraction audit is a release gate.
- NFR-13: React error boundary, serialisable Rust errors, copy diagnostics, and
  local rotating logs prevent a blank-screen failure mode.

## Security audit exceptions

The project audit configuration temporarily accepts RUSTSEC-2026-0194 and
RUSTSEC-2026-0195 because Tauri 2.11.5 currently resolves `plist` 1.8.0, which
pins `quick-xml` below the fixed release. Diorna does not parse user-supplied
plist/XML and does not ship a macOS target. RUSTSEC-2023-0071 is attached to
sqlx's optional MySQL dependency in `Cargo.lock`; Diorna disables sqlx default
features, compiles SQLite only, and `rsa` is absent from the all-target compiled
graph. Dependabot is expected to remove these exceptions as soon as upstream
constraints allow it; they must be re-reviewed for every release.

## Performance protocol

Generate a fixture with 5,000 notes, 50 maps, 3,000 items, 24 months of entries,
a 10,000-word note, and a 1,000-node map. Build `--release`; run three cold and
ten warm trials with Windows Performance Recorder. Record p50/p95 for startup,
note open, incremental FTS search, calendar switch, grid toggle, and 200-node
pan. Record private working set after 10 idle minutes and the installed/bundle
sizes. Fail release if any requirement in §14 of the specification is exceeded.

| Metric                        |            Target | Recorded release value                                                                          |
| ----------------------------- | ----------------: | ----------------------------------------------------------------------------------------------- |
| Cold/warm interactive         |       <2 s / <1 s | To be recorded on release hardware                                                              |
| Note open / editor frame      |  <100 ms / <16 ms | To be recorded                                                                                  |
| Search p95                    |           <200 ms | To be recorded                                                                                  |
| 200-node map                  |            60 fps | To be recorded                                                                                  |
| Calendar switch / grid toggle |  <100 ms / <30 ms | To be recorded                                                                                  |
| Idle/heavy memory             | <400 MB / <700 MB | To be recorded                                                                                  |
| Installer / installed         |  <30 MB / <150 MB | Unsigned NSIS 10.29 MiB; MSI 11.32 MiB; executable 13.33 MiB. Recheck signed/install footprint. |

The release owner signs this report with hardware, OS build, commit, artifact
hash, raw trace location, and date. Unmeasured cells prohibit promotion; they
are not silently treated as passing.
