# Released Schema Migrations

Type: specification
Status: ready-for-agent
Source: [Issue 42 — Support Released Schema Upgrades](../agent-coordination-framework/issues/42-support-released-schema-upgrades.md)

## Problem Statement

The coordination framework now holds valuable work data that must survive
application upgrades. Its current pre-release schema policy assigns an internal
integer to each schema shape but deletes any database whose version or structure
does not exactly match the running application. That policy made rapid
development simple, but it no longer fits real use: upgrading the application
must not require discarding tasks, conversations, attempts, activity, pricing,
attachments metadata, workspace registrations, or other retained coordination
state.

The existing schema numbers do not identify supported releases and there is no
ordered history of applied changes. Startup cannot distinguish a database that
can be upgraded from one created by a newer or incompatible application. It
also has no verified recovery backup or transactional migration path. Continuing
the current deletion behavior would put the user's retained work at risk.

## Solution

Establish the first migration-enabled release as the durable schema boundary.
That release starts a new, immutable, application-owned migration chain with an
initial migration that creates the complete current database. Pre-release
databases are not adopted or migrated; migration compatibility begins with
databases created by the initial released migration.

Every database records its applied migration IDs in an ordered ledger. Fresh
databases and upgrades use the same executable path: apply every missing
migration in order and record it atomically. The running application accepts an
existing database only when its ledger is an exact prefix of the migration
chain bundled with that application. It upgrades an older released prefix,
opens an equal chain, and refuses unknown, newer, malformed, reordered, or
pre-release databases without changing them.

Before changing a released database, startup creates and independently verifies
a SQLite recovery backup that includes committed WAL data. It then applies the
complete pending migration sequence transactionally, verifies the resulting
schema and relational integrity, and only afterward allows process application,
board mutation, recovery workflows, or agent dispatch. All released migrations
remain supported indefinitely so a retained database can upgrade across any
number of skipped application releases.

## User Stories

1. As the user, I want my retained coordination data to survive application upgrades, so that I can continue real work without recreating tasks and history.
2. As the user, I want to upgrade across several skipped application releases, so that I am not required to install every intermediate build manually.
3. As the user, I want every released database schema to remain upgradeable, so that old retained data does not acquire an undocumented expiration date.
4. As the user, I want startup to recognize when my database is already current, so that ordinary launches do not perform unnecessary schema work.
5. As the user, I want startup to apply all missing migrations in their defined order, so that each data transformation receives the schema it expects.
6. As the user, I want a recovery backup before an upgrade changes my database, so that a failed application upgrade cannot strand my only retained copy.
7. As the user, I want the recovery backup to include committed WAL data, so that recently committed work is not omitted from recovery.
8. As the user, I want the application to verify the backup independently before migration, so that the presence of a copied file is not mistaken for recoverability.
9. As the user, I want a failed migration to leave the pre-upgrade database recoverable, so that I can return to the last understood state.
10. As the user, I want startup to report migration failure as a blocking configuration error, so that automation cannot run against a partially understood schema.
11. As the user, I want an older application to refuse a database written by a newer application, so that downgrading cannot silently damage newer retained state.
12. As the user, I want unknown or malformed migration history left untouched, so that startup never guesses how to repair data it cannot understand.
13. As the user, I want unsupported pre-release databases rejected rather than represented as released schemas, so that the compatibility promise begins at a clear boundary.
14. As the user, I want fresh installations and upgrades to use the same migration path, so that upgrade-only code is exercised continuously.
15. As the user, I want migration failures to identify the failed migration and recovery backup, so that recovery does not require inspecting implementation internals.
16. As the user, I want successful migration to preserve task, conversation, attempt, activity, pricing, attachment, and workspace identity, so that an upgrade changes representation rather than meaning.
17. As the user, I want migration to finish before process evolution or restart recovery begins, so that startup workflows see only the current schema.
18. As the user, I want automation to remain paused throughout migration, so that no agent observes or mutates an intermediate database.
19. As the maintainer, I want each schema change isolated in one immutable migration, so that adding a later migration does not require modifying historical transitions.
20. As the maintainer, I want the database ledger to expose exactly which migrations were applied, so that compatibility and failures are diagnosable without inferring history from table shape.
21. As the maintainer, I want the running application's migration chain to be the schema-version authority, so that package versions and database compatibility are not conflated.
22. As the maintainer, I want ledger history to be an exact prefix of the bundled chain, so that gaps, reordering, renamed migrations, and unknown future migrations fail closed.
23. As the maintainer, I want one executable path for fresh creation and upgrades, so that a separate current-schema initializer cannot drift from historical migrations.
24. As the maintainer, I want a generated current-schema snapshot, so that today's complete schema remains inspectable without mentally replaying every migration.
25. As the maintainer, I want the checked-in schema snapshot verified against a freshly migrated database, so that it cannot silently become stale.
26. As the maintainer, I want released-schema fixtures with representative retained data, so that every supported upgrade path proves preservation rather than only successful DDL execution.
27. As the maintainer, I want injected late migration failures covered through the real startup seam, so that transaction and recovery guarantees are executable evidence.
28. As the maintainer, I want migration SQL and data transformations visible and reviewable, so that a framework or generator never becomes the authority for retained-data safety.
29. As the maintainer, I want future migration tooling to remain optional, so that generated SQL can assist authoring without owning backup, ordering, verification, or recovery policy.
30. As the maintainer, I want old released migrations retained in an organized directory, so that indefinite upgrade support remains local and navigable.

## Implementation Decisions

- The first migration-enabled release is the released-schema boundary. Existing
  pre-release schema identities, including the current internal schema number,
  have no released compatibility meaning and receive no migration or adoption
  path.
- Remove the special pre-release schema-16 preservation path. An existing
  database without the released migration ledger is unsupported and startup may
  reject it with a straightforward configuration error.
- Use one application-owned ordered migration registry. Every migration has a
  stable immutable ID, an explicit predecessor position, and one visible schema
  or data transition.
- Store applied IDs in a migration ledger inside SQLite. The ledger is the
  authoritative database identity. The application package version and SQLite's
  historical pre-release schema integer are not compatibility authorities.
- A database is compatible when its complete ledger is an exact prefix of the
  application's registry. Equal history opens normally; an older prefix applies
  every pending migration; any gap, divergence, reordered entry, or unknown
  suffix blocks startup without mutation.
- Downgrades are unsupported. An older application treats a database with newer
  migration history as an unknown future schema and leaves it untouched.
- Use the migration chain as the sole executable schema-construction path.
  Fresh databases begin empty and apply the initial released migration followed
  by every later migration. Do not retain a separate current-schema initializer.
- Keep historical migrations in a focused directory and never edit an applied
  released migration. Corrections are new forward migrations.
- Produce a deterministic, checked-in current-schema snapshot from a database
  created by the complete chain. The snapshot is an inspection and drift-review
  artifact, not an executable second schema definition.
- Keep the built-in synchronous SQLite driver and project-owned, reviewable SQL.
  The migration safety envelope does not depend on adopting Drizzle. A future
  accepted tool may draft SQL but cannot own the registry, ledger, backup,
  verification, startup gate, or fixtures.
- Before applying any pending migrations, create one database-only recovery
  backup through SQLite's online backup facility and independently open and
  verify it. The backup must contain committed WAL data. Conversation attachment
  content and task worktrees are not copied by this automatic migration backup.
- Apply the complete pending sequence under one application-owned immediate
  transaction. Record each migration in the ledger in the same transaction as
  its schema and data changes. A failure rolls back the complete pending
  sequence.
- Verify the migrated schema, SQLite integrity, and foreign keys before commit.
  Any verification failure is a migration failure.
- Database migration is the first database-affecting startup phase. Process
  application, archival recovery, task-workspace consistency recovery, host-stop
  attempt recovery, board commands, and automation dispatch occur only after a
  current database has opened successfully.
- Surface incompatibility, backup failure, migration failure, and verification
  failure through the existing blocking startup configuration-error model. The
  diagnostic identifies the database, relevant migration when known, recovery
  backup when one exists, and a safe corrective action.
- Retain every released migration and representative released fixture
  indefinitely. No schema-support pruning policy is introduced for this
  single-user product scope.
- Preserve `CoordinationApplication` as the authority and one coordination
  database owner. Migration is database lifecycle infrastructure beneath
  application startup, not a repository abstraction or a second state owner.
- Update the architecture map and backup/restore guidance when the migration
  lifecycle becomes implemented. Record the durable released-schema and
  migration-authority decision in an ADR.

## Testing Decisions

- The primary behavioral seam is real `CoordinationApplication` startup against
  temporary real SQLite databases. Tests observe startup mode, retained
  application projections, database recovery artifacts, and whether runtime
  dispatch occurred; they do not import private migration implementation.
- Fresh-start coverage proves an empty path applies the complete registry,
  records the ledger, produces the expected current-schema snapshot, and starts
  paused.
- Every released schema receives an immutable populated fixture. Upgrade tests
  start that fixture with the newest application and prove migration through all
  missing versions while preserving representative domain data and identities.
- A skipped-release scenario proves a database can traverse several pending
  migrations in one startup without manually running intermediate applications.
- Compatibility scenarios cover current history, an older exact prefix, missing
  ledger/pre-release state, a gap, reordered or altered IDs, an unknown future
  suffix, an unreadable store, and an incomplete or malformed ledger.
- Recovery coverage enables WAL mode, commits representative data that remains
  in WAL, performs an upgrade, independently opens the automatic backup, and
  proves the complete pre-upgrade state is recoverable.
- Failure injection makes a later pending migration fail after earlier pending
  work has executed. The startup seam proves the full pending batch rolled back,
  the original ledger and data remain, the verified backup is available, startup
  is blocked, and no runtime dispatch occurred.
- Verification-failure coverage proves integrity, foreign-key, or expected-schema
  failure blocks startup and rolls back rather than accepting a nominally
  completed migration.
- Startup-order coverage uses representative process application, workspace
  recovery, attempt recovery, and runtime collaborators to prove none can mutate
  or dispatch before migration succeeds.
- Snapshot coverage regenerates the deterministic schema description from a
  freshly migrated database and compares it with the checked-in artifact. It
  includes tables, columns, constraints, indexes, triggers, views, and the
  migration ledger while excluding incidental SQLite formatting or runtime data.
- Backup and diagnostic coverage uses public startup results and independently
  opened SQLite files. Focused lower-level tests are justified only for failure
  injection that cannot be expressed cleanly through startup.
- Existing restart-recovery integration tests provide the primary prior art.
  Existing state relocation and backup/restore tests provide prior art for
  independent database verification and fail-closed startup behavior.
- Every delivery ticket runs typechecking and focused application tests. The
  complete non-browser suite and production build run before completion; browser
  coverage is required only if a user-visible startup or recovery surface
  changes.

## Out of Scope

- Migrating or adopting any pre-release database, including existing internal
  schemas numbered 1 through 21.
- Preserving the user's acknowledged outdated development database through the
  migration-boundary release.
- Downgrading a database to an older application schema.
- Deleting, squashing, or expiring released migrations or fixtures.
- Automatically backing up task worktrees, Git administrative registrations,
  conversation attachment bytes, or the complete project-state root during a
  database schema upgrade.
- Changing task, conversation, activation, attempt, pricing, attachment,
  workspace, process-evolution, or automation semantics except where a future
  migration explicitly preserves a later schema change.
- Adopting an ORM, replacing `node:sqlite`, or making Drizzle a prerequisite.
- A general-purpose migration framework, plugin API, database administration UI,
  downgrade tool, or remote backup service.
- Maintaining compatibility with unreleased development schemas after the
  released migration boundary is established.
- Staging, committing, or pushing repository changes.

## Further Notes

- Issue 42 correctly identified the retained-data safety requirement, but its
  activation condition has now occurred: the framework is being used for real
  work and schema recreation is no longer acceptable after the migration-enabled
  boundary release.
- The prior internal schema integer reached 21 only as a development change
  counter. The released migration chain deliberately restarts at
  `0001_initial_released_schema`; it does not claim support for twenty earlier
  released schemas.
- Issues 85 and 87 established that migration authoring tools do not replace the
  application-owned safety envelope. Their Drizzle reconsideration boundary
  remains intact and does not block this specification.
- The automatic database backup protects the object being mutated by migration.
  The existing complete project-state backup procedure remains the operational
  recovery process for loss or relocation of the database, attachments,
  worktrees, repository binding, and Git registrations as one deployment unit.
- Issue 42 should remain unchanged while ticket decomposition is reviewed. Once
  the approved replacement tickets are published, it can be resolved as
  superseded with links to this specification and those tickets.
