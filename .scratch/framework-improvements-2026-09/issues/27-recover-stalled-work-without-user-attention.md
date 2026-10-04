# 27 — Recover stalled work that does not require user attention

**Type:** grilling
**Status:** resolved
**Blocked by:** None.
**Next step:** Implement the [stall recovery delivery tickets](../../stall-recovery/map.md); design is resolved, delivery remains open.

## Problem and requested direction

An agent sometimes finishes without handing work off or requesting user attention,
breaking continuous execution. If a task remains in a column watched by an agent,
no agent is working on it, and it does not require user attention, wake an
appropriate agent with an activation source explaining that work did not proceed.

That agent should continue the work, send it to an agent that can continue, or
explicitly require user attention if progress is impossible. Strengthen agent
guidance so inability to continue results in a user mention/attention request or
an appropriate move into a user-watched column rather than silent abandonment.

## Design questions and completion criteria

- [x] Define the authoritative eligibility rule, including active and queued
  work, attention state, agent-watched columns, and intentional suspension.
- [x] Choose which agent wakes and what context the stalled-work activation
  provides so it can continue, hand off, or explain why user attention is needed.
- [x] Define detection timing, deduplication, concurrency, restart recovery, and
  bounded retry/escalation behavior so failed handoffs cannot create wake-up loops.
- [x] Preserve intentional pause/interruption, user-owned workflow states, and
  completion/archive behavior; inspect existing lifecycle rules before deciding
  which states suppress recovery.
- [x] Agree how mentions, formal attention reasons, and movement to user-watched
  columns communicate inability to proceed, including how recovery becomes eligible again.
- [x] Specify instruction changes alongside runtime behavior; coordinate with
  [issue 12](12-audit-agent-instructions-with-user.md)'s user-reviewed instruction audit.
- [x] Publish the agreed specification and dependency-aware implementation and
  regression tickets before resolving this design work.

## Scope notes

The trigger is stalled execution without required user attention, not simply an
idle agent. Build on the existing authoritative activation and attention lifecycle;
read the architecture map and preserve the agreed lifecycle decision in ADR 0023
when implementing the specification linked below.

## Comments

- 2026-09-30: User-described GitHub issue; URL and number were not supplied.
  The quoted shorthand “without a user query” was clarified to mean without
  required user attention. Preventing additional activation loops is part of the request.
- 2026-10-03: Grilling completed and shared understanding confirmed by the user.
  Every unresolved waiting relationship suppresses recovery. Regular activations,
  waiting, and user attention reset the three-recovery budget. User attention
  acknowledgment and activation dismissal grant 60 seconds of grace. Pause and
  interruption preserve count. Current watcher owns recovery; activation wording
  reviewed. User authorized documentation and delivery-ticket publication.

## Answer

Design resolved in [spec.md](../../stall-recovery/spec.md) and
[ADR 0023](../../../docs/adr/0023-recover-tasks-without-continuation-paths.md).
Recovery fills a structurally missing continuation path on watched tasks,
immediately after agent settlement or eligible changes, subject to existing
automation holds and user-interaction grace. Three normally completed recovery
activations without continuation cause explicit framework attention. Recovery
rechecks eligibility at dispatch, retains provenance, and uses existing technical
retry behavior. Cycle validation includes all retained dependency/parent-child
relationships, even satisfied ones.

Follow-through published before resolving this design:

- [01 — Reject circular task relationships](../../stall-recovery/issues/01-reject-circular-task-relationships.md).
- [02 — Deliver bounded stall recovery](../../stall-recovery/issues/02-deliver-bounded-stall-recovery.md), blocked by 01.
- [03 — Verify lifecycle and reconcile docs](../../stall-recovery/issues/03-verify-recovery-lifecycle-and-reconcile-docs.md), blocked by 01 and 02.

Product implementation has not begun. Intake 12's wider user instruction audit
remains separate from this session's reviewed recovery wording.
