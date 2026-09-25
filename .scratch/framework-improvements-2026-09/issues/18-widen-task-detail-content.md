# 18 — Give task-detail content more horizontal room

**Type:** task
**Status:** open
**Blocked by:** None.
**Next step:** Inspect representative long agent comments and agree the desktop content width before implementation.

## Problem and direction

The task-detail page's primary column is often dominated by long agent comments
and attempt outcomes. Its current width feels compressed even when the browser
has additional horizontal room available.

Increase the desktop task-detail content width so narrative history has more
room to breathe without weakening the sidebar's usability. This is independent
of issue 16: the movement map now uses released vertical space inside Task
position and does not require timeline width.

## Completion criteria

- [ ] Compare the current maximum page width and primary/sidebar ratio against
  representative long comments, attempt blocks, tables, and code.
- [ ] Give the primary narrative column visibly more room on ordinary desktop
  and wide screens without making lines uncomfortably long.
- [ ] Preserve the sidebar's movement controls, relationships, workspace, and
  conversation usability.
- [ ] Preserve existing responsive behavior and avoid horizontal page overflow.
- [ ] Verify both dark and light appearances at representative viewport widths.

## Related work

Raised while resolving [issue 16](16-navigate-timeline-with-column-movement-map.md).
Issue 16 deliberately does not change task-detail width.

## Comments

- 2026-09-24: Split from issue 16 at the user's request.
