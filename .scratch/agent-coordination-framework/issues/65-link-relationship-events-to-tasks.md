# 65 — Link Relationship Timeline Events to Related Tasks

**What to build:** Timeline entries that add a child task, dependency, or other
task relationship link directly to the related task.

**Blocked by:** None

**Status:** resolved

- [x] Render the related task's title or ID in relationship-added timeline
  entries as a direct link to that task's details.
- [x] Cover child, parent, dependency, and blocking perspectives using the
  direction meaningful from the currently inspected task.
- [x] Preserve links for historical relationship events after the current
  relationship is removed.
- [x] Give archived, completed, or currently unavailable related tasks an
  honest state while retaining navigation wherever direct inspection remains
  supported.
- [x] Keep attempt provenance and grouping unchanged for agent-created
  relationships.
- [x] Add application projection and browser coverage for every relationship
  direction, removal history, and archived/completed targets.

## Context

Issue 48 made current relationship rows navigable and refined the text of
relationship timeline entries. Real use found that events such as “child task
added” still need the same direct navigation to the other task.

## Answer

Reconciled the ticket against later work: direct timeline links, directional
wording, historical relationship IDs, and attempt grouping had already landed.
Completed the remaining contract by separating current relationship targets
from timeline-history targets, projecting active/completed/archived/unavailable
state for every historical target, retaining navigation for inspectable tasks,
and rendering unavailable IDs without dead links. Added application coverage
for removed relationships and every lifecycle state plus browser coverage for
child, parent, dependency, and blocking directions on creation and removal.

## Comments

- Follow-up browser verification found that the intentionally overlapping
  comment-composer layer could intercept the upper portion of a relationship
  link near the start of the timeline. Its noninteractive panel and placeholder
  surfaces now pass pointer input through to timeline content while the
  textarea, Post action, and mention options remain interactive. Browser
  coverage samples the upper and lower hit areas of a wrapped relationship link.
