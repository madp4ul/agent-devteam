# 10 — Address the correct agent participant on another task through MCP

**Type:** grilling
**Status:** resolved
**Blocked by:** None; issue 09's addressing decisions are resolved.
**Next step:** Deliver the cross-task participant/comment implementation and assembled regressions.

## Concrete failure scenario

A requirements analyst working on a parent task spawned a child task for a
grilling session. The grilling agent needed to send information back to the
requirements analyst on the parent. It mentioned the analyst by role, which
activated an analyst on the child task instead. That participant had different
conversation memory from the analyst on the parent. The grilling agent neither
understood the distinction nor had a way to address the intended parent-task agent.

## Requested behavior

Allow agents to address agents belonging to other tasks through MCP. A mention or
equivalent request should be able to identify both the agent and its task. The
same role on two tasks represents different contextual participants: agents need
to discover and understand that distinction, rather than assume shared memory.

Task-scoped addressing must fit the existing domain model: immutable agent
identity, a current conversation for a task-and-agent pair, and possible retired
lineages. Do not redefine an agent identity as its role display name alone.

## Design completion criteria

- [ ] Define an unambiguous target identity and discoverable way to obtain it;
  settle whether addressing selects a task-and-agent pair or a specific conversation.
- [ ] Provide tool descriptions and agent guidance explaining task-scoped memory.
- [ ] Define where the authored communication is stored, what context reaches
  the recipient, and which task receives any resulting activation.
- [ ] Replaying the motivating scenario reaches the parent's analyst with the
  supplied information and does not accidentally start an analyst on the child.
- [ ] Define behavior for a busy recipient, absent current conversation, retired
  conversation, removed agent, and archived/unmapped task.
- [ ] Preserve clear authorship and avoid duplicate activation on delivery retries;
  decide how existing unqualified mentions remain compatible or become explicit.
- [ ] Publish agreed addressing decisions and implementation/regression tickets
  linked to issue 09's specification.

## Agreed direction from issue 09

- Address participants by (taskId, agentId); conversation IDs remain internal.
  The same stable agent definition on two tasks has separate conversational memory.
- Send information by posting on the destination task with its ordinary canonical
  agent mention. The comment and resulting activation belong to that task only.
  In the motivating scenario, the child agent posts on the parent and mentions
  the analyst there, reaching the parent's participant rather than the child's.
- Retain origin task/agent/attempt metadata. Display the origin task title and ID
  for external authors; redundant same-task attribution can be omitted.
- Reply to an external author on its origin task with the canonical agent mention.
  Explain this routing rule and independent memory explicitly in agent guidance.
- Task inspection includes a compact participant section; a dedicated participant
  listing offers the same information without full task details. Eligible agents
  derive from the applied process definition; boards assign column responsibilities
  without restricting addressable agents. Addresses and execution state are task-specific.
- Busy state is advisory, not a mutation lock. Use ordinary mention scheduling
  and internal current-lineage resolution; the final specification defines absent,
  retired, busy, and removed recipient behavior without agent-selected conversations.
- Archived tasks are read-only for agents, unmapped tasks require user recovery,
  and direct conversation/execution management remains user-only.

See [issue 09](09-redesign-cross-task-mcp-capabilities.md) for the broader accepted
decisions. The design is resolved with specification and implementation/regression
slices published; delivery and assembled scenario verification remain open.

## Answer

2026-09-30: Addressing is defined in the
[specification](../../cross-task-coordination/spec.md), incorporating the motivating
parent/child analyst scenario. Comments and mentions belong to the destination;
authorship retains source task/title/agent/attempt, and replies return to that source
task. All declared agents remain addressable; their memory/state is task-specific.

Delivery is assigned to
[01 — Cross-task comments and discovery](../../cross-task-coordination/issues/01-cross-task-comments-and-participant-discovery.md)
and [06 — Assembled verification](../../cross-task-coordination/issues/06-verify-complete-mcp-contract-and-publish-reference.md).
Conversation continuity/source delivery is covered by
[05](../../cross-task-coordination/issues/05-compose-bounded-activation-updates-and-net-pin-changes.md).
This resolves the design, not the still-open implementation/regression work.

## Original design alternatives

Task-qualified mention syntax, explicit MCP target arguments, and commenting on
the destination task are candidate approaches. None was selected during intake.
Decide whether the requirement is asynchronous consultation, direct continuation,
or another interaction and explain how it affects responsibility and task movement.

## Comments

- 2026-09-30: Recorded addressing decisions accepted during issue 09's grilling;
  unresolved behavior and implementation follow-through remain open.
- 2026-09-20: User-described GitHub issue; retained separately from the broad tool
  inventory so its concrete failure scenario and identity requirements remain visible.
