# 02 — Verify the Complete Migration Schema

**What to build:** Detect incomplete schema changes before application startup or upgrade accepts the database, so future development cannot silently lose coordination-enforcing indexes, triggers, constraints, or other required schema objects while passing a partial checklist.

**Blocked by:** None — can start immediately.

**Status:** resolved

## Context

An in-memory audit probe appended a test migration that dropped the unique
indexes enforcing one running activation per task and one current conversation
per task/agent, plus the activation-order trigger. Default database verification
accepted the result. The current hand-maintained verifier checks only selected
tables, columns, view names, and fragments of a check constraint.

The user approved this work specifically as protection against mistakes made
during future project development, not as a general database-tampering feature.

- [x] Establish red application-startup coverage for omitted invariant-enforcing schema objects using temporary real SQLite databases and the existing migration test seam.
- [x] Replace the partial hand-maintained acceptance checklist with complete, reviewable schema expectations derived from the migration-defined schema; retain the registry as the sole executable schema-construction path.
- [x] Keep expected and actual evidence sufficiently independent to detect a defective migration. Replaying the same defective chain and comparing it with itself is not a sufficient test or safety net. A generated, independently reviewed schema artifact may supply expectations but must never become an alternate initializer.
- [x] Cover missing or changed indexes/triggers and meaningful table/constraint or view drift; preserve a legitimate direct/skipped upgrade path, current-database startup, and fresh creation. Account for SQLite's harmless schema-text rewriting without weakening required behavior.
- [x] Verification failure remains a blocking startup diagnostic. Pending migration work and ledger writes roll back together, the verified recovery backup remains usable, and process application/recovery/dispatch cannot begin.
- [x] Preserve immutable released migrations, backup semantics, compatibility history, and single database authority. Do not adopt an ORM, introduce a framework, or edit the released baseline migration to repair verification.
- [x] Document the authoring/review and snapshot-generation workflow so a future agent can change a schema without manually synchronizing a second partial checklist or bypassing verification accidentally.
- [x] Update architecture/ADR reasoning where the verification contract changes, and retain tests through application startup plus independently inspected SQLite recovery artifacts as already established for migrations.
- [x] Run focused migration/restart tests and typechecking; participate in final combined non-browser verification, build, and independent Standards/Spec review.
- [x] Record red/green evidence, design limits, and outcomes under Answer; leave changes unstaged.

## Delivery coordination

This ticket owns migration/schema verification and its focused documentation.
The coordinating agent owns the final combined test run and two-axis review.

## Answer

Implementation complete; final combined verification and independent review
passed. Changes remain unstaged for user review.

Startup now compares the complete application schema object inventory and
tokenized definitions with the unchanged, checked-in `current-schema.sql`.
The prior selected-table/column checklist was removed. The released registry
and initial migration remain unchanged and remain the only executable schema
definition. The artifact is read lazily inside the handled verification gate,
never executed. The explicit generator still runs only the registry, without
requiring unreviewed output to match old expectations.

The application-startup tests use temporary SQLite files and independently
inspect recovery artifacts. Successful synthetic direct/skipped chains receive
an explicitly authored additional-table expectation rather than deriving an
expectation from the tested migration. Coverage verifies missing and changed
unique indexes/predicates, triggers, foreign-key/nullability/check constraints,
views, and unexpected objects; current-store validation, fresh startup, direct
and skipped upgrades, SQLite ALTER/rebuild formatting, rollback, recovery
backup integrity, and blocked process application/recovery/dispatch remain
covered. A subprocess-only file-unavailability injection proves missing review
evidence reports a blocking diagnostic without altering the shared snapshot.

Red/green evidence:

- Omitting both concurrency-enforcing unique indexes and the activation-order
  trigger previously returned `paused`; the regression expected and now gets
  `configuration-error`, with source schema/ledger restored and recovery copy
  independently verified.
- A legal unexpected `sqliteProbe` table initially slipped through the existing
  SQL `LIKE 'sqlite_%'` filter. Matching the literal reserved `sqlite_` prefix
  with `GLOB` now rejects it.
- A CHECK literal containing CRLF was initially accepted against a different
  LF literal because the old snapshot formatter normalized line endings inside
  SQL strings. Removing that global text rewrite now preserves literal values
  while token comparison still ignores nonliteral layout.
- The first combined suite exposed a test-owned `reject_attempt_start` trigger
  left behind by the workspace-start failure test; complete verification
  correctly blocked that schema before the test's intended workspace gate.
  After recording its failure assertions, the test now removes only its own
  injection before restart. The intended workspace diagnostic is preserved.

Verification: the final focused migration/restart/workspace run passed **37/37**
tests; typechecking passed. Explicit regeneration reproduced the existing
snapshot with no semantic diff; `git diff --check` passed. The coordinating
agent's initial combined run was 311 passed, one failure (the corrected
test-injection cleanup), and four skips; final rerun/review results follow here
in the final integration comment below.

Design limits: comparison is deliberately conservative lexical structure, not
general SQL semantic equivalence. It tolerates comments, layout, keyword case,
and simple SQLite object/table-name quoting but preserves literals and
expression tokens; reordered/equivalently rewritten constraints may require
explicit review. Implicit indexes are represented by their table constraints;
SQLite-managed schema is excluded. Blindly regenerating and accepting a broken
schema can still bless an omission, so authoring requires independent behavior
tests and review of every removed/changed invariant. The configuration-error
shell alone creates disposable registry-based state without repeating the
snapshot gate; it retains SQLite health checks and cannot enable normal
commands or dispatch. Architecture, ADR 0018, and development setup document
these limits and the requirement to ship the reviewed artifact with the host.

## Comments

Final integration on 2026-09-02: `pnpm test` passed with 313 passes, zero
failures, and four skips (317 tests). `pnpm typecheck` and `pnpm build` passed.
Both review axes reported zero outstanding findings after correcting a
CRLF-checkout weakness in the literal regression setup. The independent
expectation now asserts that its intended replacement occurred. Startup
diagnostics also direct investigation toward the application, reviewed schema
artifact, and migration before suggesting changes to retained data.
The immutable migration baseline and generated schema snapshot remain unchanged.
No browser interaction changed; the full non-browser suite includes HTTP
startup/diagnostic coverage. Nothing was staged or committed.
