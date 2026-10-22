# Avoid the inspection copy on provably safe ordinary database startup

Type: task
Status: open
Blocked by: none

## Scheduling constraint

Deferred at the user's request on 2026-10-21. The framework is running against
the actual project. This ticket authorizes documentation only in the current
session; do not implement, restart the host, or alter its database now. Reconfirm
the operational window when this work is taken up later.

## Problem and evidence

Every startup of an existing database calls `inspectExistingMigrationHistory`
before it knows whether migrations are pending. It copies the database and any
`-wal`, `-shm`, and `-journal` files into a disposable directory, reads the
migration ledger there, then removes the copy. A separate retained pre-upgrade
backup is created only when migrations are actually pending.

The Idle Games database measured 3,455,438,848 bytes (3.46 GB / 3.22 GiB) on
2026-10-21. No sidecars were present when inspected. Its file-header read/write
versions were both 1, consistent with rollback-journal format. Production code
does not explicitly enable WAL. Transactions use BEGIN IMMEDIATE / COMMIT /
ROLLBACK; normal CLI shutdown waits for automation idle and closes SQLite.
Abrupt termination can nevertheless leave a hot rollback journal. Existing tests
exercise recovery of such a journal, so that case is relevant to this framework.
The measurement is historical evidence, not a size or mode invariant.

Discovered while investigating [task 156 reconnect failures](../../codex-reconnect-diagnostics/issues/01-reconnect-continuation.md).
The reconnect fix added no migration, but its deployment still incurred the
full inspection-copy cost.

## Intended outcome

Add a fast path that avoids copying the database on ordinary, current-schema
startup only when its safety conditions can be positively established. Keep the
existing disposable-copy inspection/recovery path for cases that cannot qualify.
Do not assume that absence of sidecar files alone proves the database is clean,
compatible, or safe to open without writes.

## Safety and implementation investigation

Before coding, read `docs/architecture.md`, ADR 0018 and the existing migration
startup/recovery tests. Establish and document the exact eligibility predicate
and fallback boundary using the actual bundled SQLite/Node driver behavior.

Investigate direct read-only ledger inspection under the project-state operation
guard and appropriate SQLite locking. Prove that the selected mechanism cannot
recover or modify retained files before compatibility is accepted. Account for
sidecar appearance/disappearance between checks and opening SQLite, unexpected
WAL mode, hot rollback journals, and connection cleanup before fallback. The
application guard excludes cooperating framework/relocation processes; document
what protects the path against other SQLite connections rather than assuming
the guard excludes all writers. Do not use an immutable-file option to bypass
SQLite locking/recovery checks without proving its preconditions.

Treat unreadable/ambiguous evidence conservatively: fall back when existing
inspection can safely decide; preserve explicit startup errors when it cannot.
A cached ledger, shutdown marker, package version or sidecar-existence check
alone must not replace the authoritative migration ledger and schema checks.

## Acceptance criteria

- [ ] A supported clean database whose ledger equals the released registry can
  start without a full disposable inspection copy or retained migration backup.
  A deterministic test observes the real copying seam and fails if copying occurs.
- [ ] Positive eligibility and race/locking assumptions are documented and tested;
  skipped copying is not inferred merely from successful startup or elapsed time.
- [ ] Hot-journal recovery and WAL/SHM cases remain correct through the existing
  fallback. Recovery may modify the disposable copy during preflight, never an
  incompatible retained database or its sidecars.
- [ ] Unsupported, divergent, newer, malformed and ledger-less histories retain
  existing refusal semantics. Tests compare retained database and sidecar bytes
  before/after refusal, including recovery-needed fixtures.
- [ ] Older supported ledgers retain verified pre-upgrade backup and atomic
  migration semantics. Fresh creation still uses the released registry.
- [ ] Current-schema comparison, integrity and foreign-key verification remain
  intact. This ticket optimizes compatibility inspection copying, not those gates.
- [ ] Normal paused startup, operation guarding, relocation exclusion and absence
  of agent dispatch before readiness remain intact.
- [ ] Startup progress accurately distinguishes direct inspection from fallback
  copying; report measured timing/copy volume without promising a fixed speedup.
- [ ] Compare representative large-database startup before/after on disposable
  fixtures; do not run crash/race experiments against the user's live project.
- [ ] Use the implementation/TDD workflow at the real startup seam; run focused
  migration/recovery tests, type checking, the full suite and independent
  Standards/Spec review. Update architecture and durable ADR reasoning in the
  same implementation change, and record results here. Leave changes unstaged.

## Non-goals

Changing journal mode, disabling durability, bypassing database health checks,
pruning/vacuuming history, changing schema or retry policy, or modifying the
already completed reconnect fix. Do not add a migration solely for this
optimization unless a separately justified design actually needs durable state.

## Comments

2026-10-21: User requested documentation for later implementation only while the
framework is running. No implementation or live database changes were made.
