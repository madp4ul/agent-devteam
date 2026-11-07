# 13 — Allow automation to resume while existing agents are draining

**Type:** task
**Status:** open
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

- [ ] Resume is accepted during `pausing`, subject to the ordinary process,
      configuration and runtime eligibility checks; draining alone is not a block.
- [ ] The existing top-bar automation control is enabled and offers Resume during
      draining, with an accessible label explaining that it resumes automation.
- [ ] Hold agent A open, pause, queue unrelated eligible task B, then resume:
      B starts before A finishes, and A continues the same attempt uninterrupted.
- [ ] Reuse/wake the existing scheduler safely: no duplicate pump, activation,
      runtime start or lost scheduling wake-up on repeated pause/resume requests.
- [ ] Agent completion racing with resume cannot overwrite the resumed state
      with `paused`. Repeated toggles and resume racing the final completion have
      deterministic, tested outcomes.
- [ ] Preparation finishing during pause/resume observes the latest automation
      intent and retains workspace ownership. Coordinate this behavior with
      tickets 11/12 without requiring their implementation to begin this ticket.
- [ ] Task-specific suspension, interruption, failure and stale-process approval
      restrictions remain in effect; global resume does not bypass them.
- [ ] Add application/HTTP regression coverage and browser coverage proving the
      control remains usable while one agent drains. Check both dark and light
      themes and keyboard interaction.
- [ ] Update automation contracts/documentation and architectural lifecycle facts
      where they change; retain existing startup-paused behavior.

## Implementation pointers

- `src/application/internal/automation-coordinator.ts`: `resume()` rejects
  `pausing`; pump ownership and attempt completion also affect automation state.
- `src/web/client/AutomationControls.tsx`: disables the button while pausing.
- `src/web/client/BoardPage.tsx`: ordinary resume eligibility and refresh flow.
- [Ticket 11](11-dispatch-independently-of-workspace-preparation.md) and
  [ticket 12](12-show-workspace-preparation-progress.md) share lifecycle concerns.

## Comments

2026-11-07: User requested a ticket after waiting for the last idle-game agent
prevented reversing a pause. Issue creation only; no live automation toggled.
