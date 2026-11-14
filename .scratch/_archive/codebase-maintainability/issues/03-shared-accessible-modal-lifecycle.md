# 03 — Shared accessible modal lifecycle

**What to build:** Make every existing modal use one shared lifecycle for focus entry, focus trapping, Escape dismissal, backdrop dismissal, body-scroll locking, and focus restoration.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Existing settings and conversation dialogs use the shared modal lifecycle.
- [x] Keyboard behavior and accessible names remain correct.
- [x] Closing a dialog restores focus to the originating control when it still exists.
- [x] Opening and closing nested or successive dialogs cannot leave body scrolling locked.
- [x] Browser coverage verifies the shared behavior.

## Comments

All eight rendered dialogs now use one shared `Modal` module for focus entry and trapping, topmost Escape and backdrop dismissal, nested scroll locking, and guarded focus restoration. The rendered-browser coverage exercises forward and reverse focus wrapping, nested and successive dialogs, both dismissal paths, scroll-lock release, accessible names, and opener restoration. Verification passed with typechecking, the production build, 188 non-browser tests (2 intentional skips), and all 72 browser tests. Standards review found no violations or material smells; Spec re-review found no remaining gaps after documenting the browser seam and adding reverse focus-trap coverage.
