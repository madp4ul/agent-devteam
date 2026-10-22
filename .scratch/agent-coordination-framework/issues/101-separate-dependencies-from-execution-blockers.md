# 101 — Keep task dependencies out of Agent Activity execution blockers

**Type:** task (bug)

**Status:** open

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

- [ ] With fresh queued work and only a process pause holding execution, Agent
      Activity clearly reports the pause without treating task relationships as
      additional execution blockers.
- [ ] Unresolved dependency and parent-child relationships never become execution
      blocker reasons, regardless of pause, unavailable automation, suspension,
      retry, or process-change approval state. Preserve relationship context in
      its appropriate task/relationship surfaces.
- [ ] Resume can dispatch eligible queued work while the dependency remains
      unfinished; retain scheduler semantics and future completion wake-ups.
- [ ] Add browser coverage for paused queued work plus an unresolved relationship,
      including the displayed headline and expanded reasons. Cover running and
      at least one other actual hold to prevent a priority-only correction.
- [ ] Adjust existing browser tests that assume dependencies block activation;
      keep their independent reader-position and disclosure-state assertions.
- [ ] Retain existing appearance behavior in both dark and light themes; apply
      the repository's theme coverage rule if introducing a new visual pattern.

## Scope

Correct the execution explanation in the browser. This investigation found no
need to change relationship ownership, completion activations, or scheduling.
Implementation is pending; this ticket records the confirmed bug and delivery
work requested after investigation.

## Comments

Investigation compared otherwise identical queued activity across paused,
running, and blocked automation with/without a relationship. The evidence
supports conflating task waiting facts with execution blockers in the panel,
not a scheduler dependency gate or a pause-only reason-ordering problem.
