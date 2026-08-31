# Make released migrations the coordination schema authority

Status: accepted

Coordination database compatibility is identified by one application-owned,
ordered ledger of stable migration IDs. The first released identity is
`0001_initial_released_schema`. Fresh databases apply that migration through
the same registry used for every later released upgrade; there is no separate
current-schema initializer.

The initial migration creates the complete coordination schema and its own
ledger inside one immediate transaction. Once applied, a migration ID and its
transition are immutable. The application package version and the former
SQLite `user_version` development counter do not identify database
compatibility.

An existing database is compatible when its ledger is a non-empty exact prefix
of the application's registry. Equal history opens normally; an older released
prefix proceeds through the pending migrations. A database without the ledger
is an unsupported pre-release store. Startup reports a blocking configuration
error and does not delete, adopt, or rewrite its database, WAL, or shared-memory
files. Compatibility inspection uses a temporary copy because opening SQLite
read-only can still change a shared-memory file.

Before changing an older compatible database, startup creates one uniquely
named database-only recovery file beside it through SQLite's online backup
facility. Startup independently opens that copy and verifies its original
ledger, SQLite integrity, and foreign keys, which also proves that committed
pages resident in WAL reached the backup. The complete pending sequence and
ledger writes then run in one immediate transaction. Expected-schema, integrity,
and foreign-key checks occur before commit; a migration or verification failure
rolls back the whole sequence and reports the verified recovery path.

The checked-in `current-schema.sql` snapshot is generated from an in-memory
database created by the complete registry. It describes every application
table, index, trigger, and view for inspection and drift review, but startup
never executes it.

## Consequences

- Released database identity is explicit, ordered, and independent of package
  releases.
- Fresh startup continuously exercises the migration path that future upgrades
  will extend.
- Pre-release development databases are deliberately outside the compatibility
  promise and require a new database path or a supported released backup.
- Future schema changes append migrations; they do not edit the initial
  migration or introduce another executable schema definition.
- Automatic migration backups recover the database at its pre-upgrade history;
  they do not replace an operational backup of attachment bytes, task worktrees,
  repository metadata, and the rest of the bound project-state recovery unit.
