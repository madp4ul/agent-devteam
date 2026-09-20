# 10 — Address the correct agent participant on another task through MCP

**Type:** grilling
**Status:** open
**Blocked by:** [09 — Cross-task MCP capability decisions](09-redesign-cross-task-mcp-capabilities.md)
  for final addressing design; scenario analysis can inform that work immediately.
**Next step:** Define task-scoped addressing and delivery with the broader MCP redesign.

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

## Open design alternatives

Task-qualified mention syntax, explicit MCP target arguments, and commenting on
the destination task are candidate approaches. None was selected during intake.
Decide whether the requirement is asynchronous consultation, direct continuation,
or another interaction and explain how it affects responsibility and task movement.

## Comments

- 2026-09-20: User-described GitHub issue; retained separately from the broad tool
  inventory so its concrete failure scenario and identity requirements remain visible.
