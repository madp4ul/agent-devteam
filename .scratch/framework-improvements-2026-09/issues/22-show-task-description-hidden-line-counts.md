# 22 — Show hidden-line counts on task-description expansion

**Type:** task
**Status:** resolved
**Blocked by:** None.
**Next step:** User review.

## Problem and requested behavior

The task description's Show more control does not say how much additional
content it will reveal. Include a hidden-line count, consistent with comments
and timeline previews: `Show N more line(s)`.

## Acceptance criteria

- [x] Count additional rendered visual lines, accounting for actual wrapping
  and formatted Markdown rather than source line breaks.
- [x] Update the count after content, width, viewport, and font changes.
- [x] Handle singular/plural labels and remove the control when nothing is hidden.
- [x] Preserve Show less, keyboard operation, accessible disclosure state, and
  expansion persistence across live refreshes.
- [x] Verify desktop/narrow layouts and both appearances with browser coverage.

## Related work

Follow-up to [issue 11](11-collapse-long-task-descriptions.md). Reuse the
counting precedent from [framework issue 64](../../agent-coordination-framework/issues/64-show-collapsed-line-counts.md)
without changing other surfaces' collapse thresholds.

## Answer

Removed the task description's custom label so the shared disclosure displays
`Show N more line(s)`, retaining the 15-line limit, Show less, ARIA state,
keyboard controls, and expansion state across live refreshes. Rendered-line
measurement now groups vertically overlapping text fragments so smaller inline
code and surrounding prose count as one visual row.

Browser coverage verifies exact singular/plural counts, inline-code clipping,
live content changes, expansion persistence, width and font remeasurement,
control removal, desktop/narrow layouts, and both appearances. Existing docking
tests now scope disclosure controls to the Description region.

Verification: both typechecks and the production build passed; the full unit
suite passed (353 tests, 4 skipped), and the full browser suite passed (212
tests). Standards and Spec reviews completed with no remaining findings.
Changes remain unstaged for user review.

## Comments

- 2026-09-30: User-described GitHub issue; URL and number were not supplied.
  Intake approved after a read-only draft.
