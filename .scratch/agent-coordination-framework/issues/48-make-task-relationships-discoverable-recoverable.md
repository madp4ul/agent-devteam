# 48 — Make Task Relationships Discoverable and Recoverable

**What to build:** A user can understand relationships by task name and meaning,
find a dependency without memorizing its ID, create child work consistently,
and safely remove a mistaken blocking relationship to recover a stuck task.

**Blocked by:** 46 — Prevent Tasks from Starting in Completion and Unify Creation; 47 — Reshape Task Details Around Agent Activity

**Status:** resolved

- [x] Relationships are grouped from the current task's perspective as Parent
  tasks, Child tasks, Depends on, and Blocking tasks rather than displayed as
  raw source-to-target directions.
- [x] Each relationship row leads with the related task's title, links to its
  details, and supplies its task ID, board/column context, and unresolved
  Blocking state without requiring a separate task lookup.
- [x] Add dependency is a compact inline disclosure with an accessible
  combobox that searches active tasks across every project board by title or
  task ID and supports keyboard navigation and selection.
- [x] Search results show title, ID, board, and column in board-defined order or
  another deterministic documented order, exclude the current task and exact
  duplicate relationships, and retain completed-but-unarchived tasks as clearly
  marked nonblocking choices. Archived tasks remain unavailable because the
  relationship command rejects them.
- [x] Selecting a search suggestion shows the chosen task without mutating
  state; Add dependency performs the explicit mutation, while Cancel and a
  successful addition collapse the finder without leaving stale selection.
- [x] Create child task opens the shared child-mode dialog delivered by issue
  46 rather than embedding a second creation form in task details.
- [x] Both dependency and parent-child relationship rows offer a compact
  icon-only removal action with an accessible name and tooltip. The icon does
  not remove anything until the user confirms.
- [x] The confirmation dialog names the relationship, states that neither task
  will be deleted, and previews whether removal will clear the final blocker
  and may queue the current column's watching agent.
- [x] Relationship removal is an atomic, idempotent user command recorded as
  immutable removal activity for both tasks. It removes only current
  relationship structure and preserves both tasks and all earlier activity.
- [x] Removing an unresolved final blocker queues exactly one activation under
  the same watched-column conditions as final blocker satisfaction. Removing
  one of several blockers, removing an already satisfied relationship, or
  unblocking a task in an unwatched column creates no activation.
- [x] Conflicts and rejected removals refresh authoritative relationship and
  blocking state with actionable feedback. The first delivery does not expose
  relationship removal through agent MCP tools.
- [x] Application behavior tests cover both relationship types, history,
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

## Answer

Task details now present Parent tasks, Child tasks, Depends on, and Blocking
tasks from the inspected task's perspective. Rows lead with linked task titles
and retain ID, board, column, completion, archival, and unresolved-blocking
context. A keyboard-operable project-wide finder selects a task before the
explicit Add dependency command, excludes the current task and exact duplicate
dependencies, and keeps completed unarchived tasks visible as nonblocking
choices. Child creation continues through the shared task dialog.

Relationship removal is a user-only, atomic, idempotent application command.
It records immutable removal activity on both retained tasks, reports stale
relationship state as a conflict, and queues one blockers-cleared activation
only when removal clears the final unresolved blocker in a watched column. The
confirmation dialog previews that impact, and rejected browser mutations
refresh authoritative relationship and blocking state.

Verification passed both TypeScript typechecks, the production build, all 127
runnable non-browser tests (with one intentional credentialed integration
skip), the focused relationship browser scenario, and visual review at the
default desktop viewport and 600×900. The full 38-scenario browser run passed
37 scenarios; its one remaining failure is an unchanged baseline assertion in
the interruption scenario that expects “Attempt 1” before “Running” although
the existing timeline renders “Running · Attempt 1.” The final Spec re-audit
found no issues. The Standards re-audit found no documented violation and one
low-severity judgment call in the timeline's established parallel activity
label/description dispatch.

## User review follow-ups

The dependency finder is now always visible. Its filtered task overlay appears
only while the finder has keyboard focus, so relationship creation no longer
needs a disclosure control. Escape dismisses the overlay without hiding the
finder, and choosing a task still creates the dependency immediately.

Dependency and child-task creation sit together in one **Add relationship**
control group. They use matching labels and control height without separate
card frames. Child creation appears on the left and the dependency finder on
the right, so the Create action cannot be mistaken for confirming finder text.

The preceding review iteration found the finder too tall and visually
provisional. That iteration removed its separate selection and confirmation
controls and established the immediate-selection behavior retained above.

User review found the dependency finder too tall and visually provisional,
with a separate selected-task message plus Cancel and Add dependency actions.
The finder is now labeled **Depends on**, presents its filtered tasks in a
bounded scrolling overlay, and creates the dependency immediately when the
user chooses an option. Escape and the disclosure itself remain lightweight
ways to close without choosing.

Relationship status is now directional: the Blocking badge appears only when
the related task blocks the task currently being inspected. A task that is
instead blocking its displayed parent or dependent task shows no misleading
badge. Relationship removal now uses the same centered SVG and compact circular
control language as row-layout task creation.

The focused browser scenario covers overlay scrolling/positioning, immediate
selection, the absence of redundant selection and action controls, directional
badges from both task perspectives, and geometric icon centering. Both
TypeScript typechecks, the production build, and that browser scenario pass;
visual review passed at desktop and 600×900.
