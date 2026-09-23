# 15 — Redesign blockers around explicit resume agents

**Type:** grilling
**Status:** open
**Blocked by:** None.
**Next step:** Grill the desired blocker lifecycle and migration from task-wide execution suppression.

## Problem and product direction

The current runtime treats an unresolved child or dependency relationship as a
task-wide execution block. No agent can run on that task until its final blocker
is satisfied, at which point the framework may wake the agent watching the
task's current column. This is particularly inconvenient when an agent creates
a child task and finishes: the user can no longer continue the parent
conversation or ask another agent to inspect or discuss the parent while the
child remains open.

Remove that blanket mechanism and redesign blocker behavior. An unresolved
relationship should describe work the task is waiting on, not make every form
of agent interaction impossible.

The user's starting proposal is to associate each blocker with an explicit
agent to wake when that blocker is removed or satisfied. Both users and agents
would choose that resume agent when creating the blocker. Clearance would then
give the named agent an opportunity to react. This proposal is a discussion
starting point, not an accepted final design.

## Design completion criteria

- [ ] Inventory every place where runtime blocking currently affects activation
  creation, queue eligibility, follow-ups, mentions, task movement, retries,
  relationships, UI controls, MCP commands, projections, and prompt context.
- [ ] Define which interactions and activation reasons remain available while a
  task has unresolved blockers; specifically cover user conversation follow-ups
  and agent consultation on the blocked parent.
- [ ] Decide what a blocker records about resume responsibility, when users and
  agents must choose it, which agents are eligible, and whether that assignment
  can be inspected or changed later.
- [ ] Define clearance behavior for one and multiple blockers, including whether
  each clearance wakes its own agent immediately or any remaining blockers alter
  that behavior.
- [ ] Define deduplication and ordering when clearance coincides with an existing
  queued/running activation, another blocker clearing, task movement, retry,
  pause, interruption, archive, or process-definition change.
- [ ] Define behavior for removed relationships, completed children,
  dependencies, unwatched columns, missing/renamed agents, retired process
  versions, and blockers created before resume-agent data existed.
- [ ] Preserve durable, explainable history: show what blocked the task, who was
  designated to resume it, what cleared the blocker, and whether an activation
  resulted.
- [ ] Agree UI and MCP contracts for creating, viewing, editing, removing, and
  satisfying blockers without confusing “blocked on work” with “agents cannot
  interact with this task.”
- [ ] Publish an agreed specification, domain/architecture updates, migration
  plan, and dependency-aware implementation tickets before building the redesign.

## Questions to grill

Should a blocker always require exactly one resume agent, or can “do not wake
anyone” be deliberate? Is the responsible agent attached to each relationship,
to the waiting task, or to a continuation expectation? If two blockers name the
same agent and clear close together, are those two meaningful expectations or
one reassessment? Can an agent work on the parent while its own earlier run is
waiting on the child, and how should the timeline explain that distinction?

This runtime concept is separate from the `Blocked by` metadata used to order
local Markdown implementation tickets.

## Related work

This redesign supersedes the relevant semantics from
[`agent-coordination-framework` issue 21](../../agent-coordination-framework/issues/21-split-relate-unblock-work.md),
which implemented task-wide blocking and final-blocker reactivation. Revisit the
domain and architecture documentation because activation eligibility,
relationship ownership, and authoritative wake-up flows will change.

## Comments

- 2026-09-23: Added from user dictation. The user expects another grilling
  session and explicitly wants the current all-agent execution block removed.
