# Diorna AI module

Diorna AI is an optional, workspace-scoped creation assistant. The launcher is
shown above Settings only when an OpenRouter key exists in secure storage. The
key is protected by Windows DPAPI in Tauri and is never written to the vault.

`planner.ts` sends the request, local time zone, and only the notes explicitly
selected with `/` to the configured OpenRouter endpoint. It requests strict
JSON-schema output from `moonshotai/kimi-k2.6`, requires providers that support
the parameters, enables JSON response healing, and opts out of provider data
collection. Root arrays and common plan envelopes are normalized. If a response
is empty or invalid, one corrective request is made and validated. The first remote
request uses the same exact-payload consent mechanism as Recap.

The first provider request is capped at 60 seconds and the corrective request at
30 seconds. Both are aborted after their deadline, and the user can stop either
request from the composer without applying a partial plan.

`types.ts` is the trust boundary. It accepts create-only plans for notes, maps,
calendar items, and habits. It rejects unknown actions, duplicate IDs, invalid
map links, invalid dates, and incomplete quantity habits.

`executor.ts` applies a confirmed plan to the active workspace. Map coordinates
are computed locally from semantic nodes and edges. A map can link an explicitly
mentioned existing note, and generated notes may appear anywhere in the plan.
Generated maps require one locked central concept, labeled relationships, and a
directed path from that center to every node. Branches are arranged radially
around the center, with deeper sub-branches extending outward. Every note created
for a map receives a stable `map/<map-name>` tag so the generated research remains
filterable as one group.
Created entities are
recorded as one change set so the whole batch can be undone. Provider output is
never executed as code and cannot select or cross a workspace boundary.

The chat occupies the left sidebar, keeps a short conversation history locally
per workspace, and displays request, provider, validation, and repair progress.
Every plan is previewed and requires an explicit **Apply** action before it
changes data.
