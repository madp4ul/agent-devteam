# 11 — Collapse long task descriptions behind Show more / Show less

**Type:** task
**Status:** resolved
**Blocked by:** None.
**Next step:** User review.

## Problem and requested behavior

Task descriptions can be long enough to dominate the task-detail surface. The
comments and timeline already provide a precedent for shortening long content
and allowing the reader to expand it.

By default, visually limit a task description to 15 rendered lines when its
content exceeds that limit. Show a `Show more` control that reveals the complete
description, then changes to `Show less` so the compact view can be restored.
Descriptions that fit within 15 lines should remain unchanged and should not
show an unnecessary control.

The limit concerns rendered visual lines, not source Markdown line breaks. The
expanded view must retain the existing Markdown rendering and task-detail layout.

## Acceptance criteria

- [x] A task description whose rendered content exceeds 15 visual lines is
  collapsed to 15 lines by default.
- [x] `Show more` reveals the complete description and becomes `Show less`;
  `Show less` restores the compact view without navigating or losing task state.
- [x] Descriptions that do not overflow have no expansion control or artificial
  empty space.
- [x] The overflow decision remains correct for formatted Markdown, width and
  font changes, viewport resizing, and both supported themes.
- [x] The control is keyboard-operable, has an unambiguous accessible name and
  expanded state, and does not obscure selectable description content.
- [x] Browser coverage includes below-limit, above-limit, expand, collapse, and
  responsive-layout cases.

## Scope notes

Use the requested 15-line threshold. Reuse an existing shared disclosure
pattern where it fits, but do not silently change the current comment or timeline
thresholds. Issue 13 separately covers table rendering and width containment;
long descriptions containing tables should remain operable when both changes
eventually coexist.

## Answer

Implemented the task description as a configured use of the existing shared
text disclosure. It measures rendered text rows, collapses overflowing Markdown
at the fifteenth row, and remeasures after width, inherited-style, viewport,
and font-loading changes. The task page retains expansion state across live
refreshes and exposes keyboard-operable `Show more` / `Show less` controls with
`aria-controls` and `aria-expanded`.

Dedicated browser coverage verifies below-limit and above-limit descriptions,
formatted Markdown, expand and collapse behavior, responsive width, inherited
font changes, and both appearances. The complete unit and browser suites pass.

## Comments

- 2026-09-23: Added from user dictation. The user characterized this as a small
  surface-level issue and proposed 20 lines as the initial threshold.
- 2026-09-23: User review shortened the implemented threshold from 20 to 15
  rendered lines.
