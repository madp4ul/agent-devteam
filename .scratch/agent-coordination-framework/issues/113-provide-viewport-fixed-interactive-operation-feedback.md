# 113 — Provide viewport-fixed interactive operation feedback

**Type:** task

**Status:** resolved

**Blocked by:** None — can start immediately.

## What to build

Replace the static operation-feedback boxes on the board overview and task detail
pages with a shared floating feedback surface anchored to the viewport. It must
remain visible regardless of page scroll and contain actionable structured
content, demonstrated end to end with existing archive results as well as ordinary
success/error feedback. This is operation feedback, not agent attention or desktop
notifications.

## Reported problem

The current red/green text box sits at the top of the page. Users working further
down cannot see when it appears or determine which action caused it. Bulk archive
can eventually say zero tasks archived and four failed, while the interactive
per-task results are rendered separately below the box. The feedback and its
actions therefore do not form a coherent, usable unit.

## Acceptance criteria

- Show the same viewport-fixed feedback pattern on board overview and task detail,
  including when the page is scrolled deeply. Do not move the user's scroll
  position or steal focus to reveal feedback.
- Support structured content and interactions inside each feedback item: summary,
  task-specific failure details, task links and appropriate existing recovery
  actions. Integrate archive result details into that item rather than placing
  them separately in document flow. Preserve existing deletion confirmations.
- Identify the action and its target (task or board/column) and indicate when the
  feedback occurred. Updates belong to the originating operation; a later action
  must not overwrite unrelated results or make their source ambiguous.
- Provide explicit dismissal and bounded handling of multiple/long messages.
  Keep unresolved failures and actionable content available until dismissed;
  do not auto-expire content while the user is reading or interacting with it.
  Dismissing feedback does not cancel a running operation.
- Keep the surface operable in small viewports and with long per-task lists,
  without covering primary controls or preventing use of the page. Define sensible
  stacking/overflow and modal layering; avoid a full-screen collection of banners.
- Support keyboard access, accessible status/error announcements, visible focus,
  and sufficient contrast in dark and light mode. Use shared decorative SVGs with
  accessible button labels for any new icon-only controls and cover their centering.
- Add browser regressions for feedback received while scrolled, embedded archive
  actions, multiple distinct operations, dismissal, overflow and both themes.
  Existing ordinary operation feedback continues to work on both pages.

## Scope and related work

This ticket delivers the presentation with existing operation outcomes. It does
not need a generic background-job platform. Ticket 114 supplies live archival
progress and authoritative operation updates through this surface; ticket 112
fixes inspection/discard blockers independently.

## Comments

2026-11-12: User explicitly requested floating, always-in-viewport feedback that
supports interactive content, rather than static short red/green text. Feedback
must make the originating click identifiable even when several actions occur.

## Implementation evidence — 2026-11-13

Board and task detail share viewport-fixed feedback with targets, timestamps,
embedded archival results, links, and dismissal. The scrollable list can be
minimized. Browser coverage exercises multiple results, deep scroll, overflow,
keyboard dismissal, linked archival failures and both themes.

The panel retains unresolved ordinary feedback for the current page. Archival
progress and dismissal survive navigation and reload through the host operation
record.
