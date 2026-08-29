# 85 — Evaluate TypeScript Persistence and Migration Tooling

**Type:** research

**What to decide:** Determine whether an ORM, typed query builder,
schema/migration toolkit, or better project-owned raw-SQL boundary would make
the SQLite persistence code and future released-schema upgrades easier and
safer for this project's AI maintainer to understand, change, test, and review.

**Blocked by:** None

**Status:** resolved

## Maintainer decision

The agent doing this research is also the intended long-term maintainer and the
likely implementer of its recommendation. Optimize for that agent's effective
work in this repository: explicit state ownership, local reasoning, schema/query
discoverability, type feedback, migration safety, and low-risk edits. Do not
choose an ORM merely because Entity Framework is productive in .NET or because
the user raised the idea. A migration-only tool, query builder, focused local
abstraction, or continued raw SQL is an equally valid outcome when it serves
this codebase better.

## Relationship to issue 42

[Issue 42 — Support Released Schema Upgrades](./42-support-released-schema-upgrades.md)
owns the product requirement for versioned, verified, transactional upgrades
of user-retained databases, recovery backups, unknown-future-schema refusal,
and representative released-schema fixtures. This research must evaluate how
each option would implement those guarantees, but must not weaken them, start
pre-release migration machinery prematurely, or silently replace issue 42.
Its recommendation should say whether issue 42 needs refinement or prerequisite
implementation tickets before it is activated by a released schema.

## Investigation

- Map the current SQLite schema initialization, transaction ownership, focused
  persistence stores, raw queries, row-to-domain mapping, test fixtures, backup
  and recovery behavior, and any places where direct SQL is intentionally the
  clearest expression of a workflow.
- Identify concrete maintenance failures or friction rather than assuming raw
  SQL is intrinsically too complex. Separate schema evolution, query authoring,
  result typing, domain mapping, transaction composition, and test setup because
  one tool need not solve all of them.
- Compare the current approach with serious TypeScript options in distinct
  categories: full ORM, typed query builder, migration/schema toolkit, and
  project-owned SQL helpers or generated types. Include a no-new-dependency
  baseline.
- Evaluate candidates against the current Node.js `node:sqlite` synchronous
  runtime and SQLite features, TypeScript inference, explicit SQL visibility,
  complex-query and escape-hatch ergonomics, transaction locality, migrations
  from real released versions, backup/rollback integration, fixture creation,
  generated artifacts, runtime and supply-chain cost, maintenance activity, and
  ease of incremental adoption.
- Determine whether a candidate would force a database driver or async-model
  change and whether that cost improves the system rather than merely matching
  an ecosystem convention.
- Preserve the architectural rules that `CoordinationApplication` is the
  authority and each command workflow owns its transaction. Do not introduce a
  generic repository layer or active-record model that hides workflow
  invariants or creates another state owner.
- Use primary sources and repository-shaped proofs for the few strongest
  candidates. Do not implement a production migration in this ticket.

## Expected result

Write a cited research note under the effort's `research/` directory and append
the answer here. Recommend a concrete persistence strategy, including “keep raw
SQL,” and explain why it best supports this repository's AI maintainer. Separate
the query-authoring decision from the released-schema migration decision, state
the dependency and driver implications, and propose only the smallest justified
follow-up scope for issue 42 and ordinary persistence work.

## Acceptance criteria

- [x] Claims about candidate tools, SQLite support, TypeScript behavior, and
  migration guarantees cite primary documentation or source.
- [x] The recommendation follows an explicit comparison rooted in current
  repository queries and workflows rather than analogy to Entity Framework.
- [x] Query ergonomics, schema evolution, data migration, recovery backup,
  transaction ownership, and tests are evaluated separately.
- [x] Compatibility with issue 42's released-data guarantees and activation
  timing is explicit.
- [x] Any proposed dependency or driver change demonstrates enough maintainer
  benefit to pay for its abstraction, generated code, runtime, and migration
  costs; otherwise the result recommends the smallest local improvement.
- [x] The result states whether issue 42 should be amended and gives a clear
  no-change stopping condition.

## Answer

Keep the built-in synchronous `node:sqlite` driver and project-owned, locally
visible SQL. Add only a focused typed statement and row-decoding boundary as
ordinary queries are touched; do not add a generic repository, full ORM,
typed query builder, Drizzle Kit, or general migration runner now. The full
repository analysis and primary-source comparison are in
[TypeScript Persistence and Migration Tooling](../research/typescript-persistence-and-migration-tooling.md).

This decision deliberately ignores both the one-time cost of transitioning and
any cost attributed merely to not transitioning. In the hypothetical fully
transitioned state, the alternatives still leave permanent disadvantages for
this codebase. Kysely brings a `better-sqlite3` driver and Promise-shaped query
surface; Prisma brings an async generated-client and ORM model while complex
work still needs raw SQL; and Drizzle's closest-fit native `node:sqlite` adapter
is currently documented only through release-candidate guidance while the
corresponding upstream adapter remains unshipped. Their type inference is real,
but none currently improves the steady state enough to justify a second driver,
async transaction surface, generated artifacts, or opaque schema/query model.

The concrete current weakness is narrower: approximately 253 prepared
statements across 17 persistence files depend on roughly 119 handwritten row
shape assertions. Keep direct SQL for joins, projections, conditional updates,
views, partial indexes, triggers, and relocation, while centralizing a query's
input/output types and JSON/boolean decoding beside that query. As the current
schema next changes, extract its large initializer into a discoverable
project-owned schema module and replace the growing hand-maintained structural
checklist with fresh-database schema verification tests.

Issue 42 remains the owner of released-schema safety and should be refined when
activated, without a prerequisite ORM ticket. Implement an application-owned
ordered migration registry with immutable `from -> to` released identities,
unknown-future refusal, startup gating, Node's SQLite online backup API,
independent backup verification, explicit transactional migration steps,
post-migration integrity and foreign-key checks, and representative released
fixtures including committed WAL data and injected rollback failure. Until a
released schema activates it, retain today's disposable pre-release recreation
policy and add no dormant migration paths.

Prototype Drizzle now, using a currently supported driver to isolate its query
and migration ergonomics. Production adoption must still show that routine and
complex query slices lose meaningful row assertions and column-drift risk while
retaining synchronous public APIs, workflow-owned `BEGIN IMMEDIATE`, explicit
complex SQL, and one authoritative schema artifact. It must also have stable
first-party `node:sqlite` support or prove that carrying `better-sqlite3` is a
worthwhile permanent tradeoff. Stop and retain project-owned SQL if any of
those conditions fails.

[Ticket 87 — Prototype Drizzle Persistence and Migration Ergonomics](./87-prototype-drizzle-persistence-migrations.md)
owns that follow-up proof, including a populated-fixture schema upgrade so the
steady-state migration-authoring benefit is tested alongside query ergonomics.

**Follow-up result:** The prototype found enough steady-state benefit to prefer
Drizzle as the future direction for both typed query authoring and migration
drafting. It also confirmed that production must wait: stable ORM 0.45.2 has no
native `node:sqlite` export and requires `skipLibCheck` under this repository's
strict TypeScript settings. Kit's generated table rebuild also failed against
its own modeled dependent view until reviewed SQL corrected it, so issue 42's
application-owned safety envelope remains mandatory. See the
[prototype report](../research/drizzle-persistence-prototype.md).
