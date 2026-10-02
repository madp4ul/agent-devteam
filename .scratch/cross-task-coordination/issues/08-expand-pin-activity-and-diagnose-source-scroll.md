# Expand pin activity and diagnose source scrolling

Type: task
Status: open
Priority: low
Scheduling: deferred by user; do not resume automatically
Blocked by: 07

## Request

Pin/unpin timeline entries should use the pinned-comments expandable preview
pattern instead of an underlined, character-truncated link. Source navigation
should settle the movement map without requiring another user scroll tick.

## Progress

- Implemented two-rendered-line Markdown previews with Show more / Show less,
  plus a separate shared source icon. Applies to standalone and nested activity.
- Browser coverage verifies expansion, source navigation, SVG centering, and
  dark/light readability. Typecheck and build pass; 33 pin/movement/authored
  timeline browser tests pass. Standards review is clear; Spec review confirms
  the preview delivery and the unresolved scroll requirement.
- Scroll issue remains unresolved: fixture navigation with a long pinned source
  at 1100x700, 1600x1000 and 900x700 does not reproduce it. Map height and control
  position remain stable after an additional one-pixel scroll. Existing docking,
  movement expansion and map-scrubbing tests also pass. No speculative scrolling
  change has been made.
- Follow-up: user supplied http://127.0.0.1:3000/tasks/T-0004. Direct in-app
  browser navigation settles correctly. An isolated fixture replay of actual
  read-only task data passes in Firefox for both pinned comments at 1100x700,
  1600x900 and 842x1212 (six checks). Firefox requires unsandboxed launch on this
  host; its sandboxed launch stalled and was stopped. No task data was mutated.
  Still need a recording of the user's Firefox behavior, exact viewport and
  Firefox version for a failing reproduction.
- User supplied a before-scroll screenshot (1411x1249): controls header and map
  markers lie above the viewport while the empty map body fills the sidebar.
  Actual-data Firefox replay at those dimensions still passes at normal scale.
  A CSS zoom=1.25 probe pushes controls above the viewport, but remains wrong
  after an extra scroll: not yet the same bug, and not proof that browser zoom
  causes the user's problem. Further diagnosis would need Firefox version/zoom
  and crop confirmation, if the user chooses to revisit it.

## Comments

- 2026-10-02: User accepted the completed preview improvements and chose to
  move on because the scrolling glitch is not important enough to pursue now.
  Released the claim. Keep this ticket open as a low-priority, deferred record
  of the remaining glitch and reproduction evidence, not active work. No further
  diagnostic information is currently requested from the user.

## Acceptance

- Expand/collapse pin activity text using the shared preview; no whole-body
  navigation underline.
- A separate quiet source icon navigates to the original comment.
- Reproduce and fix the movement-map glitch, with browser regression evidence
  that it settles without a further scroll tick.
