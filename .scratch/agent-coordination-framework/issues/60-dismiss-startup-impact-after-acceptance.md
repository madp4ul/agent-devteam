# 60 — Dismiss Startup Impact After Accepting Board Changes

**What to build:** Once the user accepts the actionable effects of changed board
or process state, the startup-impact presentation disappears and stays gone
unless a new unresolved impact is created.

**Blocked by:** None

**Status:** resolved

- [x] Accepting or otherwise resolving all current board-change impacts removes
  the startup-impact UI immediately after authoritative state refresh.
- [x] Resolved startup impacts do not return after navigation, polling, or
  application restart.
- [x] Partially resolving a set of impacts leaves only the still-actionable
  items visible.
- [x] A later process-definition change may create a new startup impact without
  reviving previously resolved items.
- [x] Preserve conflict handling and the existing outcomes for rebasing,
  dismissal, missing agents, and unmapped tasks.
- [x] Add application and browser coverage for full acceptance, partial
  resolution, refresh, and restart.

## Answer

Startup queries now project only unresolved definition impact. Once all stale
activations are approved or dismissed and all unmapped tasks are recovered, the
impact envelope is omitted immediately; existing startup reconciliation keeps
that result stable across restart, while later semantic definition changes can
still establish a fresh impact window.

Application coverage exercises partial and full resolution, restart, and a
later change without reviving old items. Browser coverage verifies partial
visibility, immediate removal after authoritative refresh, reload/navigation,
and an actual application restart.

## Comments

- Real-project use found that the startup-impact view remains visible after the
  user accepts the board changes.

