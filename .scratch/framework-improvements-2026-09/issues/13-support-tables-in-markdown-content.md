# 13 — Support tables in every Markdown content surface

**Type:** task
**Status:** resolved
**Blocked by:** None.
**Next step:** User review.

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

- [x] Inventory all user- and agent-visible Markdown rendering surfaces and the
  renderer/configuration each uses, including task descriptions, comments,
  timeline content, and conversation content where applicable.
- [x] Standard Markdown table syntax used by agents renders as semantic table
  markup with headers, rows, cells, alignment where supported, and ordinary
  inline Markdown inside cells.
- [x] Table styling is readable in dark and light themes and remains visually
  subordinate to the primary task content.
- [x] A table wider than its content region cannot increase the width of the
  surrounding page, task detail, dialog, or viewport; all columns remain
  reachable without clipping content irretrievably.
- [x] Long unbroken cell values, many columns, narrow viewports, and nested
  scrolling contexts remain operable with keyboard and pointer input.
- [x] Shared renderer tests and browser coverage prove consistent behavior on
  every Markdown surface and include both compact and deliberately wide tables.

## Scope notes

Prefer one shared Markdown capability and table presentation over surface-local
parsers and CSS exceptions. Preserve existing sanitization and link behavior.
This ticket does not require rich table editing or spreadsheet interactions.

## Answer

Implemented table support once in the shared `MarkdownContent` renderer with
the table-only micromark and mdast GFM extensions; existing HTML/image
restrictions, task-aware links, and non-table Markdown behavior stay in place.
Every applicable surface uses this renderer:

- task descriptions use `TaskPage` -> `TextPreview` -> `MarkdownContent`;
- timeline comments, attempt outcomes, and conversation-continuation messages
  use `Timeline` -> `TextPreview` -> `MarkdownContent`;
- authored user messages, agent transcript messages, and coordination comments
  use `ConversationHistory` -> `MarkdownContent`.

The shared table component retains semantic table, header, row, and cell markup,
including GFM alignment and inline Markdown. Its focusable local overflow region
owns horizontal scrolling, while shrinkable conversation grid tracks prevent a
wide table from contributing its intrinsic width to the dialog. Task detail
columns use the same shrinkable-track rule, so description tables remain local
scrollers even at narrow viewport widths. The table renderer has stable React
identity, which preserves the scroll element and its horizontal position when
the task page's live polling refreshes its data instead of remounting the table
and making its scrollbar blink. Theme-aware, quiet borders and header fills
keep tables subordinate to the surrounding task content in both appearances.

Browser coverage exercises compact and deliberately wide tables across task
descriptions, comments, attempt outcomes, timeline conversation content, and
both user and agent conversation messages. It verifies semantic roles,
alignment, inline formatting, narrow viewport containment, long unbroken cell
values, pointer-accessible overflow, keyboard scrolling, and dark/light
contrast. A polling regression also verifies that the same table scroll element
and horizontal offset survive a live task refresh. Final verification passed
`pnpm build`, `pnpm typecheck`, all 315 non-skipped Node tests (four expected
integration skips), all issue-specific browser coverage, and the complete set
of 157 browser tests.

## Comments

- 2026-09-23: Added from user dictation. Width containment is an explicit part
  of the request, not a later visual-polish concern.
