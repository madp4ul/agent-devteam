# 12 — Show workspace creation progress instead of an agent running

**Type:** task
**Status:** resolved
**Created:** 2026-11-07
**Blocked by:** None — 11 is resolved

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

- [x] Board cards, task details, global activity/counts and conversation surfaces
      distinguish queued, preparing workspace and agent running consistently.
      Do not start an agent-running timer or count a preparation claim as a
      running agent before runtime execution starts.
- [x] Show the preparation stage, elapsed time and how far creation has progressed
      using real Git progress when available (for example, files updated / total
      and stage percentage). Pipe/non-interactive Git operation must provide
      progress too; implement progress capture at the workspace boundary.
- [x] Progress updates arrive while checkout runs, without waiting for command
      completion. Progress is stage-specific; do not invent an overall percentage
      or ETA. Unknown totals use an indeterminate state with elapsed time and
      the last reported progress, rather than a false zero or frozen completion.
- [x] Expose progress through authoritative application/HTTP projections with
      bounded, coalesced updates. Do not scan the entire workspace repeatedly,
      persist every stderr fragment, or load full histories to render progress.
- [x] Transition correctly through preparation, agent startup, running, failure
      and pause. A checkout completed while paused is shown as prepared with
      activation still waiting for automation, not as an agent run.
- [x] Queue explanations report actual restrictions such as pause, suspension,
      earlier unfinished activation, stale process approval, retry delay or
      preparation capacity. Unresolved relationships are not listed as reasons
      that independent queued activations cannot start.
- [x] Preserve relationship visibility as task context, including resume owner
      and completion semantics; do not remove relationships to fix the label.
- [x] Add browser coverage for live progress updates, unknown totals, successful
      transition, failure, pause and a queued mention with unresolved relationships.
      Verify readable, appropriately quiet presentation in dark and light themes
      and accessible progress/status announcements without excessive repetition.
- [x] Add focused progress-parser/transport coverage for split progress chunks
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


## Implementation progress — 2026-11-08

- Real piped Git progress and split CR chunk parser verified. Installed Git 2.40
  requires no-checkout registration followed by explicit progress-enabled checkout;
  disposable tests cover counters, preserved dirty existing work and failed checkout
  recovery evidence. Coordinator snapshots remain bounded and independent of lanes.
- Application and HTTP projections distinguish preparation from execution;
  conversation causes stay queued. Runtime startup is explicit until confirmation.
- Shared browser progress covers board, details, global activity and conversations.
  Both themes and unknown/live counters, verification/startup/running/pause/failure
  transitions pass focused browser checks. Broader verification is complete.

- Review corrections: runtime confirmation is independent of interruption intent,
  and current timeline attempts (including paged records) suppress execution timers
  during startup. Conversation preparation indicators have visible theme-aware
  styling. Shared projection helpers keep surfaces consistent; capacity eligibility
  stays with the coordinator's injected clock.
- Full Node suite: **457 passed, 6 skipped, 0 failed**. Typecheck/build pass.
  The prior workspace-reuse fixture assumed serial unrelated dispatch and a
  single-current runtime; it now completes by activation identity while retaining
  all path, commit, branch-preservation and task-isolation assertions.
- Independent Standards review: initial 2 maintainability findings corrected;
  final **0 findings**. Independent Spec review: initial 3 lifecycle/presentation
  findings corrected; final **0 findings**. No live runtime/database changes.

- Browser verification: initial appearance/automation/collapse/conversation suites
  **62 passed**. Final automation/timeline/conversation/preparation selection:
  **60 passed**, plus one old issue-101 assertion corrected from expecting a
  relationship execution blocker to expecting its absence; its focused rerun
  **1 passed**, preserving every responsive-layout assertion. Both reviewers
  cleared that correction. The four new preparation tests pass in both themes,
  including visible conversation status, readable text, live counters, and
  interrupted-startup timeline/count behavior.
- All ticket-12 changes remain unstaged. User-staged prior ticket snapshots were
  preserved unchanged. ADR 0039 records the progress and startup authority.

## Handoff to ticket 13

- Pause drains workspace preparations and active runtime controls, including
  runtime startup. Execution confirmation is independent of interruption intent:
  `ActiveRunView.executionStarted === false` must never count as a running agent
  or display an execution timer. Keep this distinction while enabling Resume.
- `WorkspacePreparationView.stage` remains the stable creating/verifying lane;
  `progress.stage` is Git's current stage. `queryPreparationCapacityWait` uses the
  coordinator clock and lane capacity; it must remain false while paused.
