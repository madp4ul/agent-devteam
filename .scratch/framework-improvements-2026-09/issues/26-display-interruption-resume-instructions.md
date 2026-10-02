# 26 — Display interruption-resume instructions in timeline and conversations

**Type:** task
**Status:** resolved
**Blocked by:** None.
**Next step:** User review.

## Problem and requested behavior

Resuming an interrupted chat allows the user to supply instructions to the model.
The timeline currently reports that the chat resumed but omits those instructions.
The conversation shows interruption without a corresponding resume control, so
readers cannot tell that intervening user instructions reached the agent.

Display the resume event and the instructions actually passed to the model in
both the task timeline and the conversation.

## Acceptance criteria

- [x] Both surfaces show a resume entry associated with the correct interruption
  and subsequent conversation activity.
- [x] Display the instructions actually supplied to the model with clear user
  attribution and chronological placement, without inventing a model reply.
- [x] Distinguish a resume without additional instructions from one carrying them.
- [x] Preserve entries and instruction text after reload and live refresh; define
  honest behavior for historical resumes whose instruction evidence is unavailable.
- [x] Support long/formatted instruction text using existing disclosure and
  rendering conventions, with accessible dark/light presentation.
- [x] Verify retained evidence and both projections, including repeated
  interruption/resume cycles and instruction-free resumes.

## Answer

Implemented immutable resume evidence in the existing activity journal: exact
normalized instructions used by runtime delivery, explicit empty text for a
resume without instructions, user attribution, and interrupted-attempt identity.
Both browser surfaces render the same retained evidence with Markdown and the
existing long-text disclosure. Conversation resumes appear between their
interrupted attempt and subsequent activity, including before dispatch starts.

Historical events without instruction evidence say it was not retained. Their
attempt association uses preceding suspension journal sequence, preserving
ordering even when resume and subsequent attempt timestamps match. Suspension
cleared by stale-activation dismissal does not fabricate a conversation resume.
No activation reason, runtime instruction, or synthetic agent reply is changed.

Validation: typechecking and production build passed; the full Node suite passed
(353 passed, four skipped). All 33 relevant conversation lifecycle, timeline, and
resume browser checks passed. Focused application coverage verifies repeated
cycles, exact runtime text, empty resumes, reload, and equal-timestamp historical
ordering. Browser checks cover both themes, contrast, formatting, disclosure,
live refresh, reload, and distinct accessible targets across mounted surfaces.
Standards and Spec review have zero remaining findings. Changes are unstaged.

## Comments

- 2026-09-30: User-described GitHub issue; URL and number were not supplied.
  The timeline omission and missing conversation resume entry are both in scope.
