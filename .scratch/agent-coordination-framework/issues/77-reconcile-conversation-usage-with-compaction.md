# 77 — Reconcile Conversation Usage with Automatic Compaction

**What to build:** Explain and, only if necessary, correct a continued agent
conversation that appears to exceed Codex's expected automatic-compaction
boundary after the conversation cost display has ruled out cumulative usage
accounting as the cause.

**Blocked by:** 76 — Correct Conversation Cost Aggregation.

**Status:** ready-for-agent

- [ ] Start from issue 76's documented SDK-counter and display semantics. If
  the reported 400,000-plus cached-input observation is fully explained by a
  cumulative snapshot or double-counted presentation, record that conclusion
  and resolve this ticket without speculative runtime changes.
- [ ] Otherwise reproduce or obtain equivalent evidence from a sufficiently
  long continued framework conversation and distinguish cumulative metered
  usage across model calls from the active context presented to one model call.
- [ ] Verify the effective model context and automatic-compaction configuration
  for the framework-launched runtime, including whether continued threads still
  inherit the no-override behavior established by issue 74.
- [ ] Establish whether compaction occurred and whether the post-compaction
  prompt, cache-read counters, and retained conversation facts are consistent
  with Codex behavior. Do not infer live context occupancy from cumulative token
  usage alone.
- [ ] If the framework prevents or bypasses expected compaction, correct the
  narrow runtime boundary without pinning a stale universal threshold. If Codex
  behaves correctly, leave runtime policy unchanged and document the evidence.
- [ ] Add the smallest reliable regression or upgrade check that guards the
  demonstrated failure mode; avoid paid long-context probes when source,
  configuration, or controlled fixtures answer the question.

## Context

Issue 74 established that the then-pinned SDK inherited Codex's model-aware
automatic-compaction default. This follow-up exists because live usage later
showed more than 400,000 cached input tokens. Such a number can describe
cumulative metered work rather than one call's active context, so issue 76 must
settle the accounting semantics first.
