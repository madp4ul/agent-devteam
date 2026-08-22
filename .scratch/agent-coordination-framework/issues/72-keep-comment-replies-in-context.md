# 72 — Keep Comment Replies in Timeline Context

**What to build:** Keep the task's single Add comment composer available beside
the timeline comments a user is answering by making it bottom-sticky after it
reaches its normal viewport position, and automatically grow its textarea for
longer drafts without crowding the timeline out of view.

**Blocked by:** None — can start immediately

**Status:** resolved

## Problem Statement

The Add comment composer appears between the task description and Task
Timeline. On a task with substantial content, the timeline comment being
answered and the composer cannot remain visible together. Reply focuses the
composer and therefore makes answering one or several comments require repeated
scrolling between the draft and its source context.

The textarea also starts at two rows to keep an unused composer compact. Longer
drafts remain cramped unless the user finds and drags the browser's small manual
resize handle, while an unrestricted larger composer would obscure too much of
the timeline.

## Solution

Keep the existing composer in its current document position and retain it as
the only comment draft and Post action. Once scrolling down has brought the
whole composer into view, keep that same surface at the bottom of the viewport
while the user continues through the timeline. Scrolling back above its normal
position returns it to ordinary document flow, so it never covers the task
description above it. Reserve enough space after the timeline for its final
content to remain visible above the sticky composer.

Make the textarea grow and shrink with its draft from the existing two-row
minimum to a viewport-aware maximum. Once it reaches that maximum, the textarea
scrolls internally so the complete composer cannot consume the viewport. The
first increment replaces manual resizing; retaining a compatible manual resize
handle may be reconsidered later.

This is only a composition aid. Reply continues to insert canonical agent
mentions into the one ordinary comment draft; it does not create durable
reply-to relationships, selected source comments, pinned source context, or
threaded-comment semantics.

## User Stories

1. As a user reading a long task timeline, I want the comment composer to stay
   available at the bottom of the viewport, so that I can see the evidence I am
   answering while writing.
2. As a user reading the task description, I want the composer to remain in its
   normal document position, so that it does not cover content above it.
3. As a user reaching the end of the timeline, I want the final timeline entry
   and its controls to remain visible above the sticky composer, so that no
   content becomes inaccessible.
4. As a user replying to an agent comment, I want Reply to preserve my timeline
   position while focusing the composer, so that I do not lose the comment's
   context.
5. As a user answering several comments in one draft, I want each Reply action
   to preserve my draft and add only a missing canonical agent mention, so that
   I can compose one response without duplicate addressing.
6. As a user writing a longer comment, I want the textarea to expand as I add
   lines and shrink as I remove them, so that I can read more of my draft
   without manipulating a resize handle.
7. As a user writing a very long comment, I want textarea growth to stop before
   the composer dominates the viewport, so that timeline context stays usable.
8. As a user whose submission succeeds, I want my timeline position preserved
   while the cleared textarea returns to its minimum height, so that I can
   continue where I was reading.
9. As a user whose submission fails, I want my draft, composer height, and
   timeline position preserved, so that I can correct or retry without losing
   work or context.
10. As a keyboard or screen-reader user, I want Reply, composition, submission,
    errors, and focus transitions to remain operable and announced, so that the
    sticky treatment does not weaken the existing accessible workflow.
11. As a user on a narrow or inset viewport, I want the composer and timeline
    to remain usable together, so that sticky positioning does not hide content
    behind the viewport edge.
12. As a user of either appearance, I want the sticky composer to remain
    readable without visually overpowering the timeline, so that the task's
    hierarchy remains clear.

## Implementation Decisions

- Preserve one composer, one controlled draft, and one Post action. Do not
  clone or relocate draft state when the surface becomes sticky.
- Use the composer's existing document position as the sticky threshold. It
  must not appear over the task description before the user reaches it, and it
  must return naturally to that position when scrolling upward.
- Keep the entire composer available at the viewport bottom while it is sticky,
  including its heading, textarea, actions, validation feedback, and mention
  autocomplete. Account for browser and mobile viewport insets.
- Give the timeline trailing clearance based on the effective sticky surface
  so its last entry, controls, and feedback can be brought fully above the
  composer at every supported width and textarea height.
- Preserve the current timeline viewport anchor when Reply focuses the
  textarea. Focus must not cause the browser to scroll back to the composer's
  document position.
- Several Reply actions contribute to the same draft. Preserve its text and
  selection, insert the authoring agent's current canonical mention only when
  absent, and retain the user's place in the timeline.
- Keep Reply as a composition-only action. Introduce no reply mode, selected or
  pinned source-comment state, reply metadata, persistence changes, comment
  command changes, or threaded presentation.
- Preserve issue 35 behavior: applicable user attention is acknowledged only
  when that action succeeds; a failed acknowledgement neither prepares nor
  focuses the reply; Reply never submits on the user's behalf.
- Automatically size the textarea for all draft changes, including typing,
  deletion, Reply mention insertion, live state preservation, clearing, and
  submission. Start at the existing two-row minimum, grow only to a
  viewport-aware cap that leaves useful timeline context, and use internal
  textarea scrolling beyond the cap.
- Remove manual textarea resizing in this increment. A future enhancement may
  restore it only if it can coexist predictably with automatic sizing and the
  viewport cap.
- On successful submission, preserve the timeline position, clear the draft,
  shrink the textarea to its minimum, and return focus to the textarea. On
  failure, preserve the draft, selection, current height, and timeline
  position, announce the error, and return focus to the textarea for correction
  or retry.
- Preserve ordinary submission, mention autocomplete and keyboard handling,
  validation, idempotency, error recovery, live refresh, and draft retention.
- Treat exact sticky decoration, spacing, and the final growth cap as
  implementation calibration. The result must follow the repository's visual
  hierarchy guidance in dark mode and remain readable and operable in light
  mode.

## Testing Decisions

- Use the existing rendered-browser task-page coverage as the primary and
  ideally only test seam. Assert observable geometry, scrolling, focus, draft,
  and submission behavior rather than sticky-state or sizing implementation
  details.
- Cover a long task whose composer and source comment cannot initially fit in
  one viewport. Verify the composer remains in flow above its threshold,
  becomes bottom-sticky beside timeline content, and returns to its document
  position when scrolling upward.
- At the textarea's minimum, intermediate, and capped heights, verify the last
  timeline entry and its controls can be brought fully above the complete
  composer without horizontal or page-level overflow.
- Cover one Reply and several Reply actions in one draft. Verify canonical
  mentions are inserted without duplication, existing text and selection are
  retained, focus reaches the textarea without moving the timeline viewport,
  and attention is acknowledged only on a successful action.
- Verify textarea growth from typing and Reply insertion, shrinkage after line
  deletion and successful submission, its two-row minimum, its viewport-aware
  cap, and internal scrolling beyond the cap.
- Cover successful submission and failure followed by retry, including the
  required draft, selection, scroll, sizing, focus, validation, and feedback
  behavior.
- Exercise pointer and keyboard operation at ordinary and narrow viewport
  widths, including mobile safe-area behavior where the browser seam can
  observe it.
- Add appearance coverage in dark and light modes for the sticky surface and
  its interaction states. If implementation introduces an icon-only control,
  use a shared decorative SVG inside an explicitly labelled button and compare
  the icon and button bounding-box centers.
- Add a lower-level test seam only if sizing logic becomes nontrivial and
  cannot be exercised deterministically through rendered behavior.

## Out of Scope

- Durable reply-to relationships, comment threading, quoted comments, pinned
  source summaries, or a list of selected source comments.
- Multiple composers, inline per-comment drafts, or a separate floating draft.
- Changes to comment commands, persistence, timeline records, activation
  semantics, or mention parsing.
- Unbounded textarea growth or allowing the sticky composer to consume the
  whole viewport.
- Preserving the manual resize handle in the first increment.
- Reworking other textareas or conversation composers.

## Further Notes

Issue 35 introduced the current Reply and mention behavior, and the task page
already preserves its comment draft and timeline viewport anchor across live
refresh. The implementation should extend those established seams rather than
introducing a second draft owner or a new authoritative flow.

No domain-glossary or architecture update is expected: the change adds no
durable concept, command, state owner, module boundary, or runtime integration.
No ADR is warranted because the sticky placement and automatic sizing are
reversible presentation decisions selected from familiar alternatives.

## Answer

The task page now keeps its one Add comment composer in normal flow until the
whole surface reaches the viewport, then holds it at the safe viewport bottom
while the timeline scrolls. Measured trailing clearance keeps the final entry
and its controls visible at minimum, intermediate, and capped draft heights.

The textarea grows and shrinks automatically from two rows to a viewport-aware
cap, scrolls internally beyond the cap, and no longer exposes manual resizing.
The translucent composer overlays the start of the adjacent timeline without
reserving an empty slot, while autocomplete opens above it without shifting the
draft. Its compact Post action occupies the textarea's lower-right corner
instead of reserving a separate row. Once the composer reaches its threshold,
it becomes a bottom-docked surface whose position is independent of its height,
so expansion and contraction grow upward in one layout while the viewport-bottom
edge remains stable, including at the end of the page. Reply and submission
preserve the current timeline record, draft, selection, and focus as applicable;
failures retain the complete composition state and successful posts clear and
shrink it. Rendered-browser coverage verifies desktop and narrow geometry,
multiple replies, autocomplete, retry, keyboard focus, and both appearances.
