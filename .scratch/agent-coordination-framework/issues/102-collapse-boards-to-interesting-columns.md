# 102 — Collapse boards to interesting columns and retire Column layout

**Type:** task (feature)

**Status:** open

**Blocked by:** None

**Reported:** 2026-11-07

**Parent:** [Agent Coordination Framework](../map.md)

## Problem

Increasingly complex processes have enough workflow rows and automation that
the board overview exceeds the screen height. Activity outside the viewport is
easy to miss. The user consistently uses Row layout and wants a compact overview
that keeps current work, waiting tasks, and tasks needing attention visible.
Column layout is no longer used and should no longer be supported.

## Requested behavior

- Add a per-board expand/collapse button in the board header, to the right of
  the board name.
- Expanded boards retain the current Row layout with all workflow columns
  visible.
- Collapsed boards show only workflow columns containing at least one
  interesting task. This is a filtered board view, not a fully hidden board body.
- A task qualifies as interesting when any of these conditions applies:
  - It is actively being worked on.
  - It is waiting on a dependency or another task.
  - It is in a user/unwatched column.
  - It needs user attention.
  - It has a task status/attention label of the kind already shown on task cards;
    the user's intended rule is that any such label makes the task interesting.
- If one task qualifies, show the entire column and all of its tasks using the
  normal Row layout presentation, including tasks that do not themselves qualify.
- Keep the board header and expand control available when no columns qualify.
- Reevaluate column visibility as activity and task state change, so newly
  interesting work becomes visible without manually expanding the board.
- Remove Column layout and its layout selector. Row layout becomes the only
  supported presentation; existing saved Column layout preferences must not
  prevent the board from rendering in Row layout.

## Acceptance criteria

- [ ] Each board can be expanded and collapsed independently from its header.
- [ ] Expanded boards show all workflow columns as they do today.
- [ ] Collapsed boards apply the qualifying conditions as an OR: any one
  condition is sufficient to retain the task's column.
- [ ] A retained column shows all its tasks, not just qualifying tasks.
- [ ] Columns with no qualifying tasks are hidden in collapsed mode, including
  empty columns; the board can still be expanded when all columns are hidden.
- [ ] Live state changes update collapsed visibility in both directions.
- [ ] Column layout and the layout-switching UI are removed, with safe handling
  of previously stored layout preferences.
- [ ] Browser coverage verifies the visibility rules, complete retained-column
  contents, live updates, independent toggles, and the empty collapsed state.
- [ ] The toggle has an accessible label and expanded state. If icon-only, it
  uses the shared decorative SVG pattern with bounding-box centering coverage.
  Its visual prominence remains secondary to task content, with coverage in
  both dark and light themes.

## Details to settle before implementation

- Whether boards initially start collapsed, and whether collapse choices persist
  across reloads or navigation. A collapsed default was suggested, but the final
  default and persistence scope were not explicitly settled.
- Enumerate the existing task labels that qualify, and map active work and
  waiting to authoritative task state rather than relying on rendered text.
- Whether the framework-owned Completion column is exempt from the unwatched
  column rule. Literally including every unwatched column would also retain
  completed tasks; the user's example described user/unwatched workflow columns.
- How collapsed visibility interacts with any existing task filters and moving
  tasks to a hidden destination column.

## Related work

- [45 — Add compact Row board layout](45-add-compact-row-board-layout.md):
  introduced Row layout and explicitly deferred the eventual removal of Column
  layout until usage evidence was available. This request supplies that direction.

## Comments

Initial requirement capture only; no implementation requested in this issue's
creation.
