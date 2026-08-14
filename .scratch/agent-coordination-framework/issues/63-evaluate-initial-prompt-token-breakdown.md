# 63 — Evaluate an Initial-Prompt Token Breakdown

**What to build:** Determine whether token usage attributable to an attempt's
initial prompt can be measured honestly and shown separately in the transcript
without misrepresenting SDK usage.

**Blocked by:** None

**Status:** open

- [ ] Define what “initial prompt” includes: framework instructions, project
  context, activation facts, role instructions, tool schemas, and any resumed
  conversation context.
- [ ] Verify which of those components can be measured from authoritative SDK
  events or deterministic local serialization and which remain hidden or only
  estimable.
- [ ] Account for cached input, resumed threads, multiple model calls, tool
  schemas, and tokenization differences.
- [ ] Decide whether a separate transcript value would be exact and useful. If
  only an estimate is possible, define a truthful label and error boundary or
  recommend not showing it.
- [ ] Keep issue 53's reported per-attempt usage semantics unchanged unless the
  evidence supports a deliberate replacement.
- [ ] If feasible, add implementation and verification criteria for the minimal
  transcript presentation; otherwise record the limitation and close the
  ticket without speculative UI.

## Context

Issue 53 already persists the complete SDK usage payload and shows compact
uncached input and output values. Issue 56 documented substantial fixed startup
material but did not split it out in the usage UI. This ticket is an evaluation
of whether that split can be both accurate and actionable.

