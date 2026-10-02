# 07 — Refine pinned comment controls and activity

**Type:** task
**Status:** resolved
**Blocked by:** None; original pin delivery is complete.
**Specification:** User's 2026-10-02 UI review in the implementation conversation.

## Accepted scope

- Replace timeline and collection pin/unpin text buttons with distinct compact,
  decorative SVG icons in accessible labeled controls.
- Put collection pin and source actions beside the two-line comment preview;
  use a compact source-navigation icon here, without changing unrelated controls.
- Retain an unpinned row in its original position for two seconds, allowing a
  reversal. Successful repinning cancels removal; persisted membership changes
  immediately and remains owned by the core.
- Show pin/unpin activity once with a short identifying link to the original
  comment, not a repeated label or a second full body.
- Creating a comment already pinned commits membership atomically without a
  separate pin-change event. Do not infer/fold paired calls in the browser.

## Delivery

Implemented shared icons, side actions, task-local two-second retention, excerpt
source links for standalone and nested activity, and single-entry pinned creation.
Existing historical audit records are preserved. The browser remains a presentation
adapter; later pin/unpin operations keep their independent audit events and never
activate agents. Architecture and MCP reference document the creation distinction.

Public checks: 353 non-browser tests passed/4 skipped; 51 affected browser tests
passed. Typecheck/build pass. Standards and Spec review have no outstanding findings.
Keyboard operation, centered SVG/button geometry, compact placement, both themes,
reversal/expiry, archived read-only state and source navigation are covered. Changes
remain unstaged. MCP output-envelope simplification is a separate agreed refinement,
not part of this UI change.
