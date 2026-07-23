# Diorna AI module

Diorna AI is an optional, workspace-scoped creation assistant. The launcher is
shown above Settings only when an OpenRouter key exists in secure storage. The
key is protected by Windows DPAPI in Tauri and is never written to the vault.

`planner.ts` sends the request, local time zone, and only the notes explicitly
selected with `/` to the configured OpenRouter endpoint. It requests strict
JSON-schema output from `moonshotai/kimi-k2.6`, requires providers that support
the parameters, and opts out of provider data collection. The first remote
request uses the same exact-payload consent mechanism as Recap.

`types.ts` is the trust boundary. It accepts create-only plans for notes, maps,
calendar items, and habits. It rejects unknown actions, duplicate IDs, invalid
map links, invalid dates, and incomplete quantity habits.

`executor.ts` applies a confirmed plan to the active workspace. Map coordinates
are computed locally from semantic nodes and edges. Created entities are
recorded as one change set so the whole batch can be undone. Provider output is
never executed as code and cannot select or cross a workspace boundary.

The drawer keeps a short conversation history locally per workspace. Every plan
is previewed and requires an explicit **Apply** action before it changes data.
