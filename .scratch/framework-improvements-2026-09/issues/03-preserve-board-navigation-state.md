# 03 — Preserve board navigation state

**Type:** task
**Status:** resolved
**Blocked by:** None.
**Next step:** User review.

## Problem

Opening a task from a scrolled board and going Back returned the board to the
top. Navigation also lost the remembered pre-filter row position, and delayed
archive loading could defeat horizontal restoration.

## Acceptance criteria

- [x] Browser Back and Back to board restore the prior reading context.
- [x] Preserve filters, layout, archived visibility, and relevant scroll positions.
- [x] Keep the originating card visible when it moves; clamp saved offsets when
  it disappears. Always query current board data.
- [x] Restore after board/archive content loads, without later polls resetting
  the user's position.

## Implementation

Extended the existing history context with document position, a visible-card
anchor, pre-filter row offsets, and the Locate card highlight. Restoration waits
for board and requested archive data, then runs once. Horizontal visibility
accounts for clipping inside each scroll container. All boards share one page;
layout already persists as a browser preference. Keeping the board mounted
would unnecessarily change page and polling lifetimes.

## Verification

17 board/navigation tests pass, covering both Back controls and themes, delayed
archives, multiple boards, moved/missing/reordered cards, filters, and refresh.
Typechecks, build, and 313 non-browser tests pass (4 opt-in skips). Both reviews
have no remaining findings.

Full browser suite: 135 passed, 3 failures also reproduced on unchanged HEAD:
`automation.browser.spec.ts:129` (unmapped task returns not found),
`conversation-lifecycle.browser.spec.ts:36` (dated fixture timestamp), and
`task-attention.browser.spec.ts:77` (attention-button count).
