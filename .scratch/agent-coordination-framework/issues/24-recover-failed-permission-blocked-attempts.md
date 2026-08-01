# 24 — Recover Failed and Permission-Blocked Attempts

**What to build:** Transient technical failures recover automatically through a
bounded global policy, while exhausted failures and permission blocks become
explicit task attention that the user can Retry, Dismiss, or continue without
allowing later activations to bypass the unresolved expectation.

**Blocked by:** 20 — Consult Agents and Notify the User; 23 — Recover Queued Work After Restart

**Status:** ready-for-agent

- [ ] Only technical runtime failures receive automatic retry; normal completion
  and permission blocks do not.
- [ ] Each activation receives three total automatic attempts with capped
  exponential backoff, independent of process, role, agent, or column.
- [ ] Scheduled retries show the planned next attempt and time without offering
  premature recovery actions.
- [ ] Later activations retain their exact order behind the retrying or exhausted
  head activation.
- [ ] Exhausting automatic attempts creates a failure attention reason with the
  current summary and Retry and Dismiss actions.
- [ ] Retry begins a fresh three-attempt cycle for the same activation, reason,
  source event, workspace, and current task state.
- [ ] Dismiss records that the expectation was abandoned and only then permits
  the preserved queue to advance.
- [ ] A permission block creates explicit attention, suspends the activation,
  and explains that automatic retry is unavailable; continuation retains the
  activation after the user acts or changes policy.
- [ ] Historical attempt entries retain their timing, concise diagnostic,
  thread reference, and transcript access without duplicating current recovery
  controls.
- [ ] Deterministic clock and controlled-runtime tests cover backoff, exhaustion,
  user recovery, permission blocks, and queue preservation.

