# 65 — Link Relationship Timeline Events to Related Tasks

**What to build:** Timeline entries that add a child task, dependency, or other
task relationship link directly to the related task.

**Blocked by:** None

**Status:** open

- [ ] Render the related task's title or ID in relationship-added timeline
  entries as a direct link to that task's details.
- [ ] Cover child, parent, dependency, and blocking perspectives using the
  direction meaningful from the currently inspected task.
- [ ] Preserve links for historical relationship events after the current
  relationship is removed.
- [ ] Give archived, completed, or currently unavailable related tasks an
  honest state while retaining navigation wherever direct inspection remains
  supported.
- [ ] Keep attempt provenance and grouping unchanged for agent-created
  relationships.
- [ ] Add application projection and browser coverage for every relationship
  direction, removal history, and archived/completed targets.

## Context

Issue 48 made current relationship rows navigable and refined the text of
relationship timeline entries. Real use found that events such as “child task
added” still need the same direct navigation to the other task.

