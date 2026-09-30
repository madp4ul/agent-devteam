# 26 — Display interruption-resume instructions in timeline and conversations

**Type:** task
**Status:** open
**Blocked by:** None.
**Next step:** Inspect retained resume evidence and specify its projection in both surfaces.

## Problem and requested behavior

Resuming an interrupted chat allows the user to supply instructions to the model.
The timeline currently reports that the chat resumed but omits those instructions.
The conversation shows interruption without a corresponding resume control, so
readers cannot tell that intervening user instructions reached the agent.

Display the resume event and the instructions actually passed to the model in
both the task timeline and the conversation.

## Acceptance criteria

- [ ] Both surfaces show a resume entry associated with the correct interruption
  and subsequent conversation activity.
- [ ] Display the instructions actually supplied to the model with clear user
  attribution and chronological placement, without inventing a model reply.
- [ ] Distinguish a resume without additional instructions from one carrying them.
- [ ] Preserve entries and instruction text after reload and live refresh; define
  honest behavior for historical resumes whose instruction evidence is unavailable.
- [ ] Support long/formatted instruction text using existing disclosure and
  rendering conventions, with accessible dark/light presentation.
- [ ] Verify retained evidence and both projections, including repeated
  interruption/resume cycles and instruction-free resumes.

## Comments

- 2026-09-30: User-described GitHub issue; URL and number were not supplied.
  The timeline omission and missing conversation resume entry are both in scope.
