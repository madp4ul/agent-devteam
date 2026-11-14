# 05 — Float workspace and file feedback, confirm comments, compact cards

**Type:** feature

**Status:** resolved

**Blocked by:** None

## Request

Workspace Copy path, Open folder and Open in Visual Studio Code must publish to
the shared floating feedback surface. Apply the recorded decision for Markdown
local-file links as well. Add timed comment-post success feedback. Reduce the X
and card height, and extend the draining edge to the full height, clipped by the
card's rounded corners. Keep Copy Markdown and attachment indicators local.

## Implementation

TaskPage owns task Markdown context as well as its existing feedback queue, and
passes the queue callback to workspace controls. Both success and failure use the
same independent floating surface; open requests retain button pending state
without a separate progress notice. Comment acceptance publishes success before
any task-refresh result, preserving draft clearance and refresh-failure behavior.

Cards use a smaller shared SVG X and reduced padding. Their full-height edge is
clipped by the rounded card, and continues to drain and pause with the timer.
Interruption-progress consolidation remains a separate recorded follow-up.

## Validation

Typechecking and the isolated review build passed. All 52 affected browser checks
passed across lifecycle feedback, task Markdown, comments and workspace controls.
Coverage includes floating success/error ownership, no inline tags, acceptance
before delayed/failed comment refresh, compact card geometry, a full-height
draining edge, hover/focus pause, reduced motion, both appearances, and centered
SVG close controls. Shared runtime assets and Git staging remain untouched.
