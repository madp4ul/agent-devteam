# 80 — Keep Bottom-Anchored Conversation Follow-Ups Visible

**What to fix:** When a user submits a follow-up from the bottom of an agent
conversation, keep the conversation anchored to the bottom as the authored
message and subsequent live content appear.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Detect whether the conversation viewport is at or within an appropriate
  tolerance of the bottom immediately before follow-up submission.
- [x] If it is bottom-anchored, keep the newly appended authored follow-up in
  the visible area through optimistic or authoritative updates, layout changes,
  and polling refreshes.
- [x] If the user is reading earlier content, preserve that reading position
  and do not force the viewport to the new message.
- [x] User scrolling after submission takes precedence and cancels automatic
  bottom following rather than fighting the user.
- [x] Preserve current focus, selection, retry, attachment, and conversation
  continuation behavior.
- [x] Deterministic browser coverage exercises bottom submission, near-bottom
  tolerance, scrolled-away submission, post-submit user scrolling, delayed
  authoritative append, and content-height changes.

## Context

The conversation currently appends a submitted follow-up without advancing the
scroll position, so a user already following the end of the conversation cannot
see the message they just added.

## Answer

Conversation follow-up submission now captures whether the transcript is within
the existing bottom tolerance and, when it is, follows optimistic messages,
authoritative polling updates, and later content-height changes. Earlier reading
positions remain stable, while wheel, touch, keyboard, and scrollbar movement
cancel following before pending layout or refresh work can override the user.

The active conversation status also reuses the shared activity spinner beside
“Agent name is working…”. Browser coverage exercises bottom and near-bottom
submission, scrolled-away preservation, post-submit cancellation (including
layout and polling races), delayed authoritative content, layout growth,
non-scroll interaction, and spinner placement and animation.
