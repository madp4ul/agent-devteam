# 42 — Support Released Schema Upgrades

**What to build:** Once the first release can contain user-retained coordination
state, replace the pre-release database-recreation policy with verified schema
migrations for every supported released schema. Do not implement or retain
migration paths between disposable pre-release schemas.

**Blocked by:** 28 — Prove the First Usable Workflow

**Status:** resolved

- [x] The first release records an explicit released schema identity that later
  versions can distinguish from disposable pre-release databases.
- [x] A schema-changing release provides a documented migration path from every
  supported released schema to the new current schema.
- [x] Startup creates and verifies a recovery backup before changing retained
  released state, then applies each migration transactionally before any board
  mutation or agent dispatch.
- [x] A failed migration leaves the original released database recoverable and
  starts in blocking configuration-error mode without agent dispatch or board
  mutation.
- [x] A database from an unknown future release is never deleted or changed and
  starts in blocking configuration-error mode.
- [x] Migration tests use representative released-schema fixtures and cover
  successful upgrade, rollback/failure, backup verification, and committed WAL
  data.
- [x] Backup and restore guidance states which released schemas are supported
  and how to recover from a failed upgrade.
- [x] Until this ticket is activated by a released schema, current pre-release
  behavior remains simple recreation with no dormant migration implementation.

## Comments

- This ticket preserves the durable-upgrade requirement without making unused
  pre-release migration code part of the current implementation. It becomes
  release work before the first schema-changing release after retained user
  state exists.

## Answer

Delivered through the [Released Schema Migrations specification](../../released-schema-migrations/spec.md),
[ticket 01 — Establish the Released Migration Baseline](../../released-schema-migrations/issues/01-establish-released-migration-baseline.md),
and [ticket 02 — Upgrade Released Databases Safely](../../released-schema-migrations/issues/02-upgrade-released-databases-safely.md).

Released databases now have one immutable exact-prefix migration authority,
indefinite forward support, verified SQLite online recovery backups that include
committed WAL data, one atomic pending-migration batch, precommit schema and
relational verification, fail-closed downgrade/divergence handling, actionable
recovery diagnostics, retained-data fixtures, and a startup gate ahead of
coordination recovery, mutation, and dispatch.
