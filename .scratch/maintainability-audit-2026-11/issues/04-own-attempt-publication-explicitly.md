# 04 — Own attempt publication explicitly

**What to build:** Retain a recovery probe as an ordinary visible attempt when
it produces meaningful effects through one explicit publication owner, while
empty repeated failures retain their compact outage behavior.

**Blocked by:** None.

**Status:** open

**Scheduling:** Deferred by the user. Do not claim or implement until the user
explicitly resumes this effort after the idle game run.

**Parent:** [November assessment](../spec.md).

## Acceptance criteria

- [ ] Establish an internal interface that explicitly owns meaningful-effect
  publication and participates in the caller's existing transaction.
- [ ] Primitive activity insertion no longer changes attempt lifecycle merely
  because a details bag happens to contain an attempt ID.
- [ ] An attempt-aware effect operation may combine publication and recording;
  callers do not have to remember a fragile sequence of independent calls.
- [ ] Preserve meaningful transcript, usage, thread, comment, task and resource
  effects, and ensure rejected commands leave probes provisional.
- [ ] Preserve publication ordering, dispatch-claim handling, timeline/history
  projections, outage compaction, interruption, restart and rollback behavior.
- [ ] Verify the behavior through application/runtime interactions, including
  accepted effects without streamed output and repeated no-progress failures.
- [ ] Keep released migrations immutable; avoid additional transaction owners,
  generic event infrastructure or speculative extension points.
- [ ] Record the publication seam in architecture documentation and durable
  decision reasoning, and leave implementation changes unstaged.
