# 01 — Keep repeated workspace startup failure recoverable

**What to build:** Retrying a task whose starting ref is still invalid returns
to actionable failure instead of leaving a running claim and empty conversation.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Reproduce through application recovery commands in disposable state.
- [x] Repeated failures clear dispatch claims and expose fresh attention.
- [x] Preserve the existing startup diagnostic contract and restart behavior.

## Comments

Live T-0173 has no workspace or thread; its retry claim remains unconsumed.

## Answer

The repeat failure attempted another INSERT into activation_startup_failures,
whose primary key is activation_id. The uniqueness error rolled back the whole
failure transaction, including activation settlement and dispatch-claim cleanup.
The automation pump then paused, retaining a phantom running activation.

Use UPSERT to replace that activation's current startup diagnostic and reopen it
as unresolved. This follows the existing single-current-failure projection and
its timeline UPDATE trigger without a schema change. Attention occurrences and
explicit retry activity remain separate retained records.

Red command: `node --experimental-strip-types --test --test-name-pattern='retrying an unresolved starting ref' test/application/activation-recovery.test.ts`.
Initially failed with expected failed / actual running; a diagnostic assertion
then captured UNIQUE constraint failed: activation_startup_failures.activation_id.
After the fix, two successive retries settle with fresh attention, no published
attempts, no active runs, and one current startup-failure timeline record.

Validation: activation-recovery and restart-recovery suites, 14 tests passed.
Follow-up delivery: [02-correct-starting-ref.md](02-correct-starting-ref.md).
