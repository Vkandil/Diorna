# Third-party notices

Diorna incorporates open-source software. The authoritative licence text and
copyright notices for each package are included in its source package and can
also be found in the installed package metadata. This summary covers the
direct runtime components; their transitive dependencies retain their own
notices.

## Frontend

| Component                                                                                                                                | Licence           |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| React, React DOM, TanStack Query, Zustand, date-fns, rrule, Fuse.js, DOMPurify, html2canvas, Turndown, YAML, Zod, Recharts, Lucide React | MIT               |
| TipTap core, extensions and ProseMirror packages                                                                                         | MIT               |
| React Flow (`@xyflow/react`)                                                                                                             | MIT               |
| KaTeX                                                                                                                                    | MIT               |
| Mermaid                                                                                                                                  | MIT               |
| PDF.js (`pdfjs-dist`)                                                                                                                    | Apache-2.0        |
| jsPDF                                                                                                                                    | MIT               |
| Tauri JavaScript APIs and plugins                                                                                                        | Apache-2.0 OR MIT |

## Native application

The Tauri framework and plugins, serde, serde_json, chrono, csv, fs2, futures,
log, parking_lot, regex, sqlx, thiserror, tokio, uuid, walkdir, windows-rs, zip,
zeroize, sha2, base64 and anyhow are used under their respective permissive
licences, principally Apache-2.0, MIT, BSD-2-Clause, BSD-3-Clause, ISC, and
Unicode-3.0. SQLite is in the public domain.

## Fonts and icons

KaTeX fonts are distributed under the SIL Open Font License 1.1. Lucide icons
are distributed under the ISC licence.

No third-party component changes Diorna's own AGPL-3.0-only licence. When
redistributing a binary, retain this file, the package lockfiles, and every
upstream notice required by the corresponding licence.
