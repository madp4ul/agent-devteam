# 01 — Establish the Released Migration Baseline

**What to build:** Establish the first migration-enabled database as a clean
released baseline: fresh databases are created only by an immutable initial
migration, record authoritative migration history, and expose a deterministic
current-schema snapshot, while unsupported pre-release databases are no longer
silently deleted.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

Specified by: [Released Schema Migrations](../spec.md)

- [ ] One application-owned ordered migration registry contains the immutable
  `0001_initial_released_schema` migration and establishes stable migration IDs
  as the database compatibility vocabulary.
- [ ] The initial migration creates the complete current coordination schema,
  including every table, constraint, index, trigger, view, and migration-ledger
  object required by the running application.
- [ ] A fresh application startup applies the complete registry through the
  migration path, records its exact ordered history, and reaches the normal
  paused startup mode without a separate schema initializer.
- [ ] The migration ledger, rather than the application package version or the
  former pre-release schema integer, is the authoritative released database
  identity.
- [ ] An existing database without the released ledger is rejected as an
  unsupported pre-release store and remains untouched; startup does not delete
  its database, WAL, or shared-memory files.
- [ ] Remove the schema-16 preservation exception and the destructive
  version-mismatch recreation policy instead of retaining them beneath the new
  lifecycle.
- [ ] A database whose ledger already equals the complete registry opens
  normally without reapplying schema work or changing its history.
- [ ] Generate and check in a deterministic complete current-schema snapshot
  from a database created by the registry. The snapshot is inspectable evidence,
  not a second executable schema definition.
- [ ] Startup-seam tests cover fresh creation, repeat startup, exact ledger
  contents, snapshot equivalence, unsupported pre-release refusal, and the
  absence of agent dispatch before normal paused startup.
- [ ] Record the released migration authority and sole executable schema path in
  an ADR, and update the architecture and backup/restore guidance where their
  pre-release lifecycle descriptions become obsolete.
- [ ] Preserve one synchronous SQLite connection, application-owned startup,
  workflow-owned command transactions after startup, and every existing
  coordination behavior unrelated to schema lifecycle.
- [ ] Run typechecking, focused database and restart coverage, the complete
  non-browser suite, the production build, and the required two-axis code
  review; leave all changes unstaged for user review.

