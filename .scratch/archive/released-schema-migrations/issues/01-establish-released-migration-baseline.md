# 01 — Establish the Released Migration Baseline

**What to build:** Establish the first migration-enabled database as a clean
released baseline: fresh databases are created only by an immutable initial
migration, record authoritative migration history, and expose a deterministic
current-schema snapshot, while unsupported pre-release databases are no longer
silently deleted.

**Blocked by:** None — can start immediately.

**Status:** resolved

Specified by: [Released Schema Migrations](../spec.md)

- [x] One application-owned ordered migration registry contains the immutable
  `0001_initial_released_schema` migration and establishes stable migration IDs
  as the database compatibility vocabulary.
- [x] The initial migration creates the complete current coordination schema,
  including every table, constraint, index, trigger, view, and migration-ledger
  object required by the running application.
- [x] A fresh application startup applies the complete registry through the
  migration path, records its exact ordered history, and reaches the normal
  paused startup mode without a separate schema initializer.
- [x] The migration ledger, rather than the application package version or the
  former pre-release schema integer, is the authoritative released database
  identity.
- [x] An existing database without the released ledger is rejected as an
  unsupported pre-release store and remains untouched; startup does not delete
  its database, WAL, or shared-memory files.
- [x] Remove the schema-16 preservation exception and the destructive
  version-mismatch recreation policy instead of retaining them beneath the new
  lifecycle.
- [x] A database whose ledger already equals the complete registry opens
  normally without reapplying schema work or changing its history.
- [x] Generate and check in a deterministic complete current-schema snapshot
  from a database created by the registry. The snapshot is inspectable evidence,
  not a second executable schema definition.
- [x] Startup-seam tests cover fresh creation, repeat startup, exact ledger
  contents, snapshot equivalence, unsupported pre-release refusal, and the
  absence of agent dispatch before normal paused startup.
- [x] Record the released migration authority and sole executable schema path in
  an ADR, and update the architecture and backup/restore guidance where their
  pre-release lifecycle descriptions become obsolete.
- [x] Preserve one synchronous SQLite connection, application-owned startup,
  workflow-owned command transactions after startup, and every existing
  coordination behavior unrelated to schema lifecycle.
- [x] Run typechecking, focused database and restart coverage, the complete
  non-browser suite, the production build, and the required two-axis code
  review; leave all changes unstaged for user review.

## Answer

Implemented the first released migration baseline with the immutable
`0001_initial_released_schema` migration, an ordered ledger-backed registry,
fail-closed pre-release refusal, and a deterministic generated current-schema
snapshot. Fresh, repeat, ledger-authority, unsupported-store, sidecar
preservation, and dispatch-gating behavior are covered through real
`CoordinationApplication` startup.

Updated ADR 0018, the architecture map, and project-state backup/restore
guidance. Typechecking, focused application/restart coverage, snapshot
regeneration, and the production build pass. The complete non-browser suite was
run; 288 tests pass, 4 are skipped, and two unchanged prompt-composition tests
fail because their expected sentence is absent from the existing framework
guidance. The final Standards and Spec reviews report no findings. All changes
remain unstaged for user review.
