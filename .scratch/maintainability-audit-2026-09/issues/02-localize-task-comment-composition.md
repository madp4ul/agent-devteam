# 02 — Localize task-comment composition

**What to build:** Keep task comments, mention discovery and contextual replies
behaving exactly as today while giving their draft, submission and layout
lifecycle one focused browser module. Future composer changes should not require
editing the task page's unrelated refresh, archival or navigation behavior.

**Blocked by:** None — independent of ticket 01; can start immediately.

**Status:** resolved

**Parent:** [September maintainability assessment](../spec.md).

## Acceptance criteria

- [x] The task-comment module owns draft text, selection, canonical mention
  insertion and duplicate prevention, suggestion/dismissal state, submission
  and retry identity, pending/error state, textarea fitting, docking observers,
  and their cleanup.
- [x] Callers supply task identity, collaborator/recent-agent facts, a narrow
  reply intent and an accepted-comment callback. They do not coordinate draft
  setters, textarea/panel refs, sizing algorithms or suggestion state.
- [x] Choose the smallest interface that preserves contextual replies and the
  existing page layout. An internal layout wrapper or narrow layout connection
  is acceptable; exporting the current collection of mutable state and refs
  under a new name is not.
- [x] The task page remains the owner of authoritative detail refresh,
  attention acknowledgement, overall timeline refresh anchoring, navigation
  and archival. A reply that requires acknowledgement still waits for it.
- [x] Preserve replies with an existing draft and selection, canonical mention
  discovery and recent-agent preselection, trailing whitespace, keyboard and
  pointer interaction, failure/retry behavior and successful draft clearing.
- [x] Preserve focused drafts during polling, timeline position during replies
  and submission, growing/shrinking textarea behavior, docking without covered
  hit areas, narrow-window layouts and dark/light appearance.
- [x] Archival/unmount releases composer observers/listeners and hides replies
  when there is no active composer. No second task or conversation state owner
  is introduced.
- [x] Use existing comment-composition and task-timeline browser coverage as
  the primary seam. Add characterization only for a specific uncovered behavior;
  do not assert private state, file placement or observer call counts.
- [x] Run typechecking, build, focused comment/timeline/attention/archival
  browser coverage and the non-browser suite. Run further coverage only if the
  actual change reaches a shared browser mechanism.
- [x] Inspect the architecture map and update it if ownership changes beyond
  this internal presentation refinement. Complete the repository's code review
  and leave implementation unstaged for user review.

## Stop condition

Do not create a universal composer shared with conversation follow-ups, a new
state library, or a layout framework. If a candidate interface still requires
the page to orchestrate the same internal details, revise or stop the extraction
and report why; moving lines alone does not satisfy the ticket.

## Answer

Implemented a focused `TaskCommentComposition` browser module that owns the
comment draft, selection and mention suggestions, reply insertion, submission
and retry identity, feedback state, textarea fitting, docking layout, and all
associated observers and listeners. `TaskPage` now supplies task and
collaborator facts, a sequenced task-scoped reply intent, composer availability,
and the accepted-comment refresh callback. Attention acknowledgement remains in
the page and completes before the reply intent is delivered; authoritative
detail polling, timeline anchoring, navigation, and archival remain unchanged.

Verification completed on 2026-09-02: typechecking and production build passed;
all 13 focused comment-composition browser tests passed; the contextual
attention/reply test, all archival tests, and all task timeline tests passed;
and the non-browser suite passed with 313 tests and four skips. The broader
focused browser run passed 29 of 30 tests; the unrelated board-to-attention
count assertion in `task-attention.browser.spec.ts` consistently expects one
button although the current baseline renders two actions for its single
attention reason. The implementation does not touch that board or attention
panel behavior. The architecture map was inspected and needs no update because
this is an internal browser-presentation ownership refinement. Standards and
spec reviews found no remaining findings after clarifying the composer
availability prop name.
