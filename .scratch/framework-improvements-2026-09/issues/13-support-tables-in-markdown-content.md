# 13 — Support tables in every Markdown content surface

**Type:** task
**Status:** open
**Blocked by:** None.
**Next step:** Inventory the shared and distinct Markdown renderers, then specify and implement consistent table support.

## Problem and requested behavior

Agents sometimes use Markdown tables, but tables are not currently formatted
correctly in the product's Markdown content. Support table syntax consistently
wherever generated Markdown is rendered, rather than fixing only one visible
surface.

A wide table must not widen or break the surrounding UI. Constrain overflow to
the Markdown content region, using a local horizontal scrolling treatment or an
equally robust responsive presentation, while preserving the width of the page,
panel, dialog, and neighboring content.

## Acceptance criteria

- [ ] Inventory all user- and agent-visible Markdown rendering surfaces and the
  renderer/configuration each uses, including task descriptions, comments,
  timeline content, and conversation content where applicable.
- [ ] Standard Markdown table syntax used by agents renders as semantic table
  markup with headers, rows, cells, alignment where supported, and ordinary
  inline Markdown inside cells.
- [ ] Table styling is readable in dark and light themes and remains visually
  subordinate to the primary task content.
- [ ] A table wider than its content region cannot increase the width of the
  surrounding page, task detail, dialog, or viewport; all columns remain
  reachable without clipping content irretrievably.
- [ ] Long unbroken cell values, many columns, narrow viewports, and nested
  scrolling contexts remain operable with keyboard and pointer input.
- [ ] Shared renderer tests and browser coverage prove consistent behavior on
  every Markdown surface and include both compact and deliberately wide tables.

## Scope notes

Prefer one shared Markdown capability and table presentation over surface-local
parsers and CSS exceptions. Preserve existing sanitization and link behavior.
This ticket does not require rich table editing or spreadsheet interactions.

## Comments

- 2026-09-23: Added from user dictation. Width containment is an explicit part
  of the request, not a later visual-polish concern.
