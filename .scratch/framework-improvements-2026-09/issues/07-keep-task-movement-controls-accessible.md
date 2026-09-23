# 07 — Keep Move Task sticky and offer a next-column shortcut

**Type:** task
**Status:** resolved
**Blocked by:** None.
**Next step:** User review.

## Problem and requested behavior

Task descriptions and the latest agent comment can be long. After scrolling down
to read the comment, the user's next action is often to advance the task. Move
Task is far above the reading position, requiring substantial scrolling back up.

Place Move Task immediately above Agent Conversation in the task-details sidebar
and keep both controls sticky together. Add a direct action labelled with the
next column's name, such as “Move to Review,” alongside the existing destination
selector. Advancing to the next column is common, and this saves the extra click
needed to select it from a dropdown.

## Acceptance criteria

- [x] While reading a long description or comment, Move Task and Agent Conversation
  remain accessible together in the sidebar, with movement above conversation.
- [x] The shortcut names the actual next destination and moves the task with one
  action while retaining explicit selection of other destinations.
- [x] Movement uses existing authoritative behavior, including activation and
  conflict handling; a stale browser view must not cause a misleading move.
- [x] Define shortcut behavior for the final workflow column, Completion, unmapped
  tasks, and cases where movement is unavailable.
- [x] On short/narrow viewports the sticky group does not hide controls or make
  content unreachable; cover long content and both themes in browser checks.

## Questions and design constraints

Confirm that “next” means the following column in board order, including the
framework-owned Completion destination, rather than a process-specific recommendation.
Decide whether an unavailable shortcut is omitted or disabled. Preserve the visual
hierarchy of task content and avoid making a supporting sidebar dominate the page.

## Comments

- 2026-09-20: User-described GitHub issue; both sticky placement and the shortcut
  are part of the request.
- 2026-09-22: Implemented Move Task immediately above Conversations in one sticky
  desktop group. The compact “Next” shortcut sits to the right of the destination
  selector; its accessible name and tooltip identify the actual destination. It
  follows board order (including Completion) and uses the existing revision-checked
  movement command. Completion and unmapped tasks omit the shortcut; an unmapped
  task retains a labelled current option plus every valid explicit destination.
  Pending movement disables both controls, and archived tasks retain the existing
  behavior of exposing no movement controls. Narrow layouts return the group to
  ordinary document flow. Browser coverage exercises long content, both themes,
  narrow viewports, Completion, unmapped state, pending movement, and stale-view
  conflicts.
