# 11 — Dispatch unrelated tasks while workspaces are preparing

**Type:** task
**Status:** open
**Created:** 2026-11-07
**Blocked by:** None

## Problem

The automation dispatch loop awaits `dispatch()`, which awaits Git workspace
provisioning before selecting another activation. A slow checkout therefore
blocks all subsequent dispatch, including tasks with existing workspaces, while
already-started agents continue running. This is not a task dependency or an
agent concurrency limit.

In the idle-game incident on 2026-11-07 (Europe/Berlin), T-0289 began workspace
creation at 00:21:44. At 00:35, T-0001 had three queued activations and its first
activation satisfied the scheduler's actual eligibility query, but could not
start. T-0275, T-0002 and T-0281 were also eligible. T-0289's starting commit
`6bbdbe00a6df1e4f96868d00fc9a57109fa92324` was valid. The checkout continued
writing files through approximately 00:40 and had exited by the 00:48 check.
The resulting workspace contained 37,932 files totaling 17.92 GB, including
17.39 GB under `docs`. These are working-tree bytes, not Git database size.

## Required behavior

Workspace preparation must not prevent unrelated eligible tasks from starting.
Keep per-task activation ordering and exclusive ownership of each task's
workspace. Coordinate asynchronous preparation through the existing automation
authority; do not create a competing scheduler or write state from adapters.

## Acceptance criteria

- [ ] An application-level regression holds task A's preparation pending while
      task B, with a ready workspace, starts its runtime before A completes.
- [ ] An unrelated task needing a new workspace can also progress, subject to an
      explicit bounded preparation concurrency policy. Saturated preparation
      capacity must not block tasks whose workspaces are already ready.
- [ ] Repeated scheduler kicks and concurrent preparation completions cannot
      duplicate claims, provision the same task twice, reorder that task's
      activations, or launch more than one agent on that task.
- [ ] Preparation failure is attributable and inspectable on its task; unrelated
      dispatch remains possible. Existing retry and user recovery rules remain
      explicit rather than silently retrying destructive Git operations.
- [ ] Pause prevents new runtime starts, including when preparation completes
      during pause. Successful preparation is retained atomically with claim
      release, preserving ticket 10 / ADR 0036 and safe restart behavior.
- [ ] Shutdown and interrupted preparation retain truthful ownership and
      recovery evidence; no unknown checkout is silently adopted or deleted.
- [ ] Expose an authoritative preparation lifecycle for ticket 12, including
      task identity, stage, start time and available progress. A preparation
      claim must not count as an agent that has begun execution.
- [ ] Verify delayed preparation, completion, failure, pause and restart with
      controlled tests that do not require a large repository or live models.
- [ ] Update architecture documentation and record durable concurrency/lifecycle
      decisions in an ADR as required by repository instructions.

## Implementation pointers

- `src/application/internal/automation-coordinator.ts`: dispatch loop and
  workspace provisioning await.
- `src/application/internal/activation-scheduling-module.ts`: provisional claims,
  preparation completion and release.
- `src/application/internal/git-task-workspace.ts`: Git preparation lifecycle.
- [Ticket 10](10-recover-unrecorded-preparation-worktree.md) and
  [ADR 0036](../../../docs/adr/0036-retain-prepared-workspaces-when-dispatch-is-paused.md)
  describe the existing preservation invariant.

## Scope

Framework scheduling and lifecycle only. Repository evidence cleanup, rewriting
Git history, changing the idle-game checkout, and automatic sparse checkout are
not authorized by this ticket.

## Comments

2026-11-07: User requested issue creation following read-only diagnosis. This
ticket records future implementation; no scheduler or live-state change made.
