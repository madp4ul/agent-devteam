# 87 — Prototype Drizzle Persistence and Migration Ergonomics

**Type:** prototype

**What to decide:** In a representative fully transitioned slice of this
repository, would Drizzle make both ordinary persistence work and released
SQLite schema changes easier and safer for the AI maintainer than visible
project-owned SQL plus focused typed row decoders?

**Blocked by:** None

**Informed by:**
[85 — Evaluate TypeScript Persistence and Migration Tooling](./85-evaluate-typescript-persistence-tooling.md)

**Status:** resolved

## Decision frame

Ignore the one-time effort of adopting Drizzle, changing existing code, or
leaving the current code unchanged. Judge only the resulting steady state:
future query and schema edits, type feedback, SQL reviewability, migration
authoring, transaction locality, artifact drift, testing, driver/runtime
semantics, and ongoing dependency maintenance.

This is throwaway evidence, not a production persistence refactor and not an
implementation of issue 42. A favorable result may revise ticket 85's
recommendation; an unfavorable result should close the question without
leaving prototype abstractions in production.

## Prototype

Create one clearly marked throwaway prototype under the repository's `spikes/`
convention, runnable with one documented `pnpm` command and using only a
scratch database with an unmistakable disposable name. Pin and report the
exact Drizzle ORM, Drizzle Kit, adapter, and SQLite driver versions used. Do
not build or maintain a custom `node:sqlite` adapter merely to make the proof
pass; if stable native support is unavailable, use the supported
`better-sqlite3` path and evaluate its ongoing steady-state consequences
separately from the query and migration ergonomics.

Implement the same representative behavior twice—once with the smallest
project-owned SQL/typed-decoder baseline and once with Drizzle:

1. A routine command slice with an insert, a conditional update, a typed read,
   JSON and SQLite-integer boolean decoding, and participation in a
   caller-owned synchronous `BEGIN IMMEDIATE` transaction.
2. A difficult projection shaped after the current task overview or
   conversation-cost queries: joins, a nullable outer-join result, aliases,
   aggregation or correlated subquery, a JSON expression, and an explicit raw
   SQL escape hatch where the builder cannot express the query clearly.
3. A released-like schema upgrade from a populated old fixture to a new
   fixture. It must include a data backfill or transform and a SQLite table
   rebuild involving foreign keys plus a dependent view, trigger, or partial
   index. Compare reviewed project-owned migration SQL with Drizzle Kit's
   generated/custom migration workflow and retained schema/history artifacts.

For the migration slice, wrap both approaches in the same minimal simulation
of issue 42's application-owned safety envelope: known source identity,
unknown-future refusal, backup before mutation, transactional application,
post-upgrade integrity and foreign-key checks, and verification of preserved
fixture data. The purpose is to observe exactly what Drizzle removes from that
work and what remains product-owned, not to build the production runner.

## Evidence to capture

- Demonstrate the compile-time response to a renamed column, wrong inserted
  value, changed nullability, and changed selected alias in both approaches.
- Count and identify any remaining handwritten result assertions, `sql<T>`
  hints, runtime decoders, duplicated schema declarations, generated snapshots,
  journals, and configuration artifacts.
- Show the emitted SQL for the complex query and migration. Assess whether an
  AI maintainer can locate the authoritative schema, understand a change, and
  review preservation of constraints, data, views, indexes, and triggers
  without reconstructing hidden generator behavior.
- Confirm whether application command/query APIs can remain synchronous and
  whether the command workflow visibly owns `BEGIN IMMEDIATE` on one
  connection. Record any adapter-owned transaction or Promise boundary.
- Separate Drizzle ORM's query-layer value from Drizzle Kit's migration-layer
  value. Do not credit the toolkit for backup, startup gating, future-version
  refusal, fixture policy, or recovery behavior that the application still
  owns.
- Compare the routine change workflow after transition: schema edit, query
  edit, migration generation or authoring, artifact review, typecheck, fixture
  upgrade, and drift detection.

## Outcome

Append a concise verdict here and link a prototype report containing commands,
observations, emitted SQL, artifact inventory, and the exact retained benefits
and costs. State whether the result confirms ticket 85, revises it toward
Drizzle for queries only, or revises it toward Drizzle for both query authoring
and migration drafting while keeping issue 42's safety envelope application-owned.

Do not merge prototype code into production. Leave its artifacts unstaged for
the user to capture on a throwaway branch under the repository's Git ownership
rules, and leave the intended main-line outcome as documentation or separately
specified implementation tickets only.

## Acceptance criteria

- [x] The proof compares equivalent raw-SQL/decoder and Drizzle implementations
  of both a routine command and a difficult real-repository-shaped projection.
- [x] The proof performs an equivalent nontrivial populated-fixture schema
  upgrade through project-owned SQL and Drizzle Kit and identifies precisely
  which migration work the toolkit eliminates, generates, or leaves manual.
- [x] Compile-time feedback, runtime mapping, SQL visibility, synchronous
  transaction ownership, schema authority, generated artifacts, and ongoing
  driver/dependency costs are demonstrated rather than inferred from examples.
- [x] Backup, rollback, unknown-future refusal, integrity/foreign-key checks,
  released fixtures, and startup gating remain explicitly evaluated as
  application guarantees outside the migration generator.
- [x] The conclusion ignores adoption cost, gives a clear recommendation and
  stopping condition, and states whether ticket 85 or issue 42 should change.

## Answer

The prototype revises ticket 85 toward Drizzle for both ordinary query
authoring and migration drafting, while keeping issue 42's complete safety
envelope application-owned. The full evidence, emitted SQL, artifact inventory,
commands, and stopping condition are in
[Drizzle Persistence and Migration Prototype](../research/drizzle-persistence-prototype.md).

For routine work, Drizzle inferred schema columns, insert values, nullability,
aliases, joins, and results, removed the handwritten row assertion, and mapped
the SQLite boolean while preserving a visible caller-owned synchronous `BEGIN
IMMEDIATE`. The difficult projection still required two unchecked `sql<T>`
claims for JSON extraction and a conditional aggregate plus a project-owned
JSON decoder. Drizzle reduces the unsafe surface; it does not eliminate focused
runtime decoding or make complex SQL intrinsically clearer.

Drizzle Kit generated the repetitive SQLite table rebuild, data copy,
foreign-key change, partial-index recreation, and added column. The first fair
generated migration nevertheless failed against a dependent view even though
that view was declared in both Drizzle schemas. The corrected proof needed
reviewed `DROP VIEW`/`CREATE VIEW` statements, a custom data backfill, trigger
recreation, and application-owned schema identity. Both approaches then proved
verified backup of committed WAL data, transactional rollback after an
injected late failure, future-schema refusal, integrity and foreign-key checks,
and preserved data/view/trigger behavior. Those guarantees came from the
shared application envelope, not Kit.

Do not adopt the tested stable packages now. Drizzle ORM 0.45.2 has no stable
`node:sqlite` export, so the proof carries `better-sqlite3` 13.0.3 permanently,
and its declarations do not pass this repository's strict TypeScript 5.9
settings without `skipLibCheck`. Re-run this proof when a stable first-party
native adapter and clean strict declarations exist. Adopt only if the exact
candidate preserves synchronous APIs, one connection, workflow-owned
transactions, visible SQL, focused decoders, and reviewed immutable migrations.
Otherwise stop and retain project-owned SQL.

Issue 42 needs no product-requirement or timing change. If the production gates
are later met, Drizzle Kit may draft its reviewed migration SQL; the ordered
registry, released identity, backup, verification, startup gating, rollback,
recovery behavior, and released fixtures remain application-owned.
