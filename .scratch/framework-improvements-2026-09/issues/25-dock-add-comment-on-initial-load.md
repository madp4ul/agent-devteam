# 25 — Dock Add Comment correctly on initial page load

**Type:** task
**Status:** open
**Blocked by:** None; coordinate layout investigation with issue 24.
**Next step:** Reproduce initial-load positioning and correct its initialization.

## Problem and requested behavior

On first loading task details, Add Comment remains at its default document
position until the user scrolls. The first scroll corrects its position.
Collapsing long descriptions has shortened the initial page layout, so at the
same viewport height the composer can now need bottom docking immediately.
It should adopt the required position on initial load without a scroll gesture.

## Acceptance criteria

- [ ] Apply the correct bottom positioning as soon as initial layout measurements
  are available, without requiring the first scroll event.
- [ ] Cover short descriptions and long descriptions initially collapsed behind
  Show more, including cases that require docking immediately.
- [ ] Keep positioning correct after description expansion/collapse, resizing,
  font/content changes, and live refresh.
- [ ] Preserve comment input and keep the composer reachable without overlap
  with task content or sidebar controls.
- [ ] Add browser coverage that asserts initial geometry before any scrolling,
  including both appearances and representative viewport heights/widths.

## Related work

The shortened description comes from [issue 11](11-collapse-long-task-descriptions.md).
[Issue 24](24-investigate-task-position-spacing-and-initial-reveal.md) concerns
Task position spacing; share relevant geometry checks without conflating the defects.

## Comments

- 2026-09-30: User-described GitHub issue; URL and number were not supplied.
  The reported distinguishing trigger is initial page load before the first scroll.
