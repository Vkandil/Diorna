# Notes module

Owns the TipTap editor, custom study/media/technical nodes, wiki links,
backlinks, tags, query parsing, templates, and search/replace planning.
`logic.ts` is framework-free and tested. `extensions.tsx` is the sanitised
rendering boundary for KaTeX and Mermaid. Persistence is requested through the
core native adapter; no note component writes files directly.

Public invariants: autosave is at most one second; Markdown is portable; note
rename rewrites workspace links; rendered untrusted content is sanitised; note
deadlines synchronise through the shared item interface.
