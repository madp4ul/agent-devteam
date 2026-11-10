# 106 — Represent shared resource ownership and waits

**Type:** research

**Status:** open

**Blocked by:** None

**Reported:** 2026-11-10

**Parent:** [Agent Coordination Framework](../map.md)

## Scope

Discussion draft, not an approved specification or implementation assignment.
The user will let the current Autonomous V2 checkpoint proceed and observe further
resource problems before choosing a temporary process workaround or framework
support. Do not change the running process as part of this issue.

## Problem

Agents on different tasks need exclusive access to shared resources such as a
native game window or desktop/GPU test environment. They should use the resource
themselves, retaining their task, conversation and worktree. Delegating execution
merely to obtain resource access is an unnatural handoff that loses context.

An outgoing mention can request a grant from an allocator, but does not establish
a recognized wait on the requesting task. Stall recovery then activates legitimate
queued work. Depending on the allocator's entire checkpoint completion is wrong:
that checkpoint itself needs the waiting delivery result and may form a cycle.

Task-based reservations represent some of this, but require queue ordering,
dependencies, grant/release handoffs and potentially an extra task just to cover
registration waiting. The user considers this excessive overhead. Concurrent
claims and abandoned reservations also need handling. User attention becomes a
substitute for a missing wait even when the user has no action to take.

## Evidence

Read-only inspection of Idle Game V2 on 2026-11-10; IDs refer to V2, not historical
V1 tasks. These observations do not imply that a reported wait remains current.

- T-0022 Integrator coordinates native resource access. Allocation tasks T-0031
  (for T-0025) and T-0032 (for T-0029) recovered while waiting for its grants.
  Steward handoffs could assess the issue but not establish the missing wait.
  Both allocation tasks subsequently completed after actual grants.
- Findings were preserved in the project document
  `docs/process/2026-11-09-second-review-assessment.md`, supplemental finite
  native-allocation event-waits section, published at `7e2ba36d`. This was a
  recognized limitation, not simply missing participant memory.
- Recurrence: T-0035, “Allocate T-0027 prepared Python native verification run,”
  comment `bfea3db8-cbb6-4941-b890-0c90cc0c8a81`, at
  `2026-11-09T23:43:34.365Z`, asks for user attention while explicitly saying no
  setup, launch permission or PowerShell change is needed. It names READY record
  `63cff781`, allocator handoff `5f0ed8e1`, and the missing local waiting condition.
  It asks attention to remain pending until a fresh grant arrives.
- Separate environmental failure: T-0027 comment
  `7cbb8b99-a77b-47b2-87d0-c8600072c041` reports a PowerShell execution-policy
  launch rejection and release of the previous grant. Do not conflate that
  failure with the subsequent resource-wait representation issue.

## Desired outcomes

- Request, wait for, use and release named resources without manufacturing
  coordination tasks or delegating the implementation work.
- Concurrent requests cannot both acquire an exclusive resource.
- Queued requests are durable, visible and recognized by continuation/stall
  recovery, with a participant responsible for resuming when access is available.
- Release wakes the appropriate successor, rather than granting every waiter
  simultaneous access.
- A task cannot enter Completion while holding resources. Its agent normally
  releases them; integrator/user recovery is a backstop for abandoned ownership.
- Legitimate contention does not require user attention merely to suppress
  recovery. A genuinely failed owner must still become visible.
- Pauses, failures and restarts must not silently discard ownership or grant
  access while the old holder may still have a native process running.

## Candidate direction — not a settled design

Represent resources and requests directly in the coordination model. One atomic
request either grants an available resource or records a wait. Bind ownership to
a task and retain its responsible participant. Explicit release transfers or
offers ownership to one eligible successor and creates its continuation.
Completion rejects with an actionable explanation while ownership remains.

This is dependency-like waiting, but need not be a task relationship. The API,
state model, fairness rules, UI and resource configuration are undecided. No
schema or architectural change is approved by this draft.

Coordination ownership is not proof about external processes. Ending an attempt,
reaching a timeout or restarting the host does not establish that a game window
or test process has stopped. Do not silently release physical resources on those
events without an agreed recovery protocol.

## Questions for later discussion

- Scope: per project or shared across independently running projects on the same
  machine? The motivating desktop/GPU can be shared across clones.
- Resource declaration and identity: separate reusable process concepts from
  machine-specific instances; decide who may register resources.
- Queue fairness, cancellation, duplicate requests, retries and re-requesting.
- Grant handling for paused, failed, suspended, completed or already-running
  requesters. Other useful work may remain possible while resource access waits.
- Evidence and authority for reclaiming abandoned ownership. An integrator may
  double-check cleanup; task completion alone is not proof of process exit.
- Whether completion must also cancel pending requests; corresponding archival
  and restart behavior.
- Multiple resources and potential deadlocks, without prematurely building a
  general scheduler.
- Board/MCP visibility of owner, waiters and responsible participants; liveness
  handling that does not turn resource waits into indefinite exemptions.

## Process-only alternatives considered

Finite resource reservations could form a dependency chain. The implementation
task waits on the previous reservation, uses the resource itself, then completes
its own reservation to wake its successor. A dedicated coordinator participant
on one shared task could serialize registration. A mention-only coordinator would
need an intentional unwatched service column, not a permanent dependency that
everyone waits on.

These alternatives still need registration-wait handling, release discipline and
abandonment recovery. Numbered titles and reinspection do not make claiming
atomic. Additional allocation tasks solely to establish local waiting are the
overhead the user wants to avoid. Keep process alternatives open rather than
assuming framework implementation is inevitable. Do not revive the rejected
generic proposal to wake parents merely because children are in unwatched columns.

## Comments

- 2026-11-10: User requested this draft and deferred detailed design until later.
  No runtime or process changes were made.
