# 07 — Refresh Open Conversations Promptly

**What to build:** Keep every open conversation current within two seconds,
without slowing the existing one-second refresh for known active work, and
evaluate whether authoritative live token usage can be shown cheaply.

**Blocked by:** 05 — Complete the Live and Accessible Conversation Experience

**Status:** resolved

- [x] An open conversation continues polling when its latest known run is idle,
  so a turn started by another browser or client appears without reopening the
  dialog.
- [x] Idle open conversations refresh every two seconds.
- [x] Known running attempts and locally queued follow-ups retain the existing
  one-second refresh cadence.
- [x] Polling refreshes continue to preserve the reader's position and follow
  appended content only when the reader is already near the bottom.
- [x] The installed Codex SDK is checked for trustworthy intermediate token
  usage before expanding the attempt usage display.
- [x] Live token estimates are not introduced when the runtime reports usage
  only at `turn.completed`.
- [x] Focused browser coverage proves changed conversation evidence appears
  within the two-second freshness bound.
- [x] Typechecking, production build, focused browser coverage, and the full
  non-browser suite pass.

## Answer

The conversation dialog now polls throughout its visible lifetime. Idle
conversations refresh every two seconds, allowing externally started work to
appear promptly, while running and locally queued turns keep their existing
one-second cadence. The shared latest-response and scroll-restoration behavior
continues to protect reading position during refreshes.

The installed `@openai/codex-sdk` exposes usage only on `turn.completed`; its
intermediate item events contain no authoritative token snapshot. The existing
completion-based token summary was therefore retained rather than adding an
estimate or a substantially different runtime integration.

Verification passed with typechecking, the production build, the focused
browser polling scenario, and 189 non-browser tests with two intentional
credentialed integration skips.
