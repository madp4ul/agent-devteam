# 07 — Migrate execution and conversation activity

**What to build:** Apply checked activity payloads to activation, execution,
attention, automation, recovery and conversation behavior without changing
their durable lifecycle or historical presentation.

**Blocked by:** 05 — Expand typed activity contracts.

**Status:** open

**Scheduling:** Deferred by the user. Do not claim or implement until the user
explicitly resumes this effort after the idle game run.

**Parent:** [November assessment](../spec.md).

## Acceptance criteria

- [ ] Migrate activation creation/dismissal, attempt start/completion, attention
  creation/resolution, automation suspension/resumption, stall recovery, runtime
  waiting/recovery and conversation continuation/retirement events.
- [ ] Migrate typed readers, activation sources, prompt/context handling and
  timeline/conversation presentation together, preserving existing behavior.
- [ ] Preserve provisional-attempt publication, retry episodes, immutable
  attribution, notification decisions, delivery checkpoints and source links.
- [ ] Keep authored message bodies and derived recovery evidence distinct from
  persisted activity payloads; historical decoding retains compatibility.
- [ ] Verify recovery, interruption, restart, notifications and conversation
  scenarios at application/runtime/browser interfaces as appropriate.
- [ ] Keep remaining task/resource callers compatible until their separate
  migration lands; do not weaken types or change transaction ownership.

## Coordination

If attempt publication has already been refactored, use its explicit interface.
Otherwise retain the existing behavior during this migration. Issue 04 and this
ticket need sequencing when they touch the same implementation, but neither is
a semantic prerequisite for the other.
