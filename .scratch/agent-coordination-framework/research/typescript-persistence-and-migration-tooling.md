# TypeScript persistence and migration tooling

Research checked 2026-08-29 against the repository and primary documentation.

## Decision frame

This comparison deliberately ignores:

- the one-time effort of moving the current code to another approach; and
- any cost attributed merely to choosing not to move.

The decision is about the codebase after a transition is complete: would the
new steady state make persistence easier and safer for an AI maintainer to
understand, change, test, and review? Ongoing runtime dependencies, driver
semantics, supply-chain exposure, generated artifacts, abstraction leakage, and
routine maintenance remain relevant because they continue after transition.

## Recommendation

Keep the synchronous built-in `node:sqlite` driver and project-owned SQL. Do
not adopt a full ORM, Kysely, Drizzle Kit, or another general migration runner
as the persistence authority.

Make two focused improvements instead:

1. For ordinary persistence work, introduce a small project-owned typed
   statement/row-mapping boundary as repeated queries are touched. It should
   keep SQL visible, centralize input/output types and JSON/boolean decoding,
   and optionally perform runtime validation. It must not become a generic
   repository or another state owner.
2. When issue 42 is activated by a retained released schema, implement a
   project-owned ordered migration registry around `node:sqlite`: identify the
   released schema, refuse unknown future schemas, create and independently
   verify a recovery backup, run explicit `from -> to` steps transactionally,
   verify the result, and start normal mutation/dispatch only after success.

The reason is not conversion cost. In the hypothetical fully converted state,
the current alternatives still impose permanent costs that exceed their local
benefit here:

- Kysely's first-party SQLite dialect changes the driver to
  `better-sqlite3`, makes the query surface Promise-shaped, and requires schema
  interfaces or generated types.
- Prisma adds a generated client, schema/config/migration artifacts, an async
  ORM boundary, and a different SQLite adapter while hiding SQL and transaction
  locality that are important in this application.
- Drizzle is the closest conceptual fit, but stable first-party
  `node:sqlite` support is not currently shipped. Depending on its release
  candidate documentation, a custom/proxy adapter, or `better-sqlite3` would be
  an ongoing support burden. Drizzle Kit's schema snapshots and migration log
  also do not implement issue 42's application-specific backup and startup
  guarantees.

Prototype Drizzle now with a currently supported driver so its steady-state
query and migration ergonomics are tested rather than inferred. Production
adoption should still require stable first-party `node:sqlite` support, unless
the proof shows that carrying `better-sqlite3` is itself a worthwhile permanent
tradeoff. The stopping condition is clear: if the prototype does not remove
meaningful row assertions and column-drift risk while preserving explicit
complex SQL and caller-owned synchronous transactions without opaque
generated-artifact drift, retain project-owned SQL.

## Current persistence shape and actual friction

The architecture is intentionally unlike an active-record application:

- `CoordinationApplication` is the authoritative command/query boundary.
- Each command workflow owns its SQLite transaction.
- Focused internal modules share that connection and participate in the
  caller's transaction; they neither open independent transactions nor become
  additional state owners.

That rule is stated in [`docs/architecture.md`](../../../docs/architecture.md)
and ADR 0009. `CoordinationDatabase.transaction` expresses it directly with a
synchronous `BEGIN IMMEDIATE`, callback, `COMMIT`, and `ROLLBACK` around one
`DatabaseSync` connection.

The present schema is version 21 and contains 28 tables, two views, three
partial unique indexes, and one trigger in one large initializer. Startup uses
`PRAGMA user_version`, structural completeness checks, and the current
pre-release policy of deleting an incompatible database plus its WAL/SHM files.
That deletion policy is intentionally replaced—not extended—when issue 42 is
activated.

Raw SQL is not merely a small CRUD wrapper. Under `src/application/internal`
there are currently 253 `.prepare()` calls across 17 files and 16 explicit
transaction workflows. The largest concentrations are the automation state,
task command, task projection, process state, and task archive modules. Complex
projection queries, partial indexes, views, the activation-order trigger,
compare-and-update commands, and task/workspace relocation are often clearest
as SQL close to the workflow.

The concrete weakness is result typing. The same directory contains about 119
manual row-shape assertions. `node:sqlite` returns
`Record<string, SQLOutputValue>` rather than deriving a result type from SQL,
so a renamed alias, nullable join, changed JSON column, or selected-column edit
does not automatically invalidate the TypeScript assertion. This is real
maintenance friction. It does not follow that the transaction and domain model
should be replaced.

Tests already exercise persistence through the application, use direct SQLite
only to construct or corrupt fixtures, and cover restart/recreation, relocation,
transactional command behavior, and complete state-root backup/restore. Issue
42 correctly asks for an additional released-schema fixture matrix rather than
mocking a database abstraction.

## Option comparison in the fully transitioned state

| Approach | Query and type feedback | SQL and domain mapping | Sync driver and transaction locality | Released-schema migration fit | Permanent cost | Assessment |
| --- | --- | --- | --- | --- | --- | --- |
| Project-owned `node:sqlite` SQL | Weak SQL-derived types; a local statement/decoder boundary can localize assertions and add runtime checks | Best visibility and direct control; complex queries remain natural | Exact fit: one synchronous connection and explicit `BEGIN IMMEDIATE` owned by workflows | Excellent when paired with a small explicit migration registry and built-in backup API | Manual schema/query discipline and project-owned helpers | **Recommend** |
| Kysely typed query builder | Excellent inference for tables, columns, aliases, joins, CTEs, and selected result shapes | SQL-like builder with raw-SQL escape hatches | First-party SQLite dialect uses `better-sqlite3`; driver APIs are Promise-shaped | Has a migrator, but issue 42 still needs project-owned backup, startup gating, fixture policy, and verification | Runtime/query-builder dependency, native driver, async surface, maintained schema types or generated types | Reject for this runtime |
| Drizzle typed SQL/ORM layer | Strong schema-driven inference for builder queries; raw `sql<T>` is only an unchecked compile-time hint | Thin and SQL-oriented; good escape hatch in principle | The documented `node:sqlite` adapter is not shipped in the stable package today; existing drivers or a proxy change the steady-state support boundary | Kit can generate/apply SQL migrations, but snapshots/logs do not supply the product guarantees | Runtime and Kit versions, schema/snapshot/journal artifacts, adapter maturity and drift | Revisit after stable native support |
| Prisma full ORM | Strong generated client for modeled operations | Highest abstraction distance; raw/TypedSQL becomes a second path for SQL-shaped workflows | Official SQLite setup uses `@prisma/adapter-better-sqlite3` and an async generated client | Prisma Migrate is useful general machinery but cannot own the framework's backup/recovery/startup policy | Generated client, schema/config/history, adapter/runtime dependencies, regeneration and ORM conventions | Reject |
| Migration toolkit only | Can organize history and checksums; does not improve ordinary query result typing | Migration SQL can remain visible | Compatibility varies; generic runners commonly add their own transaction/log conventions | Helps bookkeeping, not the required recovery protocol | Another migration state model, tool upgrades, generated/log artifacts | Do not add unless a later concrete need exceeds a small local registry |

## Candidate evidence

### Built-in `node:sqlite` baseline

Node documents that every `DatabaseSync` API executes synchronously and exposes
prepared statements directly. Node 24 also provides `backup(sourceDb, path)`,
which wraps SQLite's online backup API and accepts an open `DatabaseSync`
connection ([Node SQLite API](https://nodejs.org/api/sqlite.html)). SQLite says
the online backup result is a consistent snapshot and avoids the corruption
hazards of naively copying a live database file
([SQLite Online Backup API](https://sqlite.org/backup.html)). This is a strong
fit for issue 42's committed-WAL backup requirement; the implementation still
must verify the destination independently before touching the source.

`PRAGMA user_version` is explicitly an application-owned integer that SQLite
does not interpret
([SQLite PRAGMA documentation](https://www.sqlite.org/pragma.html#pragma_user_version)).
It is sufficient as the compact on-disk released-schema identity if the
application also distinguishes disposable pre-release identities and treats an
unknown larger released version as immutable.

SQLite documents that `BEGIN IMMEDIATE` starts the write transaction
immediately, and that transactions do not nest; savepoints are the nested
mechanism ([SQLite transactions](https://www.sqlite.org/lang_transaction.html)).
Keeping this primitive visible preserves the current workflow-owned transaction
rule more directly than a library-owned unit of work.

The baseline's weakness is not runtime safety of parameter binding: prepared
statements already provide that. It is the gap between a raw SQL result and its
manually asserted TypeScript shape. The smallest useful local boundary is
therefore a typed statement plus explicit decoder, not a generic repository.
For example, JSON columns can be parsed at one boundary and SQLite integer
booleans can become booleans there instead of being repeatedly asserted and
converted in workflow code.

### Kysely

Kysely is a serious typed query builder. Its official introduction states that
it tracks visible tables/columns and infers selected result columns, aliases,
joins, subqueries, and CTEs, while retaining a raw SQL escape hatch
([Kysely introduction](https://kysely.dev/docs/intro),
[raw SQL recipe](https://kysely.dev/docs/recipes/raw-sql)). Those capabilities
would reduce many current row assertions after a complete conversion.

The permanent mismatch is execution. Kysely's official `SqliteDialect` uses
`better-sqlite3`, and the dialect/driver interfaces expose Promise-based
connection and transaction operations
([Kysely SQLite dialect](https://kysely-org.github.io/kysely-apidoc/classes/SqliteDialect.html),
[SQLite driver](https://kysely-org.github.io/kysely-apidoc/classes/SqliteDriver.html)).
A fully transitioned codebase would therefore either:

- carry `better-sqlite3` and its native-package lifecycle instead of the
  built-in Node driver; or
- own and maintain a custom `node:sqlite` Kysely dialect while retaining an
  async-shaped query API over synchronous execution.

That is a continuing runtime and maintenance cost. It also makes it easier to
accidentally stretch a transaction across `await` boundaries, which is the
wrong default for this single synchronous connection and its local command
workflows. Kysely's query inference is genuinely better than raw SQL, but not
enough here to justify those steady-state semantics.

### Drizzle

Drizzle is the best conceptual query-layer candidate because it is a thin,
schema-driven SQL layer, supports synchronous SQLite-style query methods, and
allows parameterized SQL fragments. Its SQL documentation also makes the
limit explicit: `sql<T>` performs no runtime mapping and is only a compile-time
hint, so complex raw projections still need a trustworthy decoder or assertion
([Drizzle SQL template](https://orm.drizzle.team/docs/sql)).

Its current `node:sqlite` status prevents a recommendation now. The official
guide claims native support and tells users to install release-candidate
packages ([Drizzle `node:sqlite` guide](https://orm.drizzle.team/docs/sqlite/connect-node-sqlite)),
but the corresponding upstream pull request to add
`drizzle-orm/node-sqlite` remains open
([drizzle-orm PR 4346](https://github.com/drizzle-team/drizzle-orm/pull/4346)).
The project's documentation repository also has an open issue recording that
the documented export is absent
([drizzle-orm-docs issue 681](https://github.com/drizzle-team/drizzle-orm-docs/issues/681)).
The repository package manifest still lists `better-sqlite3`, `sqlite3`, and
other drivers but no `node:sqlite` package surface
([Drizzle package manifest](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/package.json)).

This is not a transition-cost objection. In the post-transition state, using a
release candidate, proxy/community adapter, or second native SQLite driver
would remain an extra compatibility and upgrade responsibility. Once stable
first-party support exists, that cost may disappear and the type feedback could
be worth reassessing.

Drizzle Kit is a separate decision. It can treat a TypeScript schema as source,
generate SQL migrations and schema snapshots, or use custom SQL migrations
([migration fundamentals](https://orm.drizzle.team/docs/migrations)). Current
custom migrations are SQL files; the documented JavaScript/TypeScript custom
migration capability is future work
([custom migrations](https://orm.drizzle.team/docs/kit-custom-migrations)).
That is insufficient for migrations that must coordinate a verified backup,
application configuration-error state, startup dispatch gating, filesystem
recovery information, and representative released fixtures. Its generated
snapshots and journal would be additional long-lived artifacts to review
alongside the schema actually enforced by SQLite.

There is also current evidence against delegating released-data safety to the
generator: an open March 2026 report in the upstream repository demonstrates a
generated SQLite table-rebuild migration with `ON DELETE CASCADE` foreign keys
and traces how the migrator's transaction makes the generated
`PRAGMA foreign_keys = OFF` ineffective, allowing child rows to be deleted
([drizzle-orm issue 5782](https://github.com/drizzle-team/drizzle-orm/issues/5782)).
This is a reported upstream defect rather than a confirmed general statement
about every Drizzle migration. It nevertheless illustrates why issue 42 must
review the emitted SQL, test real released fixtures, and own backup/recovery
even if a future schema tool is used to draft migrations.

### Prisma

Prisma represents the full-ORM option. Its official SQLite onboarding creates
a Prisma schema/config, migration history, generated type-safe client, and uses
the `better-sqlite3` driver adapter
([Prisma SQLite onboarding](https://docs.prisma.io/docs/prisma-orm/add-to-existing-project/sqlite)).
Prisma describes its client as generated and type-safe
([Prisma Client introduction](https://docs.prisma.io/docs/orm/prisma-client/setup-and-configuration/introduction)).
It supports interactive transactions and raw queries, including raw operations
inside transactions
([Prisma transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions),
[raw SQL](https://docs.prisma.io/docs/orm/prisma-client/using-raw-sql)).

Those are useful capabilities for a conventional data-access application, but
the steady-state model is wrong here. The framework would permanently carry a
generated client and schema/migration toolchain, change drivers, make the
synchronous core async, and split persistence expression between model APIs
and raw SQL for the current projection/trigger/conditional-update work. It
would also invite entity/repository abstractions that compete with
`CoordinationApplication` even though the ORM cannot encode the workflow's
activity, notification, activation, idempotency, and transaction-order rules.

## Query authoring, schema evolution, and data migration are separate

### Query authoring

Keep explicit SQL for joins, projections, compare-and-update commands, partial
indexes, views, triggers, and relocation. Add a focused typed statement/decoder
only where it removes repeated assertions or parsing. Prefer one named row type
and one mapping function beside the query over a broad database-shaped API.
Tests should continue to exercise the real SQLite statement through the
application boundary.

### Current-schema definition

Move the giant initializer toward a discoverable project-owned current-schema
module when ordinary work next changes it. Avoid duplicating a hand-written DDL
source with generated ORM schema snapshots unless a future typed-tool proof
shows a clear continuing benefit. Schema completeness should be verified from a
fresh database by tests rather than maintained as an ever-growing second
hand-written checklist alone.

### Released-schema evolution and data transforms

SQLite supports only a limited direct `ALTER TABLE` subset. Its official
guidance specifies a careful 12-step table-rebuild procedure for arbitrary
changes, including recreating indexes/triggers/views and running
`foreign_key_check`
([SQLite ALTER TABLE](https://sqlite.org/lang_altertable.html)). Real data
transforms therefore need reviewed SQL and sometimes TypeScript logic whether
or not a schema-diff tool drafts the DDL.

The migration registry should contain an immutable ordered chain. Each entry
should name the exact released `from` and `to` identity and execute against the
startup-owned connection. The runner should fail on gaps, duplicate edges,
unknown future versions, or a database that does not match the claimed source
fixture. It must not expose migrations as ordinary store operations.

### Backup, rollback, and startup ordering

Backup is outside the schema transaction because it must exist and be verified
before the source is changed. A suitable issue-42 startup order is:

1. Open/inspect retained state without normal mutations or agent dispatch.
2. Classify missing, disposable pre-release, known released, and unknown future
   schema identities.
3. For a known older released schema, create a versioned recovery backup using
   Node's SQLite backup API.
4. Open that backup independently, check its schema identity, and require
   `PRAGMA integrity_check = ok`; use `foreign_key_check` where applicable.
5. Apply the complete ordered migration chain under an explicit write
   transaction. Roll back on any thrown error.
6. Verify the resulting schema identity, required schema objects, integrity,
   foreign keys, and any migration-specific invariants.
7. Only then let `CoordinationApplication` enter paused normal operation and
   permit board mutation or agent dispatch.

SQLite notes that `integrity_check` does not report foreign-key errors, so the
two checks are complementary
([SQLite PRAGMAs](https://www.sqlite.org/pragma.html#pragma_integrity_check)).
Tests must include committed WAL data because the product guarantee concerns
the logical database snapshot, not just the main file.

## Repository-shaped proof before any typed-query adoption

Compare Drizzle with the local typed-statement baseline using deliberately
different query slices and a migration slice. A currently supported driver is
sufficient to measure ergonomics; driver choice remains a separate production
gate:

1. A routine CRUD/conditional-update slice, where schema-driven inference
   should remove nearly all manual row assertions.
2. A complex projection slice with joins, nullable columns, JSON fields,
   aliases, and an existing raw-SQL escape hatch.
3. A populated released-like schema upgrade with a data transform and SQLite
   table rebuild, comparing generated/custom Drizzle migration work with
   reviewed project-owned SQL inside the same application-owned safety envelope.

The proof passes only if all of these remain true in the resulting steady
state:

- the same built-in `DatabaseSync` connection is used;
- public command/query APIs do not become async merely for the persistence
  tool;
- the command workflow still owns `BEGIN IMMEDIATE` and the focused modules
  participate on that connection;
- SQL for the complex projection remains locally visible and reviewable;
- inferred output types remove meaningful assertions without replacing them
  with unchecked `sql<T>` claims;
- schema and generated artifacts have one clear authority and a drift test;
- views, partial indexes, triggers, and direct SQL remain supported without a
  second persistence model; and
- issue 42's backup and migration orchestration remains project-owned.

If any of those conditions fails, stop. Continued raw SQL plus focused typed
decoders is the intended no-change outcome, not a temporary compromise.

## Effect on issue 42

Issue 42 should be refined before activation, but its product requirements and
timing are correct. Add implementation detail that makes the following explicit:

- a project-owned ordered released-schema registry with immutable `from` and
  `to` identities;
- no dormant paths for disposable pre-release schema versions;
- Node's SQLite online-backup API (or an equivalently proven logical snapshot),
  followed by independent backup verification;
- backup completion before the source migration transaction;
- explicit refusal of unknown future released identities without writes;
- startup ownership and gating before board mutation or agent dispatch;
- per-step/data invariants plus final `integrity_check` and
  `foreign_key_check` where relevant;
- representative released fixtures for every supported source version,
  successful multi-step upgrades, injected rollback failures, verified backup
  recovery, and committed WAL content; and
- documented recovery paths and supported released-version range.

No prerequisite ORM or migration-tool ticket is justified. The smallest later
implementation split, once a released schema activates issue 42, is one ticket
for released identity and startup classification, one for backup/verification,
and one for the first real migration plus its released fixtures. Until then,
retain the current simple pre-release recreation policy exactly as issue 42
requires.
