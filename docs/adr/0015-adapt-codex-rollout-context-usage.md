# Adapt Codex rollout context usage at the runtime boundary

Status: accepted

Read the newest `token_count` record from the local rollout file for a completed
Codex thread and adapt its `last_token_usage.total_tokens` and
`model_context_window` into optional conversation context-fill evidence. Match
Codex's own context percentage calculation, including its 12,000-token baseline,
rather than inferring occupancy from cumulative SDK billing counters.

Keep this integration inside the Codex runtime adapter. Cache the rollout path
by thread and scan records backward so long sessions do not require repeatedly
loading their complete history. Persist the resulting attempt measurement in
coordination state; projections select the newest measurement belonging to the
conversation's current thread.

## Consequences

- The browser can show the same operational context signal as Codex without
  confusing it with cumulative metered usage.
- Rollout format is an upstream, version-sensitive integration boundary. A
  missing, unreadable, or changed record produces no meter and cannot fail an
  agent run.
- Runtime regression coverage pins the expected record shape and Codex
  percentage calculation for the repository's SDK version.
- A future supported SDK or app-server field can replace rollout reading behind
  the same runtime contract without changing persistence or browser behavior.
