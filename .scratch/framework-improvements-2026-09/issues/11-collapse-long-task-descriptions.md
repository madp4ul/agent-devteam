# 11 — Collapse long task descriptions behind Show more / Show less

**Type:** task
**Status:** open
**Blocked by:** None.
**Next step:** Specify the focused presentation behavior, then implement it with browser coverage.

## Problem and requested behavior

Task descriptions can be long enough to dominate the task-detail surface. The
comments and timeline already provide a precedent for shortening long content
and allowing the reader to expand it.

By default, visually limit a task description to 20 rendered lines when its
content exceeds that limit. Show a `Show more` control that reveals the complete
description, then changes to `Show less` so the compact view can be restored.
Descriptions that fit within 20 lines should remain unchanged and should not
show an unnecessary control.

The limit concerns rendered visual lines, not source Markdown line breaks. The
expanded view must retain the existing Markdown rendering and task-detail layout.

## Acceptance criteria

- [ ] A task description whose rendered content exceeds 20 visual lines is
  collapsed to 20 lines by default.
- [ ] `Show more` reveals the complete description and becomes `Show less`;
  `Show less` restores the compact view without navigating or losing task state.
- [ ] Descriptions that do not overflow have no expansion control or artificial
  empty space.
- [ ] The overflow decision remains correct for formatted Markdown, width and
  font changes, viewport resizing, and both supported themes.
- [ ] The control is keyboard-operable, has an unambiguous accessible name and
  expanded state, and does not obscure selectable description content.
- [ ] Browser coverage includes below-limit, above-limit, expand, collapse, and
  responsive-layout cases.

## Scope notes

Start with the requested 20-line threshold. Reuse an existing shared disclosure
pattern where it fits, but do not silently change the current comment or timeline
thresholds. Issue 13 separately covers table rendering and width containment;
long descriptions containing tables should remain operable when both changes
eventually coexist.

## Comments

- 2026-09-23: Added from user dictation. The user characterized this as a small
  surface-level issue and proposed 20 lines as the initial threshold.
