# 77 — Reconcile Conversation Usage with Automatic Compaction

**What to build:** Reconcile cumulative conversation usage with Codex automatic
compaction, then expose Codex's own latest active-context calculation as a small
accessible circular meter beside conversation cost.

**Blocked by:** 76 — Correct Conversation Cost Aggregation.

**Status:** resolved

- [x] Start from issue 76's documented SDK-counter and display semantics. If
  the reported 400,000-plus cached-input observation is fully explained by a
  cumulative snapshot or double-counted presentation, record that conclusion
  and resolve this ticket without speculative runtime changes.
- [x] Otherwise reproduce or obtain equivalent evidence from a sufficiently
  long continued framework conversation and distinguish cumulative metered
  usage across model calls from the active context presented to one model call.
- [x] Verify the effective model context and automatic-compaction configuration
  for the framework-launched runtime, including whether continued threads still
  inherit the no-override behavior established by issue 74.
- [x] Establish whether compaction occurred and whether the post-compaction
  prompt, cache-read counters, and retained conversation facts are consistent
  with Codex behavior. Do not infer live context occupancy from cumulative token
  usage alone.
- [x] If the framework prevents or bypasses expected compaction, correct the
  narrow runtime boundary without pinning a stale universal threshold. If Codex
  behaves correctly, leave runtime policy unchanged and document the evidence.
- [x] Add the smallest reliable regression or upgrade check that guards the
  demonstrated failure mode; avoid paid long-context probes when source,
  configuration, or controlled fixtures answer the question.
- [x] Read `last_token_usage.total_tokens` and `model_context_window` from the
  completed thread's local Codex evidence without treating absence as a run
  failure.
- [x] Match Codex's context-percentage calculation and retain only the latest
  measurement for the conversation's current thread across restart.
- [x] Show an accessible circular context-fill meter beside conversation cost,
  with exact token and percentage details in dark and light themes.

## Context

Issue 74 established that the then-pinned SDK inherited Codex's model-aware
automatic-compaction default. This follow-up exists because live usage later
showed more than 400,000 cached input tokens. Such a number can describe
cumulative metered work rather than one call's active context, so issue 76 must
settle the accounting semantics first.

## Answer

The 400,000-plus observation is explained by cumulative metered work. A local
continued Codex session showed 587,019 cumulative tokens while its latest active
context was only 61,084 of a reported 258,400-token window. No compaction record
was present because that active context never approached the inherited automatic
compaction boundary; the framework still supplies no context-window or
auto-compaction override.

The runtime now reads the newest `token_count` record from the completed thread's
local rollout, adapts `last_token_usage.total_tokens` and
`model_context_window`, and matches Codex's 12,000-token-baseline percentage
calculation. It caches the thread's rollout path and scans backward, while a
missing or changed record simply omits the optional measurement. The latest
measurement for the conversation's current thread survives restart and appears
as an accessible circular meter beside cost, with exact details on focus or
hover in both themes. No paid probe or compaction-policy change was needed.
