# 02 — Narrow task control reads

**What to build:** Stop and interrupt a task using the current task and selected
activation facts, without hydrating complete task history or the containing
board's tasks.

**Blocked by:** None.

**Status:** open

**Scheduling:** Deferred by the user. Do not claim or implement until the user
explicitly resumes this effort after the idle game run.

**Parent:** [November assessment](../spec.md).

## Acceptance criteria

- [ ] Introduce explicit internal reads for current task state and one selected
  activation. Their interfaces do not require complete comments, activity or
  attempt arrays; the dispatch follow-up can reuse the current-state facts.
- [ ] Stop and interrupt preserve existing eligibility, missing-task outcomes,
  interruption confirmation, idempotency, settlement and dismissal behavior.
- [ ] Remove complete task and board hydration from those control decisions;
  retain intentional full-history inspection for consumers that need it.
- [ ] Verify controls against tasks with large retained histories and unrelated
  board tasks. Demonstrate bounded hydration through meaningful instrumentation
  or equivalent evidence, rather than timing thresholds alone.
- [ ] Preserve HTTP and scoped-agent behavior through the existing application
  interface and appropriate control/termination tests.
- [ ] Update the architecture map if the implemented read seam changes it;
  preserve authoritative transaction ownership and leave changes unstaged.
