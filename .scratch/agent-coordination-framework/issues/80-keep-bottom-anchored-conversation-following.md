# 80 — Keep Bottom-Anchored Conversation Follow-Ups Visible

**What to fix:** When a user submits a follow-up from the bottom of an agent
conversation, keep the conversation anchored to the bottom as the authored
message and subsequent live content appear.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Detect whether the conversation viewport is at or within an appropriate
  tolerance of the bottom immediately before follow-up submission.
- [ ] If it is bottom-anchored, keep the newly appended authored follow-up in
  the visible area through optimistic or authoritative updates, layout changes,
  and polling refreshes.
- [ ] If the user is reading earlier content, preserve that reading position
  and do not force the viewport to the new message.
- [ ] User scrolling after submission takes precedence and cancels automatic
  bottom following rather than fighting the user.
- [ ] Preserve current focus, selection, retry, attachment, and conversation
  continuation behavior.
- [ ] Deterministic browser coverage exercises bottom submission, near-bottom
  tolerance, scrolled-away submission, post-submit user scrolling, delayed
  authoritative append, and content-height changes.

## Context

The conversation currently appends a submitted follow-up without advancing the
scroll position, so a user already following the end of the conversation cannot
see the message they just added.
