# 04 — Shared refresh and polling lifecycle

**What to build:** Consolidate repeated live-refresh mechanics while preserving each page's own scroll, selection, feedback, and navigation policies.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Board, task-detail, and conversation refreshes use shared stale-response and polling lifecycle behavior where applicable.
- [x] A late response cannot replace newer state.
- [x] Polling stops when its consumer unmounts or no longer needs live updates.
- [x] Page-specific viewport and selection restoration remain local and unchanged.
- [x] Browser coverage verifies live updates and preserved context.

## Comments

Board, task-detail, and conversation reads now share `useLatestRefresh` request ordering and `usePolling` scheduling, cleanup, and error routing. Page-specific board scroll, task timeline anchoring, conversation positioning, selection, feedback, and navigation remain with their consumers. Browser coverage proves a delayed poll cannot overwrite a newer command refresh and that polling stops once live-update demand ends; existing browser coverage continues to prove preserved board, task, and conversation context. Verification passed with typechecking, the production build, 188 non-browser tests (2 intentional skips), and all 73 browser tests. Standards and Spec reviews found no remaining issues.
