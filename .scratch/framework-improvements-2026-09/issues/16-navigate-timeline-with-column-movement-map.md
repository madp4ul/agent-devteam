# 16 — Navigate the timeline with a compact column-movement map

**Type:** task
**Status:** resolved
**Blocked by:** None.
**Next step:** User review and visual/interaction tuning against real task histories.

## Problem and proposed direction

Long task timelines are difficult to navigate. Task movements are meaningful
workflow landmarks, but finding an earlier movement currently requires scanning
the full narrative history.

Add a compact, navigation-focused overview of the task's column history. Arrange
the board's columns as horizontal lanes from the first column on the left to the
last column on the right. Draw each durable movement as a source-to-destination
path, newest first, without inventing a task-created landmark. Selecting a
movement node or its adequately sized target jumps to the associated movement
record in the task timeline.

The control should behave more like a code editor's compact scrollbar/minimap
than a second full-height timeline. It summarizes a potentially much longer
history into a small navigation surface. Although movement controls already
link to the current-column source, the overview belongs below those controls in
the sticky **Task position** panel. It grows only as page scrolling releases
vertical sidebar space, leaving the timeline's width unchanged.

## Design and implementation criteria

- [x] Validate the lane/path metaphor with histories containing few and many,
  repeated, backward, and rapid column movements.
- [x] Define the overview's placement, dimensions, orientation, and relationship
  to the scroll viewport without requiring it to match the timeline's full
  rendered height.
- [x] Preserve board column order from left to right and make column identity
  understandable without turning the overview into a large second board.
- [x] Represent every durable movement once, including repeated visits to the
  same column and movements nested within attempt blocks; omit a starting entry.
- [x] Selecting a landmark scrolls to, focuses, and temporarily identifies the
  exact timeline movement using the existing source-navigation conventions.
- [x] Provide keyboard navigation, sufficiently large
  interaction targets, current-position feedback, and an alternative to relying
  only on path shape or color.
- [x] Define behavior for very many columns or movements, narrow screens,
  Completion, unmapped tasks, process evolution, renamed/removed columns, live
  refresh, timeline filters, and movement records currently hidden by a filter.
- [x] Keep the overview visually quieter than primary task content and verify
  dark/light appearance and nested scrolling behavior.
- [x] Resolve placement in the product: the map grows inside the sticky Task
  position panel and leaves timeline width unchanged.

## Scope notes

The movement map navigates historical evidence; it does not itself move the
task or replace the authoritative Move task control. Reuse the existing durable
movement source IDs and focus behavior rather than creating parallel history.
Coordinate layout with issue 17's timeline compaction controls.

## Related work

The implemented timeline work in
[`agent-coordination-framework` issue 37](../../agent-coordination-framework/issues/37-structure-task-history-by-cause-and-attempt.md)
already gives movements distinct presentation and source-navigation behavior.
The implementation extends that model rather than flattening grouped attempts.

## Comments

- 2026-09-23: Added from user dictation. Integrating the map with Move task was
  considered, but a scrollbar-like navigation control is currently preferred.
- 2026-09-24: The user explicitly chose implementation in the product rather
  than a throwaway prototype. The interaction design was resolved in
  conversation as follows.
- 2026-09-25: Visual review found that the dark-theme shared button rule painted
  every transparent movement target action-green, joining the rows into a solid
  block above the movement drawing. The landmark rule now wins that cascade and
  is covered in both themes. The viewport frame is outline-only, short histories
  align to the top instead of floating in the map center, the panel clips the map
  to its rounded corners, and Conversations retains a bottom viewport gutter.
- 2026-09-25: A second dark-mode review found the shared hover rule still won
  while pointing at a movement. Rest, hover, and focus states are now checked in
  both themes, and the drawing paints above the subtle interaction tint. Agent
  markers are larger lane dots; user-initiated moves use an attention-colored
  transition rather than assigning the user to a lane.
- 2026-09-25: Replaced filled lane areas and edge dividers with one quiet rail
  through the center of each column. Long-history manipulation now pans the map
  beneath a centered viewport frame, uses a click/drag threshold everywhere in
  the map, stops when the pointer stops, preserves clicks through the frame,
  keeps the frame inside the clipped map, and suppresses document selection only
  for the duration of a captured drag.
- 2026-09-25: Changed the current trial from direct map panning to mouse-native
  viewport scrubbing while retaining a one-policy switch back to map panning.
  Each drag freezes its geometry at pointer-down, derives an absolute target from
  total pointer displacement, and coalesces scroll work to animation frames.
  Residency lifelines now use a neutral emphasized role distinct from movement
  arrows. Long maps show a non-interactive overview scrollbar, and landmark
  navigation focuses immediately while easing the page and map over 480 ms.
- 2026-09-25: Retained viewport scrubbing after user review confirmed its
  direction and performance. A fixed trial legend now places compact column
  initials above the rails with full names on hover. The long-history overview
  is a passive range bracket in a dedicated right gutter rather than a
  scrollbar-like thumb over the final lane. Fixed rails and moving residency
  lines share the same percentage coordinate system, residency uses an
  emphasized neutral rail role, agent dots are larger, and transition
  arrowheads now inherit their line's agent/user paint without a separate
  marker-color path.
- 2026-09-25: Follow-up visual review replaced the hollow, clamp-shaped range
  bracket with a slim emphasized range segment over a faint full-extent line.
  Agent dots no longer use a surface-colored outline, so arrows and residency
  lifelines meet the dot without artificial gaps. Legend initials use
  geometry-centered SVG text, and their column names now appear in the
  application's immediate styled tooltip overlay rather than a delayed native
  browser title.
- 2026-09-25: Scrubbing is now enabled only after the sidebar has released the
  map's full available height. A drag freezes that full-height reveal boundary
  and cannot scroll above it, preventing the gesture from shrinking its own
  coordinate space; partially revealed maps remain clickable and wheel-scroll
  with the page but do not begin a scrub. Legend tooltips open above their
  non-selectable badges. The Next control keeps its layout slot and becomes
  disabled with an honest label when no following column exists.
- 2026-09-25: Fine-tuning found reveal-time flicker that looked like the map
  briefly overlapping Conversations. Geometry sampling confirmed the panels
  never overlap, and the moving strip now receives transform-layer promotion
  only once the map is fully expanded and draggable. A more exact sample after
  each scroll event but before the scheduled map update reproduced the actual
  symptom: Conversations moved 15.875 px upward until the next animation frame
  expanded the map. Reveal height now synchronizes inside the scroll event
  rather than deliberately waiting one additional frame; drag work remains
  animation-frame-coalesced, preserving scrub performance.
- 2026-09-26: Physical wheel scrolling showed that synchronizing the scroll
  handler still could not eliminate a compositor frame before main-thread
  layout. The reveal phase now bottom-docks the complete Task position and
  Conversations group before the map gains height, while a sticky placeholder
  preserves its document footprint. Conversations therefore stays 16 px from
  the viewport bottom independently of scroll-event timing and the map grows
  upward. The docking limit uses the sticky slot's resolved pixel offset rather
  than parsing the unresolved `4.5rem` token as `4.5`.

## Agreed implementation

- Rename the sidebar panel from **Move task** to **Task position**. Keep the
  authoritative move controls at its top and add a non-interactive summary:
  `Not moved yet`, `Moved once`, or `Moved N times`. Keep the Next button's
  layout slot present; disable it when no following column exists.
- Keep the map collapsed while the upper task-detail content is in view. Once
  the bottom of Conversations reaches the viewport bottom, scrolling farther
  continuously gives the released sidebar height to the map. Conversations
  remain bottom-anchored; the movement controls remain at the top. The map
  never takes width from the timeline and never overlaps the comment composer.
- Draw board columns as equal-width lanes in board order, represented by one
  vertical rail through each lane's center rather than filled areas or boundary
  dividers. Trial a fixed row of compact initial badges above the moving map,
  aligned to the rails and exposing each full column name on hover. Reuse the
  board's user-owned color on its rail and legend badge.
- Draw every durable `task.moved` record once, newest first, without adding a
  task-created landmark. Each row shows the actual source-to-destination path.
  Put a larger actor dot in the lane watched by the initiating agent. Indicate a
  user-initiated move by coloring its transition arrow with the user-attention
  role, without adding a marker to any lane. Treat unwatched columns as
  user-owned and use the corresponding rail appearance. Current watcher
  assignments may be applied retrospectively; missing legacy identities must
  remain renderable without elaborate reconstruction.
- Use 28 px per movement row after visual review found the initial 40 px rhythm
  unnecessarily loose, and keep spacing behind one policy so bounded
  compression can be tuned later. Expanding the panel reveals
  more of a stable strip; it does not stretch existing rows. When the complete
  strip does not fit, show a clipped window around the timeline viewport.
- Derive a viewport frame by mapping the rendered timeline viewport's top and
  bottom independently through the movement landmarks. Interpolate between
  landmarks so the frame moves continuously through long non-movement spans.
  Dragging the frame applies the inverse mapping to the main document scroll;
  wheel input over the map continues to scroll the main page rather than a
  nested scroller. The current trial uses viewport-scrubbing direction: dragging
  downward advances the timeline, even when the gesture begins outside the
  visible frame. Direct map-panning direction remains an isolated policy change
  if user review prefers it. Only pointer movement advances the scrubber; the
  frame stays centered where possible and moves toward the map edge when the
  history reaches an end. Scrubbing begins only once the map has its full
  available height and is clamped at that reveal boundary so a drag cannot
  shrink the map; partial maps retain landmark and ordinary page-scroll
  behavior. A click on any movement navigates to it whether it lies inside or
  outside the frame.
- Distinguish task residency from movement: vertical lifeline segments use a
  neutral emphasized role while transition arrows retain movement or user-
  attention color. For a clipped long history, show a non-interactive visible-
  range bracket in its own gutter that communicates the visible fraction and
  position without resembling a draggable scrollbar or intercepting wheel input.
  Landmark navigation focuses and highlights immediately, then eases both the
  page and scroll-linked map to the destination over roughly half a second.
- Selecting a movement uses the existing source focus, scroll, and temporary
  highlight behavior. The map follows live refresh from the preserved timeline
  anchor. A future filter that hides movement records must also filter the
  movement collection passed to the map so those nodes and anchors disappear.
- Many columns use the available width without a minimum lane width. Short
  viewports may show no map. The existing narrow stacked task-detail layout is
  outside this feature's supported presentation. Conversation-height limits
  may be considered later if real histories require them.
- Keep scroll-linked reveal and direct manipulation tied to the user's input;
  do not add decorative easing or delayed animation. Use the existing
  dark/light semantic color roles.

## Implementation result

Implemented the first product version on 2026-09-24. The task-detail sidebar now
uses the **Task position** panel, reports the durable movement count, reveals the
map continuously as scrolling releases sidebar height, preserves Conversations
at the viewport bottom, renders full-height agent/user-owned lanes and fixed
movement rows, maps a dynamic viewport frame through real timeline geometry,
and drives the main document from frame dragging and wheel input. Landmark
selection reuses the existing source navigation behavior.

Browser coverage exercises count presentation, collapsed and expanded geometry,
lane and landmark rendering, theme roles, conversation anchoring, frame dragging,
wheel navigation, source focus, short viewports, and the existing movement
commands. Verification passed the typecheck, production build, all 318 enabled
unit tests (4 skipped), and all 159 browser scenarios.

The 2026-09-25 legend, indicator-gutter, paint, and alignment refinement passed
the production build, typecheck, all 318 enabled unit tests (4 skipped), and all
7 focused task-movement browser scenarios, including dark/light interaction
states and long-history scrubbing.
