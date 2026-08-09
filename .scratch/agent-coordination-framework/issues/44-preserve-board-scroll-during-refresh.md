# 44 — Preserve Board Scroll During Automatic Refresh

**What to fix:** Automatic board refreshes must not overwrite the horizontal
position that the user is currently viewing. Returning from task details may
restore the saved board context once, but later polling must leave subsequent
user scrolling alone.

**Blocked by:** 19 — Inspect and Control a Task

**Priority:** High — address before issue 32 expands automatic live refresh.

**Status:** resolved

- [x] Returning from task details restores the saved board, filter, and
  horizontal lane position once after the board is available.
- [x] Subsequent authoritative board refreshes preserve the lane's current
  horizontal position, including the one-second polling used while an attempt
  is active or process pause is draining.
- [x] User scrolling after the initial restoration remains authoritative and is
  not replaced by the older navigation snapshot on a later render.
- [x] Multiple board lanes retain their own current positions without coupling
  one board's restoration or refresh to another board.
- [x] Deliberate navigation behavior, such as locating a task or restoring a
  board context after task inspection, may still scroll intentionally and does
  so without fighting later manual scrolling.
- [x] A browser regression test covers a horizontally overflowing lane on both
  a direct board load and a return from task details, forces at least one
  automatic refresh with an active run, and proves that a newer user-selected
  position remains stable.

## Comments

- Live testing after issue 43 found that the board becomes effectively
  unscrollable while an agent is running: each one-second refresh snaps the
  horizontal scrollbar back to an older position.
- A deterministic browser repro isolates the defect to restored navigation
  context. Directly loading the board and scrolling to the lane's right edge
  survives polling. After opening a task and returning, scrolling to that same
  edge is reset on the next poll from `scrollLeft = 240` to the saved snap
  boundary near `scrollLeft = 3`.
- `BoardPage` currently reads `initialContext` from `window.history.state` and
  runs its scroll-restoration layout effect whenever `state` changes. Polling
  replaces `state` every second, so the effect repeatedly writes the stale
  `initialContext.scrollLeft`. The restoration needs one-shot semantics rather
  than being coupled to every authoritative projection update.

## Answer

Board navigation context is now retained as pending one-shot restoration data.
`BoardPage` consumes it only after the referenced lane is available and leaves
all later authoritative refreshes and user scrolling untouched. A browser
regression covers direct-load polling and return-from-details restoration on a
horizontally overflowing lane, including a newer manual position surviving an
active-run refresh.

Type-checking, the production build, the full automated suite, and the complete
browser suite pass.
