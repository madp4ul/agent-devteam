# Drizzle persistence and migration prototype

Date: 2026-08-29

## Verdict

The prototype **revises ticket 85 toward Drizzle for both ordinary query
authoring and migration drafting**, while keeping issue 42's released-schema
safety envelope entirely application-owned.

Do not adopt the tested stable packages in production today. Drizzle ORM
0.45.2 has no stable `node:sqlite` export, requires the permanent
`better-sqlite3` 13.0.3 native driver in this proof, and its published
declarations do not pass this repository's strict TypeScript 5.9 settings
without `skipLibCheck`. Treat Drizzle as the preferred future direction once a
stable native adapter and clean strict declarations exist, then rerun this
proof against those exact versions before implementation.

This conclusion ignores all one-time transition effort and any cost attributed
to leaving the code unchanged. It considers only the resulting maintenance
state.

## Prototype

The throwaway evidence lives under
[`spikes/drizzle-persistence-prototype`](../../../spikes/drizzle-persistence-prototype/README.md)
and runs with:

```powershell
pnpm --dir spikes/drizzle-persistence-prototype prototype -- --all
```

The compared versions are:

- Drizzle ORM 0.45.2;
- Drizzle Kit 0.31.10;
- `better-sqlite3` 13.0.3;
- `@types/better-sqlite3` 7.6.13; and
- TypeScript 5.9.3 on Node 24.18.1.

The prototype uses only disposable databases under the operating-system temp
directory. Both paths use the same explicit application-owned migration
envelope and verify committed WAL data through Node's SQLite backup API.

## Query evidence

Both implementations perform the same routine transaction and difficult
projection. The transaction remains visibly caller-owned with `BEGIN
IMMEDIATE`, and both public slices remain synchronous.

For the routine insert, conditional update, and read, Drizzle is materially
better:

- schema columns drive insert types, required values, nullability, and selected
  aliases;
- compile-time probes reject a missing/renamed column, string-for-boolean
  insert, omitted or null required title, and wrong result alias;
- the SQLite boolean maps directly to `boolean`; and
- the routine result needs no handwritten row-shape assertion.

The project-owned SQL baseline needs a trusted row assertion plus runtime shape,
JSON, and SQLite-integer-boolean decoding. Its explicit decoder can fail closed
at runtime, but TypeScript cannot connect that type to the SQL text.

Drizzle's advantage narrows for the repository-shaped projection. Joins,
grouping, aliases, and `count` remain inferred, but `json_extract` and the
conditional `MAX` require two `sql<T>` declarations. Those declarations do no
runtime mapping and can lie after the SQL changes. JSON content also still
needs a project-owned decoder. Drizzle therefore removes many assertions; it
does not eliminate the need for focused runtime decoding at complex SQL seams.

The emitted queries stay recognizable SQL. The builder form is longer than the
equivalent SQL for the difficult projection, but tables, columns, joins, and
most selected result types become navigable TypeScript symbols. Across the
repository's 253 current prepared statements, that is enough steady-state
feedback to justify preferring Drizzle once the production gates are met.

## Migration evidence

The released-like upgrade starts from a populated schema with a foreign-keyed
activation table, partial unique index, dependent aggregate view, trigger, JSON
metadata, and committed WAL content. Version 2 changes `ON DELETE CASCADE` to
`RESTRICT`, adds and backfills a non-null category, and preserves the view,
trigger, index, and data.

Drizzle Kit usefully generated eight repetitive statements covering the SQLite
table rebuild, data copy, foreign-key change, index recreation, and added
column. It also retained TypeScript schemas, four snapshots, and a migration
journal. This is real recurring value: the maintainer changes the desired
schema and reviews a concrete proposed diff instead of authoring every rebuild
statement from memory.

The generator is not the migration authority. The original emitted version-2
migration failed with:

```text
error in view task_activation_summary: no such table: main.activations
```

This occurred even after the view was declared in both Drizzle schemas. Kit
tracked and initially created the view, but did not drop and recreate it around
the referenced-table rebuild. The passing artifact therefore includes two
reviewed manual view statements. The data backfill, trigger recreation, and
released schema identity also remain custom. The original generated SQL is
retained beside the corrected migration as primary evidence.

The corrected Drizzle route required five custom migration responsibilities in
the upgrade, versus twelve conceptual project-owned SQL steps. That reduction
is useful, but only when generated SQL is reviewed and exercised against real
fixtures. Generated `PRAGMA foreign_keys` toggles also cannot supply issue 42's
transaction protocol: inside the application-owned transaction they do not
replace explicit post-migration foreign-key verification.

Both final paths proved:

- backup integrity `ok` with committed WAL content present;
- source integrity `ok` after upgrade;
- zero `foreign_key_check` violations;
- preserved trigger and view behavior;
- refusal of schema version 99 before mutation; and
- rollback to intact version-1 state after an injected late migration failure.

Those guarantees came from the shared application envelope, not Drizzle Kit.

## Permanent artifacts and costs

The Drizzle steady state has one useful TypeScript schema authority, but also
retains migration SQL, a journal, snapshots, configuration, ORM and Kit
versions, and driver/type packages. Triggers and data transforms remain custom
SQL. Generated migration SQL must be reviewed as code and verified against
released fixtures; snapshots must not be mistaken for proof of a safe upgrade.

The tested stable version also imposed two unacceptable production costs:

1. The package has no `drizzle-orm/node-sqlite` export, so this proof permanently
   changes the driver to `better-sqlite3` and adds its native package lifecycle.
2. Without `skipLibCheck`, TypeScript reports missing optional peers and
   declaration incompatibilities across Drizzle's non-SQLite dialect types.
   Weakening the repository's compiler checks is not justified by this proof.

These are ongoing properties after transition, not adoption costs.

## Decision and stopping condition

Keep production on built-in synchronous `node:sqlite` and project-owned SQL for
now. Reconsider adoption when a stable Drizzle release provides first-party
`node:sqlite` support and passes the repository's existing strict typecheck
without `skipLibCheck` or irrelevant optional peer installations. At that
point, rerun the routine query, difficult projection, and corrected
view/trigger migration proof with the exact production candidate.

Adopt only if that rerun preserves:

- one synchronous connection and caller-owned `BEGIN IMMEDIATE`;
- synchronous application commands and queries;
- visible emitted SQL and focused runtime decoders for unchecked expressions;
- one TypeScript current-schema authority plus reviewed immutable migration
  SQL; and
- the complete issue-42 fixture and recovery envelope outside Drizzle Kit.

Stop and retain project-owned SQL if native support remains unstable, strict
declarations remain incompatible, or the adapter prevents caller-owned
transactions. A future adoption must never treat generated SQL or snapshots as
a substitute for released fixtures, backup verification, rollback tests, or
unknown-future refusal.

## Effect on issue 42

Issue 42's requirements and activation timing remain correct. Its later
implementation may use Drizzle Kit to **draft** reviewed migration SQL if the
production gates above are met. The application-owned ordered registry,
released identity, backup, independent verification, transaction, startup
gating, recovery behavior, and fixture matrix remain authoritative regardless
of the drafting tool.
