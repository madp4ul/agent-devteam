# 64 — Show Additional Line Counts on Timeline Expansion Controls

**What to build:** A collapsed timeline preview tells the user how many
additional lines will be revealed before they choose Show more.

**Blocked by:** None

**Status:** resolved

- [x] Replace the generic collapsed `Show more` label with a concise label that
  includes the number of additional hidden lines.
- [x] Base the count on the content and wrapping actually used by the preview,
  or define another stable counting rule whose label cannot be mistaken for
  rendered lines.
- [x] Recalculate correctly after responsive layout changes, font loading, live
  refresh, and content updates without visible layout thrashing.
- [x] Keep Show less, keyboard operation, accessible naming, source-link
  expansion, and expansion persistence intact.
- [x] Handle one hidden line, many hidden lines, and content that no longer
  overflows with grammatically correct labels.
- [x] Add browser coverage at desktop and narrow widths.

## Comments

- This is a real-use refinement of the collapsed authored-prose behavior
  delivered in issue 37.

## Answer

Timeline previews now measure their same-width rendered content off-screen and
label collapsed controls as `Show N more line(s)`. Measurement is refreshed for
content changes, element resizing, and completed font loads while preserving
the existing expansion state, ARIA disclosure attributes, keyboard behavior,
and source-link expansion flow. The control disappears when no lines are
hidden.

Browser coverage verifies singular and plural labels, desktop-to-narrow
reflow, keyboard expansion, expansion persistence across live refresh, and
content that stops overflowing. Existing disclosure contrast coverage now uses
the counted accessible label.

Verification:

- `pnpm.cmd typecheck`
- `pnpm.cmd build`
- `pnpm.cmd test` (177 passed, 2 skipped)
- Focused Playwright: timeline details and responsive line counts (2 passed)
- Focused Playwright: dark disclosure contrast (1 passed)

