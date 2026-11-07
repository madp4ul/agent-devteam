# 08 — Use compact durable command results

**Type:** task
**Status:** resolved — implementation and review complete; changes unstaged
**Blocked by:** None — user lifted implementation hold on 2026-11-02.
**Prerequisite:** 07 — Independently assess active command-response storage (resolved).
**Specification:** [Compact durable command results](../active-command-response-storage-spec.md).

## What to build

Make high-volume task commands return and retain compact historical results while
keeping browser behavior and documented agent responses stable. Retry protection
survives later changes and restarts without storing complete task histories.

This deliberately changes the rich application command-result contract; it must
not be presented as a transparent drop-in replacement for full snapshot replay.

## Acceptance criteria

- [x] Inventory and explicitly map every affected success/conflict/rejection and
      its application, browser and agent consumers. Preserve required historical
      facts and wire fields; query current task/history separately.
- [x] New commands store compact results without unrelated task history. Fixed-size
      command receipt size remains independent of prior task-history length.
- [x] Retry after changes and restart returns identical compact historical facts;
      comments, tasks, relationships, movements and activations are not duplicated.
- [x] Original request matching, conflict behavior, caller isolation, legacy aliases,
      and creation/lifecycle protections remain covered.
- [x] Existing full snapshot records can still replay through a tested historical
      conversion path; insufficient legacy data follows an explicit safe policy.
- [x] The released migration/version contract prevents older application versions
      from silently consuming incompatible compact storage. Fresh and upgraded
      isolated databases behave consistently.
- [x] Browser creation and mutation refresh flows and existing agent wire fields
      remain correct. Update direct application callers and behavioral tests.
- [x] Authoritative queries/history, archival retention and atomic command recording
      remain intact. Architecture and durable decision documentation reflect the
      accepted design.
- [x] Isolated payload/SQLite growth evidence, relevant regressions, typechecks and
      Standards/Spec review pass; leave implementation unstaged for user review.

## Boundaries

The earlier issue-creation-only hold was explicitly lifted by the user on
2026-11-02. Implementation used isolated application/SQLite and transport fixtures;
actual project migration and disk reclamation belong to dependent issue 09.

This ticket does not authorize operations on the running idle-game host, live
database, backups or worktrees. Its delivery need not yet reclaim historical
snapshot disk space; that is the next dependent slice.

## Answer

Implemented compact task summaries at source for creation, edits, movement,
comments, relationships and archive/unarchive results. Rich task content remains
available through queries. Existing agent HTTP/MCP fields and browser interactions
are preserved. Migration 0014 marks the result-contract compatibility boundary;
the frozen V1 mapping converts supported historical results without current-state
hydration and diagnoses unsupported replay while preserving retry identity.

Original creation/comment/movement/relationship receipts replay after subsequent
history, title/column/pin/role changes, relationship edits/deletion and restart.
Request mismatch and caller isolation remain enforced; no effects repeat.

Final integrated verification: 453 Node tests (447 passed, six existing skips,
zero failures), 22 browser regressions, typecheck and build passed. Independent
Standards and Spec reviews each have zero remaining findings after correcting
nested legacy-shape validation and strengthening public replay coverage. Full
logs: [Node](../tickets-08-09-node-tests-final.log),
[browser](../tickets-08-09-browser-tests.log). ADR 0035 and architecture document
the accepted contract. Changes remain unstaged; no commits or pushes were made.

## Comments

2026-11-02: User stopped the project and explicitly authorized work on both issues.
The previous implementation hold is lifted. Delivery uses the approved application/
SQLite and transport testing seams, test-first implementation and Standards/Spec
review. The parent coordinates dependent issue 09 and final verification.

2026-11-01: User confirmed creation of tickets 08 and 09, with the explicit
qualification "not yet work on them" because the project is running. The draft
is now a recorded delivery issue; implementation remains unstarted and unclaimed.
