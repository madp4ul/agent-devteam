# 50 — Dismiss Queued and Interrupted Activations

**What to build:** Let the user deliberately abandon one unwanted activation
before it runs or after its attempt was interrupted, without removing its audit
history or discarding unrelated queued expectations.

**Blocked by:** None

**Status:** ready-for-agent

- [ ] Generalize activation dismissal as a user-only decision to abandon one
  activation whose expectation will not be fulfilled. It is not a task-wide
  automation reset, a bulk queue action, or an agent-facing coordination tool.
- [ ] The preserved head activation of a user-interrupted attempt offers
  Dismiss alongside Continue. Dismissing it atomically records the dismissal,
  clears the task automation suspension caused by that activation, and lets the
  next preserved activation become eligible under the ordinary blocking,
  process-pause, staleness, and dispatch rules.
- [ ] Every untouched queued activation in task details has a compact `×`
  control rather than a repetitive visible Dismiss label. The control has an
  activation-specific accessible name and opens a confirmation dialog before
  making any change.
- [ ] The confirmation identifies the target agent and activation reason,
  explains that dismissal is permanent and recorded, and states the actual
  queue consequence. When dismissing the interrupted head may let another
  activation start immediately, it warns the user explicitly.
- [ ] Dismissal affects only the selected activation. Dismissing a later queued
  activation neither changes the current head nor clears an interruption
  suspension; dismissing the interrupted head never dismisses later work.
- [ ] Completion has no special dismissal behavior. Remaining activations keep
  their order and eligibility after dismissal even when the task is already in
  Completion, and individually unwanted activations can be dismissed there.
- [ ] A running activation cannot be dismissed directly; the user must first
  interrupt its active attempt. Existing contextual recovery behavior for
  exhausted failures, permission blocks, and stale activations remains
  unchanged.
- [ ] Dismissal preserves the activation as dismissed and appends immutable
  activity identifying the activation, target agent, original reason, user
  actor, and timestamp. A prior user-interrupted attempt remains
  user-interrupted; dismissal is a later decision rather than a rewritten
  attempt outcome. An untouched activation dismissed before dispatch has no
  attempt history because no run began.
- [ ] Confirmation is race-safe and idempotent for the exact activation. If its
  state changed before confirmation, the command cannot interrupt it, dismiss a
  different queue item, or apply consequences based on stale state; the task
  refreshes with a clear current-state result.
- [ ] Application and browser tests cover untouched queued dismissal, later-item
  dismissal while an interrupted head remains suspended, interrupted-head
  dismissal and immediate queue release, Completion, process pause, accessible
  controls and confirmation, audit history, command replay, and a dispatch race.

## Comments

- User review after issue 47: interrupting an activation can leave a task stuck
  with Continue as the only recovery action even when the user deliberately no
  longer wants that activation to run.
- Requirements discussion on 2026-08-13 generalized the recovery action to
  untouched queued activations. The user chose a compact, accessible `×` plus
  confirmation for queue rows, individual dismissal only, normal queue release,
  and immutable history. Dismissal remains user-only.
