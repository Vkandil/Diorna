# Notes module

Owns the TipTap editor, custom study/media/technical nodes, wiki links,
backlinks, tags, query parsing, templates, and search/replace planning.
`logic.ts` is framework-free and tested. `extensions.tsx` is the sanitised
rendering boundary for KaTeX and Mermaid. Persistence is requested through the
core native adapter; no note component writes files directly.

The workspace UI includes nested folder and tag browsers, pinned saved
searches, boolean/field queries, replacement previews with undo, typed
frontmatter properties, course assignment, a filtered read-only graph, live
wiki-link completion, a `/page` child-page command, visual inline page links,
parent-labelled back navigation, revision diffs/restoration, and note/folder/course
Markdown, direct PDF, and print export. Explorer drops and clipboard pastes copy
media into the workspace, render it through Tauri's scoped asset protocol, and
expose pointer/keyboard block reordering plus media sizing and alignment. Images
open in an accessible full-screen lightbox. `PdfAttachmentViewer.tsx` uses
PDF.js for page thumbnails, navigation, zoom, selectable page text, and
page-anchored quote insertion. Native saves preserve stable IDs and metadata,
move renamed files, index tags/properties, and retain the newest 50 revisions
plus every revision from the last 30 days.

Public invariants: autosave is at most one second; Markdown is portable; note
rename rewrites workspace links; rendered untrusted content is sanitised; note
deadlines synchronise through the shared item interface.
