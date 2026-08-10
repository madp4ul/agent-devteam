# 48 — Make Task Relationships Discoverable and Recoverable

**What to build:** A user can understand relationships by task name and meaning,
find a dependency without memorizing its ID, create child work consistently,
and safely remove a mistaken blocking relationship to recover a stuck task.

**Blocked by:** 46 — Prevent Tasks from Starting in Completion and Unify Creation; 47 — Reshape Task Details Around Agent Activity

**Status:** ready-for-agent

- [ ] Relationships are grouped from the current task's perspective as Parent
  tasks, Child tasks, Depends on, and Blocking tasks rather than displayed as
  raw source-to-target directions.
- [ ] Each relationship row leads with the related task's title, links to its
  details, and supplies its task ID, board/column context, and unresolved
  Blocking state without requiring a separate task lookup.
- [ ] Add dependency is a compact inline disclosure with an accessible
  combobox that searches active tasks across every project board by title or
  task ID and supports keyboard navigation and selection.
- [ ] Search results show title, ID, board, and column in board-defined order or
  another deterministic documented order, exclude the current task and exact
  duplicate relationships, and retain completed-but-unarchived tasks as clearly
  marked nonblocking choices. Archived tasks remain unavailable because the
  relationship command rejects them.
- [ ] Selecting a search suggestion shows the chosen task without mutating
  state; Add dependency performs the explicit mutation, while Cancel and a
  successful addition collapse the finder without leaving stale selection.
- [ ] Create child task opens the shared child-mode dialog delivered by issue
  46 rather than embedding a second creation form in task details.
- [ ] Both dependency and parent-child relationship rows offer a compact
  icon-only removal action with an accessible name and tooltip. The icon does
  not remove anything until the user confirms.
- [ ] The confirmation dialog names the relationship, states that neither task
  will be deleted, and previews whether removal will clear the final blocker
  and may queue the current column's watching agent.
- [ ] Relationship removal is an atomic, idempotent user command recorded as
  immutable removal activity for both tasks. It removes only current
  relationship structure and preserves both tasks and all earlier activity.
- [ ] Removing an unresolved final blocker queues exactly one activation under
  the same watched-column conditions as final blocker satisfaction. Removing
  one of several blockers, removing an already satisfied relationship, or
  unblocking a task in an unwatched column creates no activation.
- [ ] Conflicts and rejected removals refresh authoritative relationship and
  blocking state with actionable feedback. The first delivery does not expose
  relationship removal through agent MCP tools.
- [ ] Application behavior tests cover both relationship types, history,
  idempotency, multiple blockers, final-blocker reactivation, unwatched columns,
  satisfied relationships, and preservation of tasks. Browser scenarios cover
  grouping, linked titles, project-wide search, keyboard use, child-dialog
  entry, confirmation impact, cancellation, successful removal, and failure
  recovery.

## Context

Relationship removal is initially an administrative user recovery action for
incorrect board state. A future ticket may expose the same shared application
command to agents after its authority and discovery experience are designed.

Implement the expanded relationship experience as a cohesive
`TaskRelationshipsPanel` module rather than adding its search, selection,
creation, confirmation, removal, conflict, and recovery state back to
`TaskPage`. Keep the module's interface centered on authoritative relationship
state and one refresh/change callback; keep project-wide search and mutation
orchestration inside the module unless implementation evidence reveals a
smaller, reusable seam.
