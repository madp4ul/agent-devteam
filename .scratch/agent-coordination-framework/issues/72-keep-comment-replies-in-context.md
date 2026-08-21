# 72 — Keep Comment Replies in Timeline Context

**What to build:** Let a user compose replies while retaining the context of the
timeline comments they are answering, without repeatedly scrolling between the
source comments and the single comment composer above the timeline.

**Blocked by:** None

**Status:** open

- [ ] Reproduce the current task-detail flow with a long timeline: activating
  Reply on an agent comment inserts the agent mention and focuses Add comment,
  but moves the user away from the source comment and makes answering several
  comments require repeated scrolling.
- [ ] Before fixing the interaction, compare at least a composer beside or
  directly below the source comment, a composer that remains sticky at the
  viewport bottom while the timeline scrolls, and a shared composer with
  pinned source context. Select the smallest treatment that keeps both the
  draft and the relevant timeline evidence usable.
- [ ] Define the behavior for replying to several comments in one draft. The
  user must be able to revisit or add source context without losing text,
  selection, inserted mentions, or their place in the timeline.
- [ ] Decide whether this change is only a composition aid or introduces a
  durable reply-to relationship. Do not imply threaded-comment semantics in
  the interface unless the underlying command, persistence, and timeline model
  deliberately support them.
- [ ] Preserve issue 35 semantics: Reply acknowledges the applicable user
  attention only when that action succeeds, inserts the authoring agent's
  current canonical mention without accidental duplication, focuses the same
  draft, and never submits on the user's behalf.
- [ ] Preserve ordinary comment submission, mention autocomplete, validation,
  idempotency, error recovery, live timeline refresh, and draft retention. The
  chosen placement must not create competing drafts or ambiguous Post actions.
- [ ] Keep the timeline readable while composing. A sticky or floating surface
  must not hide the comment being answered, cover timeline controls or
  feedback, dominate the task page, or conflict with browser and mobile
  viewport insets.
- [ ] Make pointer, keyboard, focus, and screen-reader behavior explicit,
  including entering and leaving reply mode, moving among referenced comments,
  dismissing source context, and returning focus after submission or failure.
- [ ] Define responsive behavior for wide and narrow task layouts and calibrate
  the new surface in dark and light modes. The composer should remain a primary
  authoring action without making supporting timeline history visually louder.
- [ ] Add browser coverage for a long timeline, one reply, a draft addressing
  multiple comments, preserved scroll and draft state, submission failure and
  retry, narrow viewports, keyboard operation, and geometrically centered
  shared SVG icons if the selected interaction adds icon-only controls.

## Context

Issue 35 added Reply to agent-authored comments that request the user's
attention. The action prepares the existing Add comment composer above the
Task Timeline. That preserves one draft and one submission path, but in a long
timeline the composer and the source comment cannot remain visible together.
Real use becomes especially cumbersome when one authored response needs to
address several comments.

The report suggests making the composer available in the context of a comment
and offers a viewport-bottom floating composer as one candidate. Placement is
intentionally unresolved: this ticket must settle the interaction with the
real task-detail hierarchy before turning the preferred treatment into
implementation-specific acceptance criteria.

