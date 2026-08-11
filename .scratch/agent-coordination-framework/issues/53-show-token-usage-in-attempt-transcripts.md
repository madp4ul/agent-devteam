# 53 — Show Token Usage in Attempt Transcripts

**What to build:** Capture the token usage reported by Codex for each completed
attempt turn and show a compact usage summary inside that attempt's transcript
overlay, without promoting token usage to the board, task overview, or Agent
activity surfaces.

**Blocked by:** None

**Status:** resolved

- [x] When the Codex SDK emits `turn.completed`, capture its complete usage
  payload for the current attempt: input, cached input, cache-write input,
  output, and reasoning-output tokens.
- [x] Persist usage with the attempt's durable outcome and transcript so it
  remains inspectable after application restart until explicit task archival.
- [x] Keep usage scoped by attempt ID. Continued or retried activations never
  overwrite or combine the usage of earlier attempts, even when they reuse the
  same Codex thread.
- [x] Establish from authoritative Codex SDK semantics whether the reported
  token categories have a correct, non-overlapping formula for one
  representative total. If so, show that total as the primary usage number and
  keep its component breakdown secondary; do not invent a formula or
  double-count categories that are subsets of other reported values.
- [x] If no accurate representative total can be established, show every
  reported token category rather than presenting a misleading total. Keep the
  complete set visually small and compact so usage does not compete with the
  transcript's messages, tool activity, and diagnostics.
- [x] Label the information as token usage rather than monetary cost. Do not
  infer currency spend from token counts or imply that SDK-reported tokens map
  directly to a particular billing arrangement.
- [x] If an attempt ends without a `turn.completed` usage payload, omit the
  summary or state that usage is unavailable. Never display zero as though it
  were measured usage.
- [x] Running transcripts may defer the usage summary until Codex reports the
  completed turn; no live token counter is required.
- [x] Do not add token usage, totals, or cost estimates to board cards, board
  controls, task overview facts, Agent activity, or process-wide overview
  surfaces. Cross-attempt aggregation is outside this ticket.
- [x] Controlled streamed-runtime, persistence/restart, resumed-thread, and
  browser tests cover complete usage, unavailable usage, attempt isolation,
  compact transcript presentation, and the absence of usage from overview
  surfaces.

## Context

The framework already consumes `turn.completed` while streaming an attempt,
but currently records only that completion occurred and discards the event's
usage payload. The installed Codex SDK exposes `input_tokens`,
`cached_input_tokens`, `cache_write_input_tokens`, `output_tokens`, and
`reasoning_output_tokens` on that event.

The transcript is the intended inspection surface because usage explains the
resource footprint of one concrete run. Broader reporting, budgets, alerts,
pricing metadata, and process- or agent-level aggregation should be proposed
separately if they become useful.

A single number is preferable when it faithfully represents the reported
usage. Cached input, cache-write input, and reasoning output may overlap with
broader input or output categories, so the implementation must verify their
semantics before summing them. When no such total is defensible, compactness
comes from presentation rather than from hiding categories.

## Comments

- “Token spend” in this ticket means measured token consumption, not a currency
  charge.
- Existing attempts have no framework-persisted usage payload. The feature need
  not reconstruct historical usage from Codex session internals.

## Answer

Implemented per-attempt token usage capture, durable persistence, and a compact
transcript-only summary. The primary total is `input_tokens + output_tokens`;
cached input, cache-write input, and reasoning output remain secondary detail
because they overlap those broader categories. The SDK's cumulative resumed-
thread snapshots are converted to attempt deltas only when the immediately
preceding attempt has a trustworthy baseline; otherwise usage is omitted.

Authoritative semantics and source links are recorded in
[`../research/codex-sdk-token-usage-semantics.md`](../research/codex-sdk-token-usage-semantics.md).
Runtime, restart persistence, resumed-thread isolation, missing-usage, and
browser presentation coverage were added.
