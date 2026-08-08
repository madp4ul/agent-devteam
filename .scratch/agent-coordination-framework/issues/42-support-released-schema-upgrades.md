# 42 — Support Released Schema Upgrades

**What to build:** Once the first release can contain user-retained coordination
state, replace the pre-release database-recreation policy with verified schema
migrations for every supported released schema. Do not implement or retain
migration paths between disposable pre-release schemas.

**Blocked by:** 28 — Prove the First Usable Workflow

**Status:** open

- [ ] The first release records an explicit released schema identity that later
  versions can distinguish from disposable pre-release databases.
- [ ] A schema-changing release provides a documented migration path from every
  supported released schema to the new current schema.
- [ ] Startup creates and verifies a recovery backup before changing retained
  released state, then applies each migration transactionally before any board
  mutation or agent dispatch.
- [ ] A failed migration leaves the original released database recoverable and
  starts in blocking configuration-error mode without agent dispatch or board
  mutation.
- [ ] A database from an unknown future release is never deleted or changed and
  starts in blocking configuration-error mode.
- [ ] Migration tests use representative released-schema fixtures and cover
  successful upgrade, rollback/failure, backup verification, and committed WAL
  data.
- [ ] Backup and restore guidance states which released schemas are supported
  and how to recover from a failed upgrade.
- [ ] Until this ticket is activated by a released schema, current pre-release
  behavior remains simple recreation with no dormant migration implementation.

## Comments

- This ticket preserves the durable-upgrade requirement without making unused
  pre-release migration code part of the current implementation. It becomes
  release work before the first schema-changing release after retained user
  state exists.
