# 03 — Shared accessible modal lifecycle

**What to build:** Make every existing modal use one shared lifecycle for focus entry, focus trapping, Escape dismissal, backdrop dismissal, body-scroll locking, and focus restoration.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Existing settings and conversation dialogs use the shared modal lifecycle.
- [ ] Keyboard behavior and accessible names remain correct.
- [ ] Closing a dialog restores focus to the originating control when it still exists.
- [ ] Opening and closing nested or successive dialogs cannot leave body scrolling locked.
- [ ] Browser coverage verifies the shared behavior.

