# 04 — Shared refresh and polling lifecycle

**What to build:** Consolidate repeated live-refresh mechanics while preserving each page's own scroll, selection, feedback, and navigation policies.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Board, task-detail, and conversation refreshes use shared stale-response and polling lifecycle behavior where applicable.
- [ ] A late response cannot replace newer state.
- [ ] Polling stops when its consumer unmounts or no longer needs live updates.
- [ ] Page-specific viewport and selection restoration remain local and unchanged.
- [ ] Browser coverage verifies live updates and preserved context.

