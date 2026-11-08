# 104 — Restore the simple automation button presentation

**Type:** task

**Status:** resolved

## User correction — 8 November 2026

After [heavy usage 13](../../heavy-usage/issues/13-resume-automation-while-pausing.md),
the automation button displays both “Resume” and “existing work finishing” with
different font sizes. The user finds this mismatched and unnecessary. The
previous button styling was good; the requested change was to keep the control
usable during draining, not to add a second message inside it. Context already
communicates that existing work is finishing.

## Scope and acceptance criteria

- [x] Restore the original button's typography, sizing and visual treatment.
- [x] Show one action label, “Resume”, during pausing/draining; remove the
      secondary “existing work finishing” text from the button.
- [x] Keep Resume enabled during draining, subject to ordinary eligibility.
      Do not reintroduce the old disabled/grayed-out state merely because work
      is still finishing.
- [x] Preserve the implemented resume behavior and accessible action label.
- [x] Verify the simple presentation in both themes and keyboard operation.
      Do not add replacement explanatory UI solely to preserve the removed text.

## Comments

Final combined verification with 103: 479 Node tests passed, 6 skipped, zero
failures; five combined activity-popup/Resume browser regressions passed in
dark/light themes. Initial sandbox execution could not access loopback test
servers/Git temporary metadata; the authorized host run passed. The live API
remains paused with zero active runs/preparations. Browser assets were built;
refresh applies these UI-only changes without restarting the host.

Initially recorded only while the framework was running. The user subsequently
authorized waiting for active runs to finish and then implementing the fixes.
The parent confirmed paused state with zero runs/preparations before work began.
This corrects the presentation of heavy usage 13; it does not reverse its
lifecycle behavior.

## Implementation evidence — 8 November 2026

- Removed the secondary small text and redundant explanatory title from the
  draining Resume button. Original toolbar classes, typography, sizing,
  decorative spinner and accessible action remain; no replacement UI added.
- Resume still uses the same handler and ordinary eligibility condition. No
  application lifecycle, dispatch or live-host state changed.
- The existing browser regression failed in both themes with the old two-part
  text, then passed with exact visible “Resume”, readable contrast, keyboard
  activation, and the existing run continuing after resume. Both theme tests
  and the existing compact top-bar transition/navigation test pass (3 tests).
- Typecheck and build pass. Independent Standards review: 0 findings. Independent
  Spec review: 0 findings. Parent owns the final accumulated Node suite.
- Changes remain unstaged; no commits or live-host operations performed.
