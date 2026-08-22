# 63 — Evaluate an Initial-Prompt Token Breakdown

**What to build:** Determine whether token usage attributable to an attempt's
initial prompt can be measured honestly and shown separately in the transcript
without misrepresenting SDK usage.

**Blocked by:** None

**Status:** resolved

- [x] Define what “initial prompt” includes: framework instructions, project
  context, activation facts, role instructions, tool schemas, and any resumed
  conversation context.
- [x] Verify which of those components can be measured from authoritative SDK
  events or deterministic local serialization and which remain hidden or only
  estimable.
- [x] Account for cached input, resumed threads, multiple model calls, tool
  schemas, and tokenization differences.
- [x] Decide whether a separate transcript value would be exact and useful. If
  only an estimate is possible, define a truthful label and error boundary or
  recommend not showing it.
- [x] Keep issue 53's reported per-attempt usage semantics unchanged unless the
  evidence supports a deliberate replacement.
- [x] If feasible, add implementation and verification criteria for the minimal
  transcript presentation; otherwise record the limitation and close the
  ticket without speculative UI.

## Context

Issue 53 already persists the complete SDK usage payload and shows compact
uncached input and output values. Issue 56 documented substantial fixed startup
material but did not split it out in the usage UI. This ticket is an evaluation
of whether that split can be both accurate and actionable.

## Answer

The [caching and conversation-cost research](../research/initial-prompt-caching-and-conversation-cost.md)
found that the SDK cannot attribute reported input tokens or cost exactly to
Codex instructions, tool schemas, project context, framework guidance, task
text, and inherited history. A locally tokenized framework string would omit
model-specific serialization and would misrepresent mixed cache reads, cache
writes, and uncached input, so no separate transcript value is warranted.

Continuing the stored Codex thread is nevertheless a material improvement over
starting a new conversation for each interaction. The framework resumes the
same session-derived cache key, preserves append-only history, sends only new
task text and activity on later activations, and uses a smaller prompt again for
retries. This is the cache-friendly conversation shape described by OpenAI, but
old context is not free: it remains billed input and receives the cached rate
only when an eligible exact-prefix entry is still available.

No framework-specific cache-destroying defect was found. Model-visible tool
schemas remain stable, while attempt-specific authorization stays outside the
prompt. The remaining miss risks are retention expiry or eviction, thread
replacement, model/tool/settings changes, and Codex compaction. Codex SDK
0.146.0 does not expose supported retention or explicit-breakpoint controls, so
there is no low-risk prompt-cache switch for the framework to enable here.

The actionable follow-up, if cost tuning becomes a priority, is diagnostics
over the already persisted attempt-isolated usage: compare cache-read and
cache-write ratios by thread, model, elapsed time, fresh/resumed/replaced state,
model/tool rounds, and compaction. Prompt or compaction changes should follow a
measured repeatable miss pattern rather than a speculative component estimate.
