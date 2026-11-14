# 09 — Isolate conversation reading

**What to build:** Give conversation fetching, paging, bounded retention and
viewport preservation one lifecycle owner so changing reader behavior does not
require changing retirement or follow-up commands.

**Blocked by:** None.

**Status:** open

**Scheduling:** Deferred by the user. Do not claim or implement until the user
explicitly resumes this effort after the idle game run.

**Parent:** [November assessment](../spec.md).

## Acceptance criteria

- [ ] One conversation-specific reader owns page loading, polling/refresh,
  cursor transitions, retained-window replacement and pending-activation
  reconciliation, including stale and delayed response handling.
- [ ] The same owner coordinates anchors, selection preservation, eviction
  spacers, bottom following, user-scroll cancellation and observer/frame cleanup.
- [ ] The dialog consumes a small interface for current view, loading/errors,
  navigation and refresh after accepted actions. It does not receive the
  reader's collection of mutable refs or ordering obligations.
- [ ] Retirement and follow-up commands remain outside the reader and preserve
  accepted-command feedback, focus restoration and existing idempotency.
- [ ] Preserve the conversation's bounded eviction policy and the distinct task
  timeline policy that retains requested content; do not force a universal reader.
- [ ] Verify paging, direct links, task/conversation switches, pending activity,
  retries, selection, following/cancellation, resizing and modal accessibility.
  Relevant appearance checks cover dark and light themes.
- [ ] Preserve transport shapes and user behavior; document the reader seam if
  it changes the architecture map. Keep tests at meaningful rendered interfaces.
