# 24 — Recover Failed and Permission-Blocked Attempts

**What to build:** Transient technical failures recover automatically through a
bounded global policy, while exhausted failures and permission blocks become
explicit task attention that the user can Retry, Dismiss, or continue without
allowing later activations to bypass the unresolved expectation.

**Blocked by:** 20 — Consult Agents and Notify the User; 23 — Recover Queued Work After Restart

**Status:** resolved

- [x] Only technical runtime failures receive automatic retry; normal completion
  and permission blocks do not.
- [x] Each activation receives three total automatic attempts with capped
  exponential backoff, independent of process, role, agent, or column.
- [x] Scheduled retries show the planned next attempt and time without offering
  premature recovery actions.
- [x] Later activations retain their exact order behind the retrying or exhausted
  head activation.
- [x] Exhausting automatic attempts creates a failure attention reason with the
  current summary and Retry and Dismiss actions.
- [x] Retry begins a fresh three-attempt cycle for the same activation, reason,
  source event, workspace, and current task state.
- [x] Dismiss records that the expectation was abandoned and only then permits
  the preserved queue to advance.
- [x] A permission block creates explicit attention, suspends the activation,
  and explains that automatic retry is unavailable; continuation retains the
  activation after the user acts or changes policy.
- [x] Historical attempt entries retain their timing, concise diagnostic,
  thread reference, and transcript access without duplicating current recovery
  controls.
- [x] Deterministic clock and controlled-runtime tests cover backoff, exhaustion,
  user recovery, permission blocks, and queue preservation.

## Answer

Implemented durable three-attempt recovery cycles for technical failures with
five- and ten-second capped exponential delays. Retry schedules, diagnostics,
attempt outcomes, exhaustion, dismissal, and permission blocks are persisted so
restart recovery preserves both the cycle and the activation queue. Exhausted
failures expose Retry and Dismiss; permission blocks are reported explicitly by
the coordination MCP boundary and expose Continue with guidance that policy or
the required action must be addressed first.

The board and task views now show scheduled retry timing, attempt diagnostics,
and the appropriate recovery controls without duplicating them in history.
Deterministic application tests cover delays, exhaustion, restart interruption,
queue preservation, and all user recovery paths. Type checking, 85 unit tests,
the production build, 12 browser tests, and `git diff --check` pass. The final
Standards and Spec reviews report no remaining findings.
