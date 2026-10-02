# 25 — Dock Add Comment correctly on initial page load

**Type:** task
**Status:** resolved
**Blocked by:** None; coordinate layout investigation with issue 24.
**Next step:** User review of the unstaged implementation.

## Problem and requested behavior

On first loading task details, Add Comment remains at its default document
position until the user scrolls. The first scroll corrects its position.
Collapsing long descriptions has shortened the initial page layout, so at the
same viewport height the composer can now need bottom docking immediately.
It should adopt the required position on initial load without a scroll gesture.

## Acceptance criteria

- [x] Apply the correct bottom positioning as soon as initial layout measurements
  are available, without requiring the first scroll event.
- [x] Cover short descriptions and long descriptions initially collapsed behind
  Show more, including cases that require docking immediately.
- [x] Keep positioning correct after description expansion/collapse, resizing,
  font/content changes, and live refresh.
- [x] Preserve comment input and keep the composer reachable without overlap
  with task content or sidebar controls.
- [x] Add browser coverage that asserts initial geometry before any scrolling,
  including both appearances and representative viewport heights/widths.

## Related work

The shortened description comes from [issue 11](11-collapse-long-task-descriptions.md).
[Issue 24](24-investigate-task-position-spacing-and-initial-reveal.md) concerns
Task position spacing; share relevant geometry checks without conflating the defects.

## Comments

- 2026-09-30: User-described GitHub issue; URL and number were not supplied.
  The reported distinguishing trigger is initial page load before the first scroll.

## Answer

Implemented 2026-10-02. The initial docking measurement ran before the
description preview finished collapsing. The composer ResizeObserver only
updated its reserved height, so the subsequent layout did not recalculate
docking until a scroll or viewport resize.

The existing composition component now coalesces layout measurements after
composer, primary-column, and sibling-section resizes. Direct section insertion
or removal refreshes observation membership; font-load completion also schedules
measurement. Observers, font listeners, and pending frames are released on
cleanup. Comment draft state and existing geometry rules remain intact.

Browser coverage reproduces the initial failure before the fix and checks short
and collapsed descriptions in dark/light at 1100x1000, 1100x1600, and 420x1600.
Further checks cover expansion/collapse, resizing, font metrics, live description
refresh, attention insertion/removal, preserved drafts, and sidebar separation
without scrolling. The existing composition coverage checks final timeline entry
and reply-control reachability.

Validation: build and both TypeScript configurations passed; all 29 docking,
composition, and attention browser tests passed. The complete non-browser suite
reported 352 passed, four skipped, and one CLI startup lifecycle failure; that
test passed on isolated rerun. Standards and Spec review both have zero remaining
findings. Changes are unstaged. Ticket 23's title implementation uses separate
files; no changes were made to its work. Issue 24's Task position investigation
remains separate.
