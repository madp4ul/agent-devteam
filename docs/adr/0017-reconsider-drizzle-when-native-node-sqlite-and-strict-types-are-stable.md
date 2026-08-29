# Reconsider Drizzle when native Node SQLite and strict types are stable

Status: accepted

Keep persistence on Node's built-in synchronous `node:sqlite` driver with
project-owned SQL for now. Drizzle is the preferred direction to reconsider
for typed query authoring and migration drafting, but the stable versions
tested in the repository-shaped prototype would permanently replace the
built-in driver with the separate native `better-sqlite3` package and would
require `skipLibCheck` or unrelated optional peer declarations under the
repository's strict TypeScript configuration. Those are maintained-state
costs, not transition costs, and they outweigh the demonstrated typing and
migration-authoring benefits in the current production candidate.

`better-sqlite3` is a package name, not a comparative conclusion about this
repository's present driver. Its own documentation names the older
`node-sqlite3` npm package as the alternative it set out to improve. It is a
mature synchronous SQLite driver and was useful for isolating Drizzle's value
in the prototype, but adopting it here would introduce a second native SQLite
runtime and make Drizzle's driver type part of repository and transaction
boundaries that currently use Node's built-in `DatabaseSync` directly.

## Reconsideration boundary

Do not repeat general persistence-tooling research on a schedule, merely
because Drizzle publishes a release, or because transition capacity becomes
available. Start a fresh production-adoption decision when one stable Drizzle
release satisfies both of these observable conditions:

- Drizzle provides an official, non-preview `node:sqlite` adapter that can use
  the application's existing synchronous `DatabaseSync` connection without a
  permanent `better-sqlite3` dependency or a project-owned compatibility
  adapter.
- That release and its required packages pass this repository's unchanged
  strict TypeScript typecheck without `skipLibCheck` and without installing
  unrelated optional database-driver peers solely to satisfy declarations.

Meeting both conditions triggers the comparison; it does not predetermine
adoption. Evaluate the exact current versions at that time rather than carrying
forward assumptions about the versions tested in ticket 87.

## Evidence required before adoption

Rerun the repository-shaped proof from ticket 87 against the exact candidate.
Adopt Drizzle only if the proof still shows a better maintained state while
preserving all of the following:

- one application-owned synchronous SQLite connection and synchronous command
  and query APIs;
- workflow-owned, visible `BEGIN IMMEDIATE` transaction boundaries across all
  participating persistence modules;
- recognizable emitted SQL, with focused runtime decoders retained for JSON
  and unchecked raw expressions;
- meaningful removal of handwritten row assertions in ordinary queries,
  without obscuring the difficult projections that still need raw SQL;
- one TypeScript authority for the current schema plus reviewable, immutable
  generated migration SQL; and
- the complete application-owned released-schema safety envelope: ordered
  migration identity, verified backup, future-version refusal, transactional
  application, integrity and foreign-key checks, rollback and recovery
  behavior, and representative released fixtures.

Drizzle Kit may draft repetitive SQLite rebuild SQL, but generated migrations
and snapshots are not migration authority. The prototype's generated migration
failed to preserve a declared dependent view around a table rebuild; reviewed
custom SQL and fixture execution were required. Retain project-owned SQL if
the native adapter or strict-type conditions regress, caller-owned transaction
boundaries become indirect, or the repeated proof does not yield a materially
better steady state.

## Consequences

- Future maintainers have a concrete event for reopening the decision instead
  of periodically investigating Drizzle into the blue.
- A native adapter removes the architectural reason to let a framework-driven
  replacement SQLite connection type propagate into application orchestration;
  it does not waive the proof or migration-safety requirements.
- Until both trigger conditions hold and the proof passes, production remains
  on `node:sqlite` and project-owned SQL.
