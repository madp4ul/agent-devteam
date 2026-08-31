# 02 — Upgrade Released Databases Safely

**What to build:** Let the current application open any older released database
by creating a verified recovery backup and applying every missing migration
safely, while refusing failed, divergent, malformed, or newer schema histories
before any coordination mutation or agent dispatch.

**Blocked by:** 01 — Establish the Released Migration Baseline.

**Status:** resolved

Specified by: [Released Schema Migrations](../spec.md)

- [x] Startup accepts an existing database only when its complete ledger is an
  exact prefix of the application's immutable migration registry; equal history
  opens directly and an older prefix selects every pending migration in order.
- [x] Gaps, reordered or altered IDs, malformed ledger state, and unknown future
  migrations block startup without changing the database, WAL, shared-memory
  file, or migration history; application downgrades remain unsupported.
- [x] Before applying pending migrations, startup creates one database-only
  recovery backup through SQLite's online backup facility and independently
  verifies that backup before changing the source database.
- [x] Backup coverage proves committed data still resident in WAL is present and
  readable in the independently opened pre-upgrade backup.
- [x] The complete pending migration sequence and its ledger entries execute in
  one application-owned immediate transaction. A failure at any pending step
  rolls the complete sequence back to the original released history and data.
- [x] Startup verifies the resulting expected schema, SQLite integrity, and
  foreign keys before committing the upgrade; verification failure follows the
  same rollback and recovery path as migration failure.
- [x] Representative populated released-schema fixtures prove direct and
  skipped-release upgrades preserve task, activity, activation, conversation,
  attempt, pricing, attachment metadata, workspace identity, and other retained
  domain data applicable to each fixture.
- [x] The fixture strategy can exercise a multi-version migration chain without
  shipping fictitious production schema changes before a real second released
  schema exists; each actual future release adds its immutable production
  fixture to the permanent compatibility matrix.
- [x] A deliberately injected late failure proves earlier pending steps do not
  remain committed, the original store is recoverable, the verified backup path
  is reported, startup is a blocking configuration error, and no runtime
  dispatch occurs.
- [x] Migration is complete before process application, archival recovery,
  task-workspace consistency recovery, host-stop attempt recovery, board
  mutation, or automation dispatch can run.
- [x] Startup diagnostics distinguish incompatible history, backup failure,
  migration failure, and post-migration verification failure; they identify the
  database, relevant migration when known, available recovery backup, and a safe
  corrective action.
- [x] Backup and restore guidance explains automatic migration backups, manual
  recovery after failure, indefinite support for every released migration, and
  the distinction between a database upgrade backup and a complete project-state
  operational backup.
- [x] Keep migrations, fixtures, and the checked-in schema snapshot organized
  for indefinite retention. Do not add an ORM, generic repository, downgrade
  path, migration-pruning policy, or second database authority.
- [x] After tickets 01 and 02 satisfy their acceptance criteria, resolve source
  issue 42 rather than leaving the superseded umbrella open: set its status to
  resolved, append an answer linking this specification and both completed
  tickets, summarize the delivered released-schema guarantees, and record the
  resolution in its effort map.
- [x] Run typechecking, focused migration/restart/recovery tests, the complete
  non-browser suite, the production build, any affected browser startup coverage,
  and the required two-axis code review; leave all changes unstaged for user
  review.

## Answer

Implemented fail-closed upgrades for every older exact-prefix released history.
Startup now creates and independently verifies a database-only SQLite online
backup, applies the complete pending chain and ledger entries in one immediate
transaction, and verifies the expected schema, SQLite integrity, and foreign
keys before commit. Incompatible histories remain byte-for-byte untouched;
backup, migration, and verification failures produce distinct blocking
diagnostics with recovery guidance and no process, recovery, mutation, or
dispatch work after a failed migration gate.

Added immutable representative released data, direct and skipped-release
upgrade coverage, explicit WAL-residency evidence, late-failure rollback and
startup-order sentinels, and backup/restore documentation. Typechecking,
snapshot regeneration, focused migration/application/restart tests, and the
production build pass. The complete 300-test non-browser suite has 294 passes,
4 skips,
and the same two unrelated prompt-composition failures already recorded by
ticket 01. Final Standards and Spec re-reviews report no open findings. All
changes remain unstaged.
