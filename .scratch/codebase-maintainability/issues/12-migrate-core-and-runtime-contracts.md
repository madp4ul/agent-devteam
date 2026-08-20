# 12 — Migrate core and runtime contracts

**What to build:** Move application, persistence, automation, process, workspace, notification, and runtime callers onto the capability contracts they actually use.

**Blocked by:** 11 — Expand capability-focused contracts.

**Status:** resolved

- [x] Core and runtime modules import only their relevant capability contracts.
- [x] The authoritative application interface and runtime behavior remain unchanged.
- [x] No compatibility export is removed in this ticket.
- [x] Typechecking and application, runtime, and integration tests pass.

## Answer

Migrated application composition, persistence, automation, process, workspace,
notification, task, conversation, host, and Codex runtime callers from the broad
coordination contract to the capability contracts they use. Added the missing
type-only `BoardSummariesQueryResult` process export discovered by the migration.
The broad declaration source and `CoordinationApplication` compatibility export
remain in place for the assigned issue 14 cleanup; runtime behavior and the
single application/SQLite authority are unchanged.

Verification passed with typechecking, 147 focused application/runtime/integration
tests (145 passed, 2 intentional skips), the full 199-test non-browser suite
(197 passed, 2 intentional skips), the production build, and `git diff --check`.
The required parallel two-axis review reported zero Standards findings and zero
Spec findings.
