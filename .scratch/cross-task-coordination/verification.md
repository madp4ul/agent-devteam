# Assembled delivery evidence

All six delivery slices implement [spec.md](spec.md). The normative numbered
examples from the review draft map to executable public-seam coverage below.

| Examples | Evidence |
| --- | --- |
| 1–4: overfill, oversized record, inspection interchange, stable snapshot | `test/application/task-history.test.ts`: exact 600/700/800-word slices, target=1, inspection cursor continuation, later arrivals, restart and rejected foreign cursors. |
| 5–8: checkpoint stop, no omissions, reset, source outside page | `test/application/bounded-activation-context.test.ts`: exact 100-word remainder despite target=1000, returned older continuation, identical original-cursor retry, next-activation reset, exact out-of-page source. |
| 9–11: net pins, old newly pinned body, compact follow-up | `test/application/bounded-activation-context.test.ts`: all four membership outcomes, history/pin body deduplication, old guidance and unchanged description/pins omitted. |
| 12: consultation across independent participants | `test/mcp/project-scoped-mcp.test.ts` and `test/application/agent-conversation.test.ts`: authenticated destination-only comments, task-scoped provenance/addressing and queued recipient work. |
| 13: parallel mutations | `test/application/cross-task-mutations.test.ts`: running participants retain access, ordinary watcher effects, partial edits and revision conflicts. |
| 14: exact retry | `test/mcp/project-scoped-mcp.test.ts`, `test/application/cross-task-mutations.test.ts`, `test/application/pinned-comments.test.ts`: original guarded results, normalized current/concrete selectors, independent callers and changed-payload rejection. |
| 15: pin side effects | `test/application/pinned-comments.test.ts`: atomic pinned creation mentions once; later pin/unpin operations never activate or replay mentions; durable restart. |

Additional assembly coverage:

- Long-lived task/fresh conversation: all pins plus only recent bounded discussion.
- Retained activation payload is identical across restart/retry; fresh replacement
  receives the recovery snapshot and operating guidance.
- Equal timestamp cross-kind ordering, full traversal/exhaustion, archived reads,
  default twenty-record archive metadata pages and maximum fifty validation.
- Compact completed, failed and interrupted history outcomes; no routine
  activation-created/attempt-started entries.
- MCP catalog is exactly twenty tools with narrow caller-independent schemas;
  renamed permission reports and historical transcript recognizers remain functional.
- HTTP route inventory preserves project authorization and user-only execution,
  recovery, archive and global controls. Released migration-prefix/snapshot checks pass.
- Browser pin previews, expansion, original-source navigation across filters,
  external task labels, archived read-only controls, keyboard operation and both themes.
  Existing polling, reading anchors, composer and conversation regressions remain covered.

Standards and Spec reviews found no outstanding findings after repairs. The final
test totals and delivery state are recorded in [map.md](map.md). Changes are unstaged;
user review, staging and commits remain user-owned. Intake 12 is an interactive
instruction audit, not part of this autonomous implementation. Comment-link and
attachment expansion remain separate intakes.
