# 16 — Navigate the timeline with a compact column-movement map

**Type:** prototype
**Status:** open
**Blocked by:** None.
**Next step:** Grill the interaction model, then prototype it against representative long task histories.

## Problem and proposed direction

Long task timelines are difficult to navigate. Task movements are meaningful
workflow landmarks, but finding an earlier movement currently requires scanning
the full narrative history.

Add a compact, navigation-focused overview of the task's column history. Arrange
the board's columns as horizontal lanes from the first column on the left to the
last column on the right. Draw the task's movement history vertically: a node
marks its starting column, the path continues through time, and each movement
crosses into the corresponding destination lane. Selecting a movement node or
an adequately sized target around it jumps to the associated movement record in
the task timeline.

The control should behave more like a code editor's compact scrollbar/minimap
than a second full-height timeline. It summarizes a potentially much longer
history into a small navigation surface. Although movement controls already
link to the current-column source, the user's present preference is to keep this
overview near the timeline as a navigation aid rather than combine it with the
Move task command.

## Design and prototype criteria

- [ ] Validate the lane/path metaphor with real histories containing few, many,
  repeated, backward, and rapid column movements.
- [ ] Define the overview's placement, dimensions, orientation, and relationship
  to the scroll viewport without requiring it to match the timeline's full
  rendered height.
- [ ] Preserve board column order from left to right and make column identity
  understandable without turning the overview into a large second board.
- [ ] Represent the starting position and every durable movement once, including
  repeated visits to the same column and movements nested within attempt blocks.
- [ ] Selecting a landmark scrolls to, focuses, and temporarily identifies the
  exact timeline movement using the existing source-navigation conventions.
- [ ] Provide keyboard and assistive-technology navigation, sufficiently large
  interaction targets, current-position feedback, and an alternative to relying
  only on path shape or color.
- [ ] Define behavior for very many columns or movements, narrow screens,
  Completion, unmapped tasks, process evolution, renamed/removed columns, live
  refresh, timeline filters, and movement records currently hidden by a filter.
- [ ] Keep the overview visually quieter than primary task content and verify
  dark/light appearance and nested scrolling behavior.
- [ ] Use the prototype to decide whether this belongs beside the timeline,
  floats like an overview rail, or needs another navigation presentation before
  writing an implementation specification.

## Scope notes

The movement map navigates historical evidence; it does not itself move the
task or replace the authoritative Move task control. Reuse the existing durable
movement source IDs and focus behavior rather than creating parallel history.
Coordinate layout with issue 17's timeline compaction controls.

## Related work

The implemented timeline work in
[`agent-coordination-framework` issue 37](../../agent-coordination-framework/issues/37-structure-task-history-by-cause-and-attempt.md)
already gives movements distinct presentation and source-navigation behavior.
The prototype should extend that model rather than flattening grouped attempts.

## Comments

- 2026-09-23: Added from user dictation. Integrating the map with Move task was
  considered, but a scrollbar-like navigation control is currently preferred.
