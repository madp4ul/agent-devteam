# 03 — Bound dispatch context reads

**What to build:** Claim an activation and dispatch its agent with current task
state, pins, its exact source and deliberately selected context, without loading
the task's complete retained history first.

**Blocked by:** 02 — Narrow task control reads, which introduces reusable
current-state and selected-activation reads.

**Status:** open

**Scheduling:** Deferred by the user. Do not claim or implement until the user
explicitly resumes this effort after the idle game run.

**Parent:** [November assessment](../spec.md).

## Acceptance criteria

- [ ] Claiming and dispatch use explicit current-state and activation reads.
  History selection and hydration belong to context composition rather than
  callers supplying complete task content.
- [ ] Narrow the runtime request to the facts its consumers need. Preserve
  queued/failed counts, current relationships and resource claims, full pin
  membership, exact source identity and required workspace facts.
- [ ] Preserve initial, returning, retry, replacement-thread and interrupted
  context behavior, including existing retained-payload compatibility.
- [ ] Preserve atomic context checkpoint advancement, immutable provenance,
  source deduplication, attachment scope and process-version handling.
- [ ] Large-history scenarios prove bounded body hydration through claim,
  composition and dispatch. Compact counts may still aggregate retained facts.
- [ ] Run relevant application/context, scheduling, runtime prompt and scoped
  context checks; keep supported fixtures and consumers green together.
- [ ] Update the architecture map and durable design reasoning for the chosen
  seam. No schema or transport change is required merely to narrow reads.
