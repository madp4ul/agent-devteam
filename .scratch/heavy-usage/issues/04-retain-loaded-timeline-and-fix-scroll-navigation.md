# 04 — Retain loaded timeline content and fix scroll navigation

**Type:** task
**Status:** resolved
**Blocked by:** None
**Specification:** User feedback on 2026-10-13 supersedes ticket 02's browser
eviction requirement; the initial query and each server request remain bounded.

## Acceptance criteria

- [x] Scrolling upward does not discard requested pages or collapse the document.
- [x] Map navigation retains earlier loaded evidence and aligns its target reliably.
- [x] Native scrollbar dragging never lands in a large unhydratable blank region.
- [x] Loaded nested attempt activity and disclosure/selection survive paging/polling.
- [x] Skipped history has readable explicit load controls in both themes.
- [x] Initial and polling queries stay bounded regardless of retained DOM size.
- [x] User scrolling cancels competing source-scroll animation.
- [x] Reproduction, relevant regressions, typecheck/build and independent review pass.
- [x] Architecture, glossary and ADR describe the revised retention policy.

## Comments

The seeded example reproduced 150 retained records after five extra pages and
an approximately 1.97-million-pixel empty top spacer after a deep map jump.
Dragging the native scrollbar into that region produced zero visible timeline
records and no loading. The user explicitly prefers retaining loaded content,
even if intentionally reading all history eventually produces rendering stutter.

## Answer

Retain requested top-level and nested evidence for the lifetime of the task view.
Direct map windows merge into this cache; compact load controls replace empty
spacers. Durable sequence ordering and observed adjacency preserve page joins
through live insertions and historical watermark responses. Initial loading and
polling remain bounded. Source navigation uses monotonic elapsed time, follows
the rendered target through layout changes and yields to manual scrolling.

Verification: 61 browser regressions passed, including both themes, stale frame
timestamps, layout shifts, manual cancellation and live insertion races. The
full Node suite passed (406 passed, six platform/opt-in skips); typecheck, build
and diff whitespace checks passed. Both independent review axes have no remaining
actionable findings. Against the running seeded example, all 30 map destinations
entered the viewport; native scrollbar positions at 25%, 50% and 75% contained
visible evidence. The original blank-spacer reproduction now retains 300 entries
after five additional pages and 360 after a deep jump, with no empty spacer.

Architecture and glossary are updated; ADR 0029 supersedes ticket 02's browser
eviction policy. Changes remain for user review without agent staging.
