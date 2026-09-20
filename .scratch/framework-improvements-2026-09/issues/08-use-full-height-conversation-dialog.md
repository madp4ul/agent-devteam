# 08 — Use the full browser height for the agent conversation dialog

**Type:** task
**Status:** open
**Blocked by:** None.
**Next step:** Specify and implement the focused layout change with browser verification.

## Problem and requested behavior

The user frequently sends follow-ups asking agents to explain their work. Those
responses and conversations can be long, but the conversation dialog leaves
substantial vertical screen space unused because its height is capped.

Extend the overlay from the top to the bottom of the browser viewport with no
unnecessary external vertical margins. Use the recovered height to display more
conversation at once. Keep approximately the existing width; the left and right
backdrop can continue communicating that this is an overlay.

The user believes Settings shares the dialog style and explicitly accepts the
same height change there if it follows from the shared styling. Verify actual
reuse rather than assuming it. Wider dialogs are not requested.

## Acceptance criteria

- [ ] The conversation dialog uses the full available browser viewport height,
  including after resizing, without unnecessary top/bottom outer gaps.
- [ ] The transcript gains useful reading space while the close control, header,
  and follow-up composer remain accessible and content scrolls appropriately.
- [ ] Preserve the current horizontal footprint and visible side backdrop where
  viewport width permits it; keep narrow layouts operable.
- [ ] Preserve focus containment, dismissal, and background scroll behavior.
- [ ] Verify dark/light appearance, short and tall viewports, and Settings if its
  shared dialog styling changes.

## Related work

Coordinate regression checks with [02](02-stop-conversation-scroll-snapback.md).
Increasing the viewport does not by itself resolve the reported scroll snapback.
This ticket does not propose removing the overlay or replacing it with navigation.

## Comments

- 2026-09-20: Added directly during dictation; the user could not find an existing
  GitHub issue for it.
