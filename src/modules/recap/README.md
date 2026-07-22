# Recap module

Owns deterministic statistics, narrative generation, validation, revisions,
charts, and PDF printing. `logic.ts` is the factual authority, including habit
and weekday patterns, metric samples and records, tasks, attended events, note
classification, maps, and flashcard review evidence. A Summarizer may change
prose but never statistics. `summarizer.ts` defines interchangeable template,
OpenAI-compatible, and Ollama implementations.

Remote use requires a one-time exact payload preview/consent and defaults to
aggregates only. Aggregate-only payloads remove workspace identifiers, note
titles, tags, course names, and every user-authored label before transmission.
The recommended remote preset is OpenRouter with `moonshotai/kimi-k2.6`; its
key can be entered during onboarding or in Settings and is protected by Windows
DPAPI outside the vault.
Numeric claims are checked against authoritative inputs; failure retries once,
then falls back to the template.

`RecapView.tsx` generates month, year, custom-range, workspace, and combined
reports. Annual reports attach available monthly summaries and render metric
trends. Regeneration updates the same ordinary recap note, allowing the native
note revision system to retain prior prose. `automatic.ts` runs deterministic
monthly/yearly generation for every workspace on due dates in the background
and emits an in-app completion toast; it never makes an unattended network
request.
