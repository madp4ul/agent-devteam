# 102 — Collapse boards to interesting columns and retire Column layout

**Type:** task (feature)

**Status:** resolved

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

- [x] Each board can be expanded and collapsed independently from its header.
- [x] Expanded boards show all workflow columns as they do today.
- [x] Collapsed boards apply the qualifying conditions as an OR: any one
  condition is sufficient to retain the task's column.
- [x] A retained column shows all its tasks, not just qualifying tasks.
- [x] Columns with no qualifying tasks are hidden in collapsed mode, including
  empty columns; the board can still be expanded when all columns are hidden.
- [x] Live state changes update collapsed visibility in both directions.
- [x] Column layout and the layout-switching UI are removed, with safe handling
  of previously stored layout preferences.
- [x] Browser coverage verifies the visibility rules, complete retained-column
  contents, live updates, independent toggles, and the empty collapsed state.
- [x] The toggle has an accessible label and expanded state. If icon-only, it
  uses the shared decorative SVG pattern with bounding-box centering coverage.
  Its visual prominence remains secondary to task content, with coverage in
  both dark and light themes.

## Confirmed implementation decisions — 2026-11-08

- User confirmed: start collapsed; remember each board's choice in this browser.
- User confirmed: ordinary completed work is hidden; Completion is exempt from
  the unwatched-column rule. Activity, waiting or attention/status still qualifies.
- Existing overview facts qualify: active agent, waiting task IDs, unresolved
  attention, queued/failed activations, and startup failure. No rendered-text
  classification or execution-eligibility change is introduced.
- Search and archived exploration expose all columns while retaining their task
  filtering, without changing the stored expansion choice. Expand reveals hidden
  drag/creation destinations; task-detail movement keeps all legal destinations.
- Continue shared polling at five seconds while idle (one second while active or
  draining) so new work becomes visible without manual intervention.

## Related work

- [45 — Add compact Row board layout](45-add-compact-row-board-layout.md):
  introduced Row layout and explicitly deferred the eventual removal of Column
  layout until usage evidence was available. This request supplies that direction.

## Comments

Initial requirement capture only; no implementation requested in this issue's
creation.


## Implementation evidence � 2026-11-08

- Delivered per-board accessible SVG disclosure, default collapse and browser-local
  persistence. Removed Column layout, its preference reader, selector, rendering
  branches and CSS. Legacy Column preferences cannot affect rendering.
- Card rendering and collapsed visibility consume one shared signal projection;
  full column contents remain intact whenever any task qualifies. Completion is
  exempt only from the unwatched rule. Search/archive exploration and explicit
  expansion retain creation, movement and discovery paths.
- Red/green browser evidence covers initial collapse, independent persistence,
  empty boards, old layout preferences, each qualifying signal, whole retained
  columns, Completion, search and idle-to-active-to-idle visibility. The idle
  update regression failed without the five-second shared poll and passes with it.
- Both themes verify the shared SVG center, contrast, accessible expansion state
  and keyboard activation. Existing tests now exercise Row navigation, vertical
  and horizontal reading positions, filtering, creation, dragging, archive and
  the complete software-delivery workflow under the new default.
- Typecheck/build pass. Full Node suite: **448 passed, 6 skipped, 0 failed**.
  Browser verification: **68 distinct tests passed** across collapse, board,
  navigation, archival, accessibility, automation, appearance and software workflow.
  After the review refactor, all **22 collapse/board/navigation tests passed again**.
- Standards review raised one maintainability judgment about duplicated signal
  predicates; the shared projection resolves it. Final Standards and Spec
  re-reviews each report **0 findings**. ADR 0037 and architecture document
  presentation ownership and polling. All changes remain unstaged.
