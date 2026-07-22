# Recap module

Owns deterministic statistics, narrative generation, validation, revisions,
charts, and PDF printing. `logic.ts` is the factual authority. A Summarizer may
change prose but never statistics. `summarizer.ts` defines interchangeable
template, OpenAI-compatible, and Ollama implementations.

Remote use requires a one-time payload preview/consent and defaults to
aggregates only. Numeric claims are checked against authoritative inputs;
failure retries once with a stricter prompt, then falls back to the template.
