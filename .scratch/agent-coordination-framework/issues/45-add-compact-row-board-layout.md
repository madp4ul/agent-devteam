# 45 — Add a Compact Row Board Layout

**What to build:** Add a user-selectable Row layout that presents the existing
board as vertically stacked workflow rows with compact empty states and
independently scrollable horizontal task strips. Keep the existing Column
layout as an alternative while making Row layout the initial default so it can
be evaluated through ordinary development use.

**Blocked by:** 19 — Inspect and Control a Task; 44 — Preserve Board Scroll
During Automatic Refresh

**Status:** open

- [ ] The board toolbar offers accessible Row layout and Column layout choices.
  The choice is one user preference applied to every board, not part of a board
  or process definition, and is remembered across visits on the same device.
- [ ] Row layout is used when no preference has been saved. Column layout
  remains available with its existing task information, actions, attention
  signals, drag-and-drop enhancement, and accessible movement path.
- [ ] Row layout keeps workflow columns in process order from top to bottom.
  Each workflow row has a compact header on the left containing its column
  name, watching-agent text, task count, and a small `+` task-creation action
  with an accessible name that identifies the destination column.
- [ ] Each workflow row owns an independent, single-line horizontal task strip.
  Cards do not wrap; overflowing rows scroll without moving the header or any
  other row, and scrolling one row does not change another row's position.
- [ ] Empty rows collapse to the height required by the compact two-line header
  rather than reserving card space. A row whose tasks are all hidden by the
  current filter collapses in the same way while its header remains visible.
- [ ] The complete compact row remains a usable drop target when it contains no
  visible tasks. Drag start, hover, enter, and leave feedback never changes the
  dimensions of either the source row or a candidate destination row; layout
  changes only after an accepted drop changes authoritative board content.
- [ ] Board cards are ordered by the task's most recent entry into its current
  workflow column. Row layout places the most recently entered task at the
  left; Column layout places it at the top. Initial creation counts as entry,
  re-entry after leaving a column makes the task newest again, and unrelated
  task updates or inert same-column moves do not reorder it.
- [ ] A newly entered task is placed at the left edge of its row, but the first
  version adds no automatic scroll intervention, newer-task indicator, or
  notification when the user is already browsing older cards to the right.
- [ ] Filtering, locating an attention card, opening task details, returning to
  the board, polling refreshes, and switching layouts preserve the applicable
  user-controlled board and per-row scroll context without repeatedly applying
  stale navigation state.
- [ ] The layout is optimized for desktop use. The column header stays beside
  the task strip while useful card space remains; only a genuinely narrow
  viewport may stack the header above the strip, without making ordinary
  desktop rows taller than their content requires.
- [ ] Application/projection tests define current-column-entry ordering, and
  browser tests cover the remembered global preference, default Row layout,
  compact empty and filtered rows, independent overflow, stable drag geometry,
  newest-first placement in both layouts, task creation, and navigation/refresh
  scroll preservation.

## Comments

- This is an alternative presentation of the existing board, not a new board
  model. The canonical domain concept remains **workflow column** even when it
  is rendered as a row.
- Supporting both layouts is an evaluation period, not a permanent product
  commitment. If Row layout proves clearly better in use, removing Column
  layout should be considered separately after evidence is available.
- A prototype was considered but deliberately skipped because the application
  already provides the relevant interaction surface and the user prefers to
  evaluate the integrated layout directly.
