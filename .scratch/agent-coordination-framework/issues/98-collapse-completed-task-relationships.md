# 98 — Collapse Completed Task Relationships by Default

**Type:** task

**What to build:** Keep unfinished relationships visible on the task details
page and put completed relationships in a drawer that starts closed and can
be opened and closed again.

**Blocked by:** None — can start immediately.

**Status:** resolved

## Problem

A task can accumulate many relationships. Once a relationship is completed,
it becomes less useful for tracking current work, but its row still takes up
space in the Relationships section. Users need to focus on unfinished
relationships while retaining easy access to completed ones.

## Acceptance criteria

- [x] On initial task-detail display, show only unfinished relationships in
  the main relationship groups. Completed relationships are hidden inside a
  collapsed drawer within the Relationships section.
- [x] Use the existing relationship satisfaction semantics to determine
  completion, consistently across Parent tasks, Child tasks, Depends on, and
  Waiting tasks. Do not infer completion solely from the task currently being
  inspected or introduce a second completion rule.
- [x] Provide a clearly labeled disclosure, such as “Completed relationships
  (N)”, that opens the drawer to show all completed relationships and closes
  it again without navigating away.
- [x] Expanded rows retain their directional grouping, related-task links,
  context, and applicable existing actions. Each relationship appears exactly
  once, either in the unfinished groups or in the completed drawer.
- [x] Keep the drawer's open/closed state stable during ordinary live refreshes
  of the same task. Reflect changes in relationship completion and the count
  using refreshed authoritative data.
- [x] When all relationships are completed, show a quiet message that there
  are no unfinished relationships while keeping the completed drawer
  discoverable. When there are no completed relationships, omit the drawer;
  preserve the existing empty state when there are no relationships at all.
- [x] The disclosure supports keyboard operation and exposes its expanded
  state accessibly. Keep its visual emphasis secondary to current task work,
  with readable and operable states in dark and light mode. Any icon uses the
  shared decorative SVG component; apply the repository's icon-centering
  coverage if introducing a new icon-button pattern.
- [x] Browser coverage verifies default collapse, opening and closing,
  mixed and all-completed relationships, no-completed and empty states,
  directional grouping and navigation, live completion changes, disclosure
  accessibility, and appearance in both themes.

## Implementation pointers

- `src/web/client/TaskRelationshipsPanel.tsx` owns relationship grouping,
  row presentation, and relationship actions. Its `relationshipEntries`
  helper currently derives `unresolved` from the relationship target's
  completion-column state.
- `test/browser/task-relationships.browser.spec.ts` covers the existing
  task-detail relationship experience.
- Follow-up to issue 48's relationship presentation; this is a display
  change, with relationship satisfaction and scheduling behavior preserved.

## Comments

- 2026-10-14: Created from the user's request to hide completed relationships
  by default and make them available in an openable and closable drawer in
  the task details Relationships section.


## Answer

Task details now partition the existing relationship entries using their existing
`unresolved` satisfaction value. Unfinished rows remain in the main directional
groups; satisfied rows appear once in a default-collapsed, counted drawer with
the same grouping, context, links, and applicable actions. The disclosure is
keyboard-operable, exposes its expanded state and controlled region, and uses
the shared decorative SVG and semantic theme colors. Its state survives ordinary
same-task polling while refreshed target columns update rows and counts.

Browser coverage verifies mixed and all-completed relationships, all four
directions, incoming-target satisfaction, no-completed and empty states, live
updates, refresh stability, keyboard operation, accessible state, completed-row
navigation and removal preview, and dark/light contrast and visual hierarchy.
The five relationship browser tests, production build, and typecheck pass.
The full repository test run also passes: 411 passed, six skipped, zero failed.
Standards and specification reviews found no actionable issues. Changes remain
unstaged for user review.
