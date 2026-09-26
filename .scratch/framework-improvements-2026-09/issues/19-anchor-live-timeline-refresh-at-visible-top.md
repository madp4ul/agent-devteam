# 19 — Anchor live timeline refresh at the visible top edge

**Type:** task
**Status:** resolved
**Blocked by:** None.
**Next step:** User review.

## Problem and direction

Task details preserve the reader's position when polling adds or changes timeline
content. The current behavior anchors the visible timeline record nearest the
center of the viewport. In use, that can make the material near the top of the
reading area shift even though it is the user's more useful visual reference.

Preserve the timeline relative to the top of the visible content area instead.
Treat the lower edge of the sticky header as the approximate top boundary. The
alignment does not need pixel-perfect coupling to the header, but refreshes
should keep the same top reading context substantially more stable than the
current center-based rule.

This concerns passive live reconciliation on the task-detail page. It must not
change intentional navigation initiated through movement landmarks, source
links, attention actions, browser history, or ordinary user scrolling.

## Completion criteria

- [x] When timeline content changes during polling, select a stable visible
  timeline record at or nearest the top of the unobscured reading area rather
  than the record nearest the viewport center.
- [x] Restore that record at approximately the same offset below the sticky
  header, allowing a small tolerance for layout and font differences.
- [x] Handle top-level and nested timeline records without choosing the same
  logical content twice or introducing a visible jump.
- [x] Do not adjust scroll when the timeline is outside the visible reading
  area, when no usable anchor survives, or when the refresh does not require
  compensation.
- [x] Preserve intentional user scrolling and all explicit focus-and-scroll
  navigation behaviors.
- [x] Add browser coverage for entries inserted or resized above the viewport,
  including a long timeline and the sticky header at its normal desktop
  position.
- [x] Verify the behavior in both dark and light appearance; the change should
  not introduce a new visible control.

## Related work

This refines the live-use follow-up implemented in
[`agent-coordination-framework` issue 37](../../agent-coordination-framework/issues/37-structure-task-history-by-cause-and-attempt.md),
which currently anchors the visible record nearest the viewport center. Keep
the behavior compatible with issue 16's movement map and issue 17's future
timeline compaction or filtering.

## Comments

- 2026-09-26: Added from user feedback after using live task timelines. The
  requested reference is the top of the unobscured page below the header, not
  the geometric top of the browser viewport.

## Answer

Implemented passive polling anchors relative to the lower edge of the sticky
task header. The browser now selects the unique top-level or nested timeline
record whose top edge is nearest that boundary, restores its header-relative
offset after reconciliation and deferred text measurement, and leaves active
command refreshes on their prior center-based behavior. Timeline-native browser
anchoring is disabled so it cannot double the explicit compensation.

Focused browser coverage exercises long-history insertion and resize above the
viewport, top-level and nested records, a fully off-screen timeline, dark and
light appearance, and an overlapping poll where user wheel input and explicit
movement-source navigation must win. Final verification passed typechecking,
the production build, 318 Node tests (4 skipped), and all 161 browser tests.
