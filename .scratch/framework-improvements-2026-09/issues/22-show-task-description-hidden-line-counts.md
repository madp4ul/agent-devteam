# 22 — Show hidden-line counts on task-description expansion

**Type:** task
**Status:** open
**Blocked by:** None.
**Next step:** Extend the existing description disclosure and verify rendered-line counting.

## Problem and requested behavior

The task description's Show more control does not say how much additional
content it will reveal. Include a hidden-line count, consistent with comments
and timeline previews: `Show N more line(s)`.

## Acceptance criteria

- [ ] Count additional rendered visual lines, accounting for actual wrapping
  and formatted Markdown rather than source line breaks.
- [ ] Update the count after content, width, viewport, and font changes.
- [ ] Handle singular/plural labels and remove the control when nothing is hidden.
- [ ] Preserve Show less, keyboard operation, accessible disclosure state, and
  expansion persistence across live refreshes.
- [ ] Verify desktop/narrow layouts and both appearances with browser coverage.

## Related work

Follow-up to [issue 11](11-collapse-long-task-descriptions.md). Reuse the
counting precedent from [framework issue 64](../../agent-coordination-framework/issues/64-show-collapsed-line-counts.md)
without changing other surfaces' collapse thresholds.

## Comments

- 2026-09-30: User-described GitHub issue; URL and number were not supplied.
  Intake approved after a read-only draft.
