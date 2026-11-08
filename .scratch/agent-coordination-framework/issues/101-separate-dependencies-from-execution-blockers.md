# 101 — Keep task dependencies out of Agent Activity execution blockers

**Type:** task (bug)

**Status:** resolved

**Blocked by:** None — can start immediately.

**Reported:** 2026-10-22

## Problem

With process automation paused, a task with queued activations and an unresolved
outgoing dependency shows `Waiting on T-0002` as the Agent Activity headline.
The actual execution hold, `Process automation is paused`, is hidden under
`1 more reason`. This implies that completing the dependency is required to
start queued agent work, although pressing Resume is the required action.

This is a presentation bug in the framework. Relationships describe future
continuation responsibility; they do not suppress independent queued work.
The same false blocker appears with automation running or unavailable, so
merely moving the pause message earlier would leave the underlying bug.

## Reproduction

Minimal real-component rendering probe (no live project or runtime required):

```powershell
node .scratch/agent-coordination-framework/research/101-agent-activity-waiting-reasons-repro.mjs
```

The probe loads the actual `AgentActivityPanel.tsx` through Vite and renders it
with React, with one fresh queued column-entry activation and no active run,
suspension, failure, or attention. It asserts that a relationship is not listed
as an execution blocker. Current output:

```text
paused, no relationship: headline = Process automation is paused (control passes)
paused, unresolved T-0002: headline = Waiting on T-0002; pause hidden (FAIL)
running, unresolved T-0002: headline = Waiting on T-0002 (FAIL)
blocked, unresolved T-0002: headline = Waiting on T-0002 (FAIL)
```

The probe exits 1 on the current bug. The original direct rendering invocation
also failed with `AssertionError: A dependency must not be presented as a queued
activation blocker` and showed the pause text inside a collapsed details element.
This reproduces component output, not the reporter's live project state.

Browser steps:

1. Leave automation paused.
2. Have a task with an unfinished dependency (or parent-child relationship) and
   an independently queued activation, such as a column-entry or mention.
3. Open that task's Agent Activity panel.
4. Observe the dependency headline and expand `1 more reason` to find the pause.

## Cause and evidence

- `src/web/client/AgentActivityPanel.tsx`, `waitingReasonsFor` (currently lines
  189–231), pushes `inspection.waitingOn.taskIds` into execution waiting reasons
  before process automation state. The first reason becomes the headline; later
  reasons become collapsed disclosure content. `hasWaitingWork` makes this
  especially visible whenever another real hold leaves queued work in the panel.
- The relationship is a valid task fact but an invalid reason for withholding a
  queued activation. Removing only its priority does not correct that claim.
- `src/application/internal/activation-scheduling-module.ts`,
  `claimNextRunnable`, checks lifecycle, mapping, applied agent, staleness,
  suspension, retry deadline, and queue ordering, with no relationship hold.
- `docs/adr/0019-assign-explicit-resume-ownership-to-task-relationships.md`
  explicitly states that waiting relationships do not suppress activations.
- Existing scheduler behavior was verified with:

  ```powershell
  node --experimental-strip-types --test --test-reporter=spec --test-name-pattern='waiting relationships do not suppress work' test/application/task-relationships.test.ts
  ```

  Result: 1 test passed. This exercises ordinary dispatch with an unresolved
  relationship as well as independent relationship-satisfaction activations.
- Existing browser coverage in `test/browser/automation.browser.spec.ts` currently
  encodes the misleading behavior in `live task refresh moves a singly blocked
  activity to idle without disturbing the reader` and `waiting reason disclosure
  survives authoritative reason-count changes`. Update their scenarios to use
  real execution blockers while retaining reader/disclosure preservation coverage.

## Expected behavior and acceptance criteria

- [x] With fresh queued work and only a process pause holding execution, Agent
      Activity clearly reports the pause without treating task relationships as
      additional execution blockers.
- [x] Unresolved dependency and parent-child relationships never become execution
      blocker reasons, regardless of pause, unavailable automation, suspension,
      retry, or process-change approval state. Preserve relationship context in
      its appropriate task/relationship surfaces.
- [x] Resume can dispatch eligible queued work while the dependency remains
      unfinished; retain scheduler semantics and future completion wake-ups.
- [x] Add browser coverage for paused queued work plus an unresolved relationship,
      including the displayed headline and expanded reasons. Cover running and
      at least one other actual hold to prevent a priority-only correction.
- [x] Adjust existing browser tests that assume dependencies block activation;
      keep their independent reader-position and disclosure-state assertions.
- [x] Retain existing appearance behavior in both dark and light themes; apply
      the repository's theme coverage rule if introducing a new visual pattern.

## Scope

Correct the execution explanation in the browser. This investigation found no
need to change relationship ownership, completion activations, or scheduling.
The user expanded the delivery scope on 2026-11-08 to audit other misleading
execution blocker explanations, not only relationships.

## Comments

Investigation compared otherwise identical queued activity across paused,
running, and blocked automation with/without a relationship. The evidence
supports conflating task waiting facts with execution blockers in the panel,
not a scheduler dependency gate or a pause-only reason-ordering problem.

## Implementation evidence — 2026-11-08

- Removed relationship waiting facts from Agent Activity's execution reasons.
  Relationship surfaces and scheduler/completion wake-up semantics are unchanged.
- Audited each remaining reason against the scheduler: process pause/unavailable
  state and task suspension are real global holds; activation recovery, staleness,
  and startup failure must refer to the first unfinished activation. The browser
  projection and scheduler both use activation sequence order, and dismissed
  activations are completed in storage. Later stale work no longer labels an
  eligible queue head as blocked. Only future scheduled retry deadlines are holds;
  expired deadlines and historical startup failures are not.
- Browser regressions were red before the fixes for relationship explanations
  across paused/running/unavailable/suspended states, a later stale activation,
  and an elapsed retry deadline. They now pass. Existing reader-position,
  selection, comment-draft, and disclosure-state assertions use actual holds.
- Broader browser verification exposed two old fixture mismatches: injected
  interruption attempts and appearance comments omitted paged timeline data.
  Both now use the established `fulfillTaskScenario` helper without weakening
  assertions. No appearance or scheduling implementation changed.
- Typecheck and build pass. Full Node suite: **448 passed, 6 skipped, 0 failed**.
  The existing application regression confirms independent dispatch while a
  relationship remains unresolved and subsequent completion wake-ups.
- Final automation and appearance browser suites: **40 passed, 0 failed**,
  including both themes and all eight focused blocker/reader regressions.
- Independent Standards and Spec reviews, including the fixture repairs, each
  found **0 issues**. All changes remain unstaged for user review.
