# 13 — Allow automation to resume while existing agents are draining

**Type:** task
**Status:** resolved
**Created:** 2026-11-07
**Blocked by:** None

## Problem

Pausing stops new dispatch and allows current agents to finish. While even one
agent remains active, the browser disables the automation button as “Pausing…”
and the application rejects resume with `pause-draining`. The user cannot change
their mind and allow queued work to continue until the last agent finishes.

## Required behavior

The same automation control must offer **Resume** while the framework is pausing.
Selecting it cancels the pending pause and permits eligible queued tasks to start
immediately, without waiting for or interrupting already-running agents. Keep a
clear indication that existing agents are finishing while new dispatch is paused.

## Acceptance criteria

- [x] Resume is accepted during `pausing`, subject to the ordinary process,
      configuration and runtime eligibility checks; draining alone is not a block.
- [x] The existing top-bar automation control is enabled and offers Resume during
      draining, with an accessible label explaining that it resumes automation.
- [x] Hold agent A open, pause, queue unrelated eligible task B, then resume:
      B starts before A finishes, and A continues the same attempt uninterrupted.
- [x] Reuse/wake the existing scheduler safely: no duplicate pump, activation,
      runtime start or lost scheduling wake-up on repeated pause/resume requests.
- [x] Agent completion racing with resume cannot overwrite the resumed state
      with `paused`. Repeated toggles and resume racing the final completion have
      deterministic, tested outcomes.
- [x] Preparation finishing during pause/resume observes the latest automation
      intent and retains workspace ownership. Coordinate this behavior with
      tickets 11/12 without requiring their implementation to begin this ticket.
- [x] Task-specific suspension, interruption, failure and stale-process approval
      restrictions remain in effect; global resume does not bypass them.
- [x] Add application/HTTP regression coverage and browser coverage proving the
      control remains usable while one agent drains. Check both dark and light
      themes and keyboard interaction.
- [x] Update automation contracts/documentation and architectural lifecycle facts
      where they change; retain existing startup-paused behavior.

## Implementation pointers

- `src/application/internal/automation-coordinator.ts`: `resume()` rejects
  `pausing`; pump ownership and attempt completion also affect automation state.
- `src/web/client/AutomationControls.tsx`: disables the button while pausing.
- `src/web/client/BoardPage.tsx`: ordinary resume eligibility and refresh flow.
- [Ticket 11](11-dispatch-independently-of-workspace-preparation.md) and
  [ticket 12](12-show-workspace-preparation-progress.md) share lifecycle concerns.

## Comments

2026-11-08 user review: The original button styling was preferred. Showing both
“Resume” and “existing work finishing” inside it is unnecessary and visually
mismatched. Preserve enabled Resume during draining, but restore a single-label
button. This supersedes any interpretation above requiring explanatory text
inside the control. Deferred presentation correction:
[framework 104](../../agent-coordination-framework/issues/104-restore-simple-resume-button-presentation.md).

2026-11-07: User requested a ticket after waiting for the last idle-game agent
prevented reversing a pause. Issue creation only; no live automation toggled.

## Implementation evidence — 2026-11-08

- Resume accepts pausing under the ordinary configuration/runtime/process checks,
  records running intent and wakes the existing pump. Paused/draining selection
  claims no tasks and schedules no retry timers; existing completions or a
  command wake the pump. Current attempts remain uninterrupted.
- Successful pump settlement honors a pending kick after releasing ownership,
  closing the reviewed microtask lost-wakeup race. Rejected settlement only
  releases ownership and propagates the fatal error to the existing pause handler.
- The top-bar action remains enabled during drain (subject to normal resume
  eligibility), says Resume and visibly identifies existing work finishing.
  Keyboard activation and readable contrast pass in dark and light themes.
- Five controlled application/HTTP regressions cover unrelated dispatch before
  the original agent finishes, repeated toggles, final-agent completion, an empty
  pump settlement wakeup, prepared-workspace retention/reuse, and interrupted-task
  suspension. Preparation is held by a real disposable Git smudge filter, not an
  internal application mock. Existing interruption, failure and process-approval
  coverage remains intact.
- Full Node suite: **462 passed, 6 skipped, 0 failed**. Final success-only
  settlement refinement subsequently passed **13 focused application tests**,
  including the lost-wakeup and durable-finalization-failure regressions.
  Typecheck/build pass. Related automation, appearance, preparation and new
  Resume browser suites: **46 passed**. An initial two-worker invocation collided
  on the fixture's fixed port; the repository-configured single-worker run passed.
- Independent Standards and Spec reviews each have **0 remaining findings**.
  Both reviewed the final settlement fix. Architecture and ADR 0040 capture the
  lifecycle decision. No live automation or project data changed; changes remain
  unstaged and previously staged ticket snapshots were preserved.
