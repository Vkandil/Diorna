# Student services

This module owns the course dashboard, editable study templates, review queue,
and workspace bibliography. Its UI-independent rules cover SM-2 scheduling,
basic/cloze-card extraction, retention and review streaks, BibTeX and CSL-JSON
normalisation, citation-key discovery, and APA/IEEE/Harvard formatting.

Notes integrates the exported flashcard and live reference-list blocks, but the
student module remains responsible for review and citation behaviour. Cards,
logs, templates, and references retain their source/workspace ownership at the
repository boundary and are persisted in the native structured snapshot.
