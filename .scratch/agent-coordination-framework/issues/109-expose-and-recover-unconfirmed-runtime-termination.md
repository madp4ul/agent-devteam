# 109 — Expose and recover unconfirmed runtime termination

**Type:** task

**Status:** open

**Blocked by:** 108 (resolved)

## Problem

Issue 108 handles taskkill errors when process inspection can establish exit.
Unexpected worker loss or unavailable/failed inspection still reaches a permanently
pending promise, with only a host-console diagnostic. Users see Running or
Interrupting and cannot tell whether an agent is working, stopping or awaiting
termination verification. Pause and CLI shutdown can still wait indefinitely.

## Acceptance criteria

- Represent execution, cleanup, and unconfirmed termination separately through
  runtime lifecycle, authoritative application projections and browser display.
  A terminal budget failure must not look like ongoing model work while retaining
  task ownership until safe termination can be established.
- Surface the termination diagnostic and an explicit recovery action. Allow
  failed inspection to be retried and confirmed exit to settle without host restart;
  repeated requests must join the same recovery operation, not start another run.
- Preserve live-process and PID-reuse safeguards. Never force-unlock a task merely
  because a timeout expired. Document cases where identity evidence cannot be
  reconstructed, including limitations of snapshot-based ancestry.
- Provide a supported safe-stop/restart procedure preserving durable conversation
  history and native thread lineage; do not make users guess whether killing the
  host loses completed work. Decide the shutdown response for genuinely unverifiable
  ownership explicitly rather than silently hanging.
- Test inspection failure followed by recovery, unexpected worker loss, genuine
  surviving children, Pause and shutdown using real disposable processes and the
  application/HTTP boundaries; no model calls or live-project mutations.
- Update architecture and ADR for any added lifecycle or recovery contract.

## Comments

2026-11-11: Follow-up from rereading the original budget incident in chat
`01a1cc87-8f6d-70f0-a959-ba88ae05ba95`; see issue 108's symptom-by-symptom audit.
This is proposed work, not implemented by issue 108.
