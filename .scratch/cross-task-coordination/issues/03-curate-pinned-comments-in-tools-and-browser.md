# 03 — Curate shared pinned comments through MCP and browser

**Type:** task
**Status:** resolved
**Blocked by:** [01](01-cross-task-comments-and-participant-discovery.md).
**Specification:** [spec.md](../spec.md), pins/browser and mutation sections.

## Build

Persist shared pin state/audit facts. Add task.comment.pin/unpin and optional
pinned=false to comment creation; pinned=true commits comment/pin atomically.
Inspection projects the complete current pinned set. Browser task details show
quiet previews below the description with expand/jump/unpin, plus timeline pin/unpin.

## Acceptance

- [x] Pins curate immutable comments; unpin removes emphasis without retracting or
  deleting text. Complete pinned set is unpaginated without arbitrary count/text caps.
- [x] Pinning/unpinning never executes mentions or activates participants. Initial
  pinned creation executes original mentions exactly once. Already-matching pin state
  is inert. Keys replay exactly and reject changed payloads.
- [x] Any authorized participant/user may curate a mutable destination. Origin
  attribution remains correct. Archived controls/commands remain read-only.
- [x] Pin state and audit evidence survive restart and released-schema migration;
  capture enough state for 05 to compare per-conversation checkpoint membership,
  including intermediate toggles and old comment pinning.
- [x] Browser previews expand and jump to the exact original timeline position,
  reveal filtered targets, and preserve polling/reading anchors. Support keyboard,
  responsive layout, and dark/light appearance. Shared decorative SVG icon controls
  meet accessible labels and geometric center coverage.
- [x] Current-state and audit projections do not create a competing authority.
  Update glossary for shared pinned guidance and architecture for its durable owner.

Do not add comment-link syntax or automatic pin-triggered follow-ups. 05 implements
activation pin delivery; this slice provides the durable/browser/tool capability.

## Delivery

Shared pins, atomic pinned creation, guarded MCP/browser commands, quiet previews
and original-position navigation are implemented. Migration 0005 preserves audit
evidence. Core restart/no-effects, MCP replay, browser keyboard/theme/navigation
checks pass; typecheck/build pass and non-browser suite is 346 passed/4 skipped.
Standards review is clear; the Spec retry-identity finding was repaired and covered.
No new icon-only pattern was introduced. Changes remain unstaged for user review.
