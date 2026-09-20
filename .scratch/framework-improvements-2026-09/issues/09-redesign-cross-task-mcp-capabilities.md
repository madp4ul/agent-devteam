# 09 — Inventory and redesign MCP capabilities for cross-task collaboration

**Type:** grilling
**Status:** open
**Blocked by:** None.
**Next step:** Wayfinder / grill-with-docs, beginning with an inventory of current tools.

## Problem and product direction

The user discovered that an agent cannot post comments on another task. This
conflicts with their original vision: agents should work freely across the board
and be able to change almost anything appropriate to their work. A process
definition should guide responsibility and judgment, rather than tools restricting
an agent to the task that originally spawned it.

Inventory every current coordination framework MCP tool and reassess the interface
as a whole. The user expects potentially substantial redesign and explicit
requirements work, not just adding a single cross-task comment operation.

The intended default is that an agent can interact with other tasks in the same
way it interacts with its own task. “Almost anything” still needs an explicit
capability definition and agreed invariant boundaries.

## Design completion criteria

- [ ] Inventory tool names, purposes, arguments, implicit current-task assumptions,
  discovery/read/write coverage, and restrictions imposed by the framework.
- [ ] Compare the actions available on the current task with those available on
  other tasks, including posting comments, editing, movement, relationships,
  inspection, and participant discovery/addressing.
- [ ] Define which operations accept explicit task targets and how agents discover
  them without loading unbounded board/task content.
- [ ] Separate process-authored responsibility guidance from technical capability
  limits; agree any remaining user-only actions and lifecycle invariants.
- [ ] Define author attribution, activation side effects, concurrent edits, and
  invalid/archived/unmapped targets for cross-task actions.
- [ ] Incorporate issue 10's parent/child consultation scenario and task-scoped
  participant identity into the redesign.
- [ ] Publish an agreed specification, required domain/architecture decisions,
  and implementation slices before treating this as ready to build.

## Scope questions

Does board freedom extend across boards within the project? Which actions really
remain user-only? How should tools make the target explicit enough to avoid
accidental changes to the caller's task? Which existing names/contracts need
compatibility handling? Role guidance should not be mistaken for a change to
runtime filesystem or command permissions; issue 04 is a separate concern.

## Comments

- 2026-09-20: User-described GitHub issue, explicitly identified as a large design
  effort needing grilling and definitions before implementation.
