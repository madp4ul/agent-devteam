# 03 — Diagnose and Stabilize the CLI Host Test Lifecycle

**What to build:** Make CLI startup verification reliably distinguish real project-state errors from test-host lifecycle races, diagnosing the observed lock failure before applying a narrowly justified fix.

**Blocked by:** None — can start immediately.

**Status:** resolved

## Context

The full non-browser audit run failed the project-state startup scenario with
"Project state is in use by application start" when the test expected its
missing-database diagnostic. The same scenario subsequently passed six isolated
runs. It creates a fresh temporary Git repository and passes that project
explicitly to test hosts, whose lock is in that repository's Git directory.
The user's running example therefore should not directly share this lock.

One unproven lead is the host-stop helper's timeout path: it requests a forced
kill and returns without awaiting confirmed exit. Do not equate this plausible
lead with a proven explanation of the original intermittent failure.

- [x] Follow the diagnosing-bugs skill: build a red-capable, bounded reproduction through actual child-process shutdown/restart and project-state acquisition before changing behavior; record hypotheses and distinguishing evidence.
- [x] Keep diagnosis and any fix within test-host lifecycle unless evidence demonstrates a production defect. Do not terminate the user's example host or touch its retained state.
- [x] If lifecycle behavior is responsible, ensure stopping a test host either confirms termination before subsequent startup or fails explicitly; account for already-exited/signalled children, event timing, escalation, and timer cleanup.
- [x] Add a regression at the real child-process/CLI seam, not a mock-only test of a guessed implementation. Preserve project-specific lock exclusion and fail-closed application behavior.
- [x] Rerun the original scenario and representative repeated or stressed runs; report honestly whether the original failure is reproduced and its cause proved.
- [x] If a reliable reproduction cannot be established, document attempts and leave the diagnosis unresolved rather than claiming an unproved fix; the other tickets can complete independently.
- [x] Run focused tests and typechecking; participate in final combined non-browser verification and independent Standards/Spec review.
- [x] Remove temporary probes, record evidence and any remaining uncertainty under Answer, and leave all changes unstaged.

## Delivery coordination

This ticket owns CLI test-host lifecycle and related test support. The
coordinating agent owns final combined verification and two-axis review. Any
required follow-up outside this bounded scope must be published and linked,
not silently treated as completed work.

## Answer

Implemented and verified bounded test-host lifecycle hardening, including
independent review. This resolves the demonstrated shutdown-helper defects;
the historical intermittent lock failure's exact cause remains unresolved,
and this change does not claim to prove it.

### Diagnosis and distinguishing evidence

The original scenario passed one baseline run and all 12 additional serial runs
before the fix. Each run used its own temporary Git repository. No production
host, user example process, or retained project state was changed.

The extracted, behavior-preserving shutdown helper was exercised with an actual
Node child and a zero-millisecond grace period. This is scheduling stress at the
operating-system boundary, not a mocked child. The red command was:

```powershell
node --experimental-strip-types --test --test-reporter=spec test/cli/host-lifecycle.test.ts
```

It failed with `stopHost returned before its child exited`: both `exitCode` and
`signalCode` were still null after shutdown returned. A bounded 20-run measurement
failed 19 times. That establishes a real helper defect, not that the historical
one-second timeout was taken during the original full-suite failure.

Ranked hypotheses and results:

1. The timeout resolves after requesting SIGKILL rather than observing exit.
   Prediction: exhausting the grace period exposes premature completion; waiting
   for actual exit removes it. Confirmed by the red test and subsequent 20/20
   passing lifecycle-suite repetitions.
2. The helper mistakes signal-terminated children for running children because
   it checks only `exitCode`. Prediction: stopping an already-signalled real
   child waits for another timer. Confirmed by a separate red regression that
   observed `still waiting` rather than `stopped`; the `signalCode` guard fixes it.
3. Subscribing after signalling might miss a fast exit. Subscription now precedes
   signalling, but this hypothesis was not independently established as a cause.

### Delivered change

- `test/support/cli-host-lifecycle.ts` now owns the startup test's shutdown
  contract. It recognizes normal and signal exits, subscribes before signalling,
  cancels timers/listeners on settlement, and continues waiting after escalation.
  Failure to confirm exit within five seconds after SIGKILL rejects explicitly.
- `test/cli/host-lifecycle.test.ts` exercises real children with zero grace,
  already-observed signal termination, and repeat stopping after normal exit.
- The existing CLI startup scenario also launches a competing CLI while the
  original host is alive and asserts the same-project lock rejection. Subsequent
  startups continue checking the original binding and missing-state diagnostics
  after the preceding host has stopped.
- No production code or project-state lock semantics changed. There were no
  throwaway probe files or debug instrumentation to retain; child processes were
  explicitly stopped/awaited and changes remain unstaged.

### Verification

- Focused lifecycle and original CLI scenario: 4 passed.
- Fixed lifecycle suite: 20/20 runs passed (3 tests per run).
- Fixed expanded CLI startup scenario: 6/6 repeat runs passed.
- `pnpm.cmd typecheck`: passed after concurrent schema implementation settled.
- `git diff --check`: passed.
- Final combined non-browser suite/build and Standards/Spec review completed as
  recorded below.

## Comments

Final integration on 2026-09-02: `pnpm test` passed with 313 passes, zero
failures, and four skips (317 tests), including the original CLI startup
scenario and all new lifecycle regressions. `pnpm typecheck` and `pnpm build`
passed. Independent Standards and Spec reviews each reported zero outstanding
findings. No production lock behavior or user example state was changed.
Historical causal attribution is deliberately left unproved; the bounded,
reproduced helper defects are fixed and independently verified. Reopen the
diagnosis with a fresh trace if the original lock symptom recurs. All changes
remain unstaged for user review.
