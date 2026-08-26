# 76 — Correct Conversation Cost Aggregation

**What to build:** Make the agent-conversation dialog present one truthful
accumulated token-cost breakdown for the conversation, after establishing
whether Codex reports each continued turn's usage as a turn-local delta or as
a cumulative snapshot that already includes earlier turns.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Trace the production path from every `turn.completed` SDK usage payload
  through resumed-conversation isolation, persistence, cost estimation, and
  the conversation dialog. Record whether later SDK payloads include usage
  from earlier turns and whether the framework currently subtracts a reliable
  preceding baseline before pricing them.
- [x] Cover the concrete two-turn case: a first turn reports 50,000 ordinary
  input tokens; a continued turn may report the earlier 50,000 as cached input
  plus 50,000 new input. Establish which values are cumulative SDK counters,
  isolated turn usage, and conversation totals, without counting the first
  turn twice.
- [x] Show one accumulated conversation-level cost control and breakdown in
  the conversation dialog rather than repeating a cost split for every turn.
  The displayed category quantities and subtotals reconcile with the isolated
  settled usage across all turns exactly once.
- [x] Preserve the established pending-work and known-subtotal/lower-bound
  behavior when a running or unpriceable turn prevents a complete total.
- [x] Keep attempt-specific token evidence available where the product already
  promises it, but do not label a cumulative SDK snapshot as though it were
  usage caused only by the later turn.
- [x] If the existing isolation is already correct, make only the presentation
  changes and regression coverage needed; do not redesign token persistence or
  pricing without a demonstrated defect.
- [x] Add focused runtime, application, and browser coverage for first turns,
  resumed turns with cumulative counters, conversation aggregation, unavailable
  baselines, pending work, and the absence of repeated per-turn cost splits.

## Context

Issues 53, 70, and 75 established attempt usage isolation, process-owned cost
estimates, and inspectable aggregate cost breakdowns. Live use nevertheless
showed a separate split beside each conversation turn, and a later turn
appeared large enough that it may have been presenting a cumulative SDK
snapshot as turn-local usage. Resolve that cheaper explanation before treating
the observation as evidence of failed compaction.

## Answer

Codex SDK `turn.completed.usage` is a cumulative snapshot for the resumed
thread, including all metered model calls made by its turns. The existing
same-thread baseline subtraction was therefore necessary and remains the
source of attempt-specific evidence.

Conversation cost now uses the newest monotonic cumulative snapshot once for
each thread when its persisted price is stable. Replacement threads contribute
separate checkpoints. Price changes or untrustworthy checkpoints fall back to
the isolated attempt costs, preserving historical rates and lower-bound or
pending states. The dialog exposes one conversation-level breakdown and no
longer repeats attempt cost splits. Detailed findings are recorded in
[`../research/codex-conversation-usage-and-context-semantics.md`](../research/codex-conversation-usage-and-context-semantics.md).
