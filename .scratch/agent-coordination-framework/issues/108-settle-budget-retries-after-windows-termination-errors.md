# 108 — Settle budget retries after Windows termination errors

**Type:** task

**Status:** resolved

## Problem

After Codex budget exhaustion, Windows taskkill returned error 255 for descendants
that were already gone or could not be terminated. The supervisor cached a
promise that never settles on any termination error. Three empty retry probes
therefore remained running; Pause drained forever and Interrupt / Stop retries
could not complete. A waiting episode was simultaneously visible in the browser.

## Acceptance criteria

- Reproduce the reported error through the real runtime boundary without model
  calls or operating the recovered user host.
- Distinguish failed termination commands from confirmed process liveness.
  Settle rejected runs and interruptions once owned execution is confirmed gone;
  do not release ownership solely on worker exit, timeout or localized error text.
- Preserve protection against surviving descendants, unrelated processes and
  PID reuse. Failed inspection must not falsely confirm termination.
- Verify budget waiting removes the active-run projection and lets Pause finish;
  keep existing retry, interruption, suspension and conversation-continuity rules.
- Document the runtime contract, test evidence and review in this existing effort.
- Leave the recovered live host paused and unchanged. Leave changes unstaged.

## Comments

2026-11-11: Live diagnostics confirm taskkill error 255 for three owned workers.
Before implementation, recovered the user's instance with a verified SQLite
snapshot, exported live transcripts and copies of all three native rollouts.
Restarted original code paused; conversation history and native thread IDs match
the pre-stop snapshot. Operational evidence remains in the already-existing
`../../incident-2026-11-11-budget-stop/`; do not create another scratch effort.

2026-11-11: User authorized continuing the fix using implement and an issue.
Tests use the existing Codex runtime interface and CoordinationApplication seam.
The captured regression injects error 255 after real taskkill termination and
fails with `still blocked` before the fix. The initial parked implementation
needs further surviving-descendant verification before it can be delivered.

## Implementation and reproduction

The deterministic regression runs the real SDK worker against a disposable
native-program fixture, then injects the reported taskkill error at the OS
boundary after actual tree termination. Before the fix the runtime remains
`still blocked`; afterward it settles the budget rejection or interruption.

Windows termination now captures process identities (PID, parent PID and creation
time) before taskkill. A failed command triggers fresh liveness verification.
Verification follows retained ancestry on every inspection, including children
born after the initial snapshot; creation intervals distinguish the original
parent's surviving children from a replacement process reusing its PID. Surviving
owned processes retain execution ownership and are periodically rechecked until
they exit. Missing evidence never becomes successful termination. Successful
taskkill remains sufficient even if process inspection is unavailable.

Existing application-level coverage explicitly asserts that budget waiting has
no active-run projection and Pause reaches paused. No browser state, schema,
conversation continuation or account behavior is changed. Architecture and ADR
0043 record the verification contract and snapshot-based containment limits.

## Review

### Standards

No remaining actionable findings. Review identified missing late-child discovery
and a reused-parent edge that hid an older surviving child. Both were reproduced
with failing runtime tests, corrected and independently re-reviewed.

### Spec

No remaining actionable findings within the documented process-tree verification
scope. The same two safety findings are resolved; inspection cannot reconstruct
an intermediate ancestor born and gone entirely between observations, as recorded
explicitly in ADR 0043. This is not Windows job-object containment.

Review totals: Standards 0 remaining; Spec 0 remaining. No remaining worst issue
on either axis. Review baseline: `7dc47fa74590bf5053c7b5fe006336f3f217b6ae`,
including unstaged changes and the new process-tree helper.

## Validation

- Runtime regressions cover budget rejection, interruption, PID reuse, failed
  inspection, inspection-independent successful termination, surviving children,
  delayed exit, late children and late children with a reused parent PID.
- Type checking and diff whitespace checks pass.
- Initial full suite: 508 passed, 6 skipped, 2 failed out of 516. The unchanged
  self-authored activation-source test expects an agent self-mention to succeed,
  conflicting with issue 107's implemented rejection; it also fails in isolation.
  The CLI startup test hit a timing-sensitive live-lock check and passed when
  rerun independently. Neither failure involves the modified runtime code path.
- Final full suite after review corrections: **511 passed, 6 skipped, 1 failed
  out of 518**. All 17 process-lifecycle tests pass. The only remaining failure is
  the unchanged self-mention expectation described above; the CLI startup test
  passes in this run. Evidence: existing incident folder's
  `issue-108-final-tests.log`.
- Live instance verified paused with zero active runs; no host restart or agent
  dispatch was performed during this implementation turn.

## Answer

Implemented process-identity verification after Windows termination errors so
already-stopped budget probes and interruptions can settle, releasing active-run
state and allowing Pause to finish. Surviving discoverable descendants retain
ownership until their verified exit. Documentation and regression coverage
include the late-descendant and PID-reuse races found in review.

Changes are unstaged for user review; no commits, pushes, live-host restart or
agent dispatch. Restart the paused host later to load the fix. The pre-existing
self-mention test mismatch remains outside this issue's implementation scope.

## Original-report audit and evidence cleanup — 2026-11-11

Re-read all original user messages through Codex `read_thread` for chat
`01a1cc87-8f6d-70f0-a959-ba88ae05ba95`. This issue resolves the confirmed
taskkill/settlement defect, **not every reported recovery and UI problem**.

| Reported symptom | What this change establishes | Remaining work |
| --- | --- | --- |
| Budget-exhausted agents remain running for tens of minutes | Confirmed-exited process trees can settle after taskkill errors; ordinary budget waiting has no active run | Unconfirmed cleanup still has no distinct user-facing state |
| Pause waits forever | Removes the confirmed termination-error cause; waiting retries do not block Pause | Failed inspection/unexpected worker loss can still wait indefinitely; expose recovery |
| Interrupt spins indefinitely | Confirmed process exit releases interruption; surviving known children are rechecked | No inspectable/retryable recovery when inspection itself fails |
| Stop retries after Interrupt reports changed state | Not directly fixed | Existing `already-interrupting` rejection becomes HTTP 409; unify these commands |
| Reload shows Stop retries while Interrupt is still pending | Not fixed | `RuntimeWaitingSummary` uses local pending state, lost on reload; stop intent needs authoritative state |
| Agent activity says Running while interruption is underway | Not fixed | `AgentActivityPanel` labels any execution-started run Running even with interrupting status |
| Future/past retry times are confusing while paused/stopping | Not fixed | Show dispatch eligibility separately from an actual scheduled retry and pause/stop constraints |
| Safe shutdown without losing conversations | Recovered and verified this incident; saved history and native threads were retained | Provide a supported recovery/shutdown path and clear guidance for unconfirmed termination |

Follow-up work is recorded in [109](./109-expose-and-recover-unconfirmed-runtime-termination.md)
and [110](./110-unify-stop-retries-interruption-and-retry-status.md). These are open;
no additional runtime or browser implementation was made during this audit.
The full combination of real-worker failure, Pause, both button orders and reload
still needs an application/HTTP/browser regression; current tests cover the runtime
and application seams separately, not that complete user journey.

Raw incident files are local recovery material, not commit contents. Consolidated
20 files (147,763,418 bytes) into the existing ignored local-evidence folder:
`.scratch/local-evidence/incident-2026-11-11-budget-stop.zip` (39,681,280 bytes).
Every archived file's SHA-256 matched before removing its uncompressed duplicate.
The archive includes the database snapshot, native rollouts, JSON exports, test
logs and obsolete recovery scripts/patches. Earlier paths above describe the
original evidence locations; those files now live inside this archive.
The running host's two log files and PID marker remain in the incident directory,
which is also ignored. The issue, ADR, code and regression tests are the durable
review material. Existing staged content was not changed in the index.
