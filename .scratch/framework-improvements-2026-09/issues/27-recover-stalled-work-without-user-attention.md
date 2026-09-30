# 27 — Recover stalled work that does not require user attention

**Type:** grilling
**Status:** open
**Blocked by:** None.
**Next step:** Define stalled-work eligibility, recovery ownership, and loop prevention before implementation.

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

- [ ] Define the authoritative eligibility rule, including active and queued
  work, attention state, agent-watched columns, and intentional suspension.
- [ ] Choose which agent wakes and what context the stalled-work activation
  provides so it can continue, hand off, or explain why user attention is needed.
- [ ] Define detection timing, deduplication, concurrency, restart recovery, and
  bounded retry/escalation behavior so failed handoffs cannot create wake-up loops.
- [ ] Preserve intentional pause/interruption, user-owned workflow states, and
  completion/archive behavior; inspect existing lifecycle rules before deciding
  which states suppress recovery.
- [ ] Agree how mentions, formal attention reasons, and movement to user-watched
  columns communicate inability to proceed, including how recovery becomes eligible again.
- [ ] Specify instruction changes alongside runtime behavior; coordinate with
  [issue 12](12-audit-agent-instructions-with-user.md)'s user-reviewed instruction audit.
- [ ] Publish the agreed specification and dependency-aware implementation and
  regression tickets before resolving this design work.

## Scope notes

The trigger is stalled execution without required user attention, not simply an
idle agent. Build on the existing authoritative activation and attention lifecycle;
read the architecture map and record durable lifecycle decisions in an ADR when
designing the implementation. No recovery algorithm is agreed at intake.

## Comments

- 2026-09-30: User-described GitHub issue; URL and number were not supplied.
  The quoted shorthand “without a user query” was clarified to mean without
  required user attention. Preventing additional activation loops is part of the request.
