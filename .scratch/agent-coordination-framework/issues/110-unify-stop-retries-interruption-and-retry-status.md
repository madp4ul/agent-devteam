# 110 — Unify Stop retries, interruption and retry status

**Type:** task

**Status:** resolved

**Blocked by:** 109

## Problem

Stop retries performs a browser-local dismiss/interruption loop. An existing
interruption returns HTTP 409, and reload loses the button's local pending state.
This can show Stop retries alongside an indefinitely spinning Interrupt button
and a generic changed-state error. Agent activity also labels an execution-started
run Running even while interrupting. Retry deadlines remain visible without the
pause/stop context needed to interpret them.

## Acceptance criteria

- Give Stop retries one activation-scoped authoritative intent that survives
  reload and tolerates repeated requests. Coordinate it with an interruption
  already in progress without generic conflict errors or targeting another activation.
- Preserve each command's semantics: ordinary Interrupt suspends for continuation;
  Stop retries finishes abandoning the addressed retry activation once safe.
  Finalization must not depend on keeping the original browser request alive.
- Render consistent stopping/termination-blocked state across task activity,
  conversations, retry panel and top-bar counts. Do not call an interrupting run
  Running or reset a pending stop button merely because the page reloads.
- Distinguish earliest retry eligibility from planned dispatch. Explicitly indicate
  paused, pausing, stopping and currently retrying states; an expired eligibility
  time must not imply that a retry is currently being launched.
- Add HTTP/application and browser regressions for Interrupt then Stop retries,
  Stop retries first, repeated clicks, reload during stop, and pause with multiple
  budget-waiting tasks. Include the real-worker termination-error path from 108,
  verify preserved conversations, and cover both browser themes.
- Do not implicitly resume automation, discard conversations, or release occupied
  task workspaces to simplify UI state.

## Comments

2026-11-11: Follow-up from the user's original button-order, reload and retry-time
reports, re-read through Codex thread inspection. These UX/command issues were
not changed by issue 108; implementation is still open.


## Answer

Implemented 2026-11-11. Changes are unstaged for user review; no live host was
restarted or modified, and no new scratch effort or operational evidence dumps
were added.

Stop retries is an activation-scoped host command. Both button orders and
repeated requests join interruption; safe settlement performs final dismissal
without a browser request remaining open. Current stop intent is projected across
reload, activity, conversation, timeline, cards and top-bar counts. Retry times
are earliest eligibility, with paused/pausing/cleanup context. Ordinary Interrupt
still suspends for continuation. Pending intent survives browser reload, not host
restart; existing paused startup recovery remains authoritative after a crash.

Review found and fixed an idempotency edge case: a rejected stale Stop request
must not poison dismissal of a later attempt of the same activation. Each accepted
stop now retains its own dismissal identity, with a regression test.

Validation:
- Typecheck and production build pass.
- Focused application/runtime/route suite: 25 pass, including real disposable
  Windows workers, injected taskkill/inspection failures, HTTP stop orders,
  multiple occupied tasks, shutdown readiness, and preserved transcripts/thread IDs.
- Browser: 41 of 44 broader checks passed initially; the three failures were
  corrected wording/startup-display regressions. Final targeted recheck: 9 pass,
  including all three and six runtime-waiting cases, dark/light contrast,
  top-bar counts, reload and conversation recovery.
- Full Node suite: 515 pass, 6 skipped, 2 fail. The known self-mention expectation
  in agent-conversation.test.ts:154 remains unrelated to these changes. The
  nested workspace-cleanup test failed under suite load; both before/after
  removal variants passed a focused rerun. Full suite ran before the final
  rejected-stop regression; the final focused suite includes it.
- Independent Standards and Spec reviews: no remaining actionable findings after
  the idempotency correction was re-reviewed.

Snapshot-based process ancestry limits remain documented in ADR 0043. Automatic
verification cannot safely reconstruct missing identities; there is no force-unlock.
