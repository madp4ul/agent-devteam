# 110 — Unify Stop retries, interruption and retry status

**Type:** task

**Status:** open

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
