# 12 — Show workspace creation progress instead of an agent running

**Type:** task
**Status:** open
**Created:** 2026-11-07
**Blocked by:** 11

## Problem

During the T-0289 incident described in [ticket 11](11-dispatch-independently-of-workspace-preparation.md),
the browser reported a running Technical Designer while Git was still creating
its workspace. The durable dispatch claim existed, but no Codex thread had
started. The user could not distinguish checkout progress from an agent run or
understand why queued Product Lead activations did not start.

The activity panel also adds unresolved task relationships to activation waiting
reasons. T-0001 displayed waiting on T-0002 and T-0288 alongside three queued
activations, suggesting those relationships blocked dispatch. Under ADR 0019,
relationships do not suppress independent activations.

## Required behavior

Show a distinct **Creating workspace** state with truthful progress before agent
execution begins. Existing-workspace verification should be described accurately
as preparation/verification rather than creation. Explain actual dispatch waits
separately from task relationships.

## Acceptance criteria

- [ ] Board cards, task details, global activity/counts and conversation surfaces
      distinguish queued, preparing workspace and agent running consistently.
      Do not start an agent-running timer or count a preparation claim as a
      running agent before runtime execution starts.
- [ ] Show the preparation stage, elapsed time and how far creation has progressed
      using real Git progress when available (for example, files updated / total
      and stage percentage). Pipe/non-interactive Git operation must provide
      progress too; implement progress capture at the workspace boundary.
- [ ] Progress updates arrive while checkout runs, without waiting for command
      completion. Progress is stage-specific; do not invent an overall percentage
      or ETA. Unknown totals use an indeterminate state with elapsed time and
      the last reported progress, rather than a false zero or frozen completion.
- [ ] Expose progress through authoritative application/HTTP projections with
      bounded, coalesced updates. Do not scan the entire workspace repeatedly,
      persist every stderr fragment, or load full histories to render progress.
- [ ] Transition correctly through preparation, agent startup, running, failure
      and pause. A checkout completed while paused is shown as prepared with
      activation still waiting for automation, not as an agent run.
- [ ] Queue explanations report actual restrictions such as pause, suspension,
      earlier unfinished activation, stale process approval, retry delay or
      preparation capacity. Unresolved relationships are not listed as reasons
      that independent queued activations cannot start.
- [ ] Preserve relationship visibility as task context, including resume owner
      and completion semantics; do not remove relationships to fix the label.
- [ ] Add browser coverage for live progress updates, unknown totals, successful
      transition, failure, pause and a queued mention with unresolved relationships.
      Verify readable, appropriately quiet presentation in dark and light themes
      and accessible progress/status announcements without excessive repetition.
- [ ] Add focused progress-parser/transport coverage for split progress chunks
      and Git carriage-return updates; expose useful diagnostics without treating
      ordinary progress output as a startup error.

## Implementation pointers

- `src/web/client/AgentActivityPanel.tsx`: `waitingReasonsFor` currently lists
  unresolved relationships as activation waits.
- `src/web/client/TaskCard.tsx`: task status and relationship presentation.
- Application automation contracts and active-run projections currently expose
  provisional attempts as running.
- `src/application/internal/git-task-workspace.ts`: Git subprocess progress.
- [ADR 0019](../../../docs/adr/0019-assign-explicit-resume-ownership-to-task-relationships.md).

## Comments

2026-11-07: User explicitly requested “the workspace is being created, and this
is how far we are.” Ticket 11 supplies the lifecycle contract; this ticket owns
progress capture/delivery and the user-facing presentation. Issue creation only;
no implementation or changes to running tasks were requested in this step.
