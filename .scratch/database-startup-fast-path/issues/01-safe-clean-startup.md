# Avoid the inspection copy on provably safe ordinary database startup

Type: task
Status: resolved
Blocked by: none

## Scheduling constraint

The earlier 2026-10-21 documentation-only deferral was superseded by the user's
explicit implementation request on 2026-11-08. Implement and verify against
disposable fixtures; do not restart the live host or alter its retained database.

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

- [x] A supported clean database whose ledger equals the released registry can
  start without a full disposable inspection copy or retained migration backup.
  A deterministic test observes the real copying seam and fails if copying occurs.
- [x] Positive eligibility and race/locking assumptions are documented and tested;
  skipped copying is not inferred merely from successful startup or elapsed time.
- [x] Hot-journal recovery and WAL/SHM cases remain correct through the existing
  fallback. Recovery may modify the disposable copy during preflight, never an
  incompatible retained database or its sidecars.
- [x] Unsupported, divergent, newer, malformed and ledger-less histories retain
  existing refusal semantics. Tests compare retained database and sidecar bytes
  before/after refusal, including recovery-needed fixtures.
- [x] Older supported ledgers retain verified pre-upgrade backup and atomic
  migration semantics. Fresh creation still uses the released registry.
- [x] Current-schema comparison, integrity and foreign-key verification remain
  intact. This ticket optimizes compatibility inspection copying, not those gates.
- [x] Normal paused startup, operation guarding, relocation exclusion and absence
  of agent dispatch before readiness remain intact.
- [x] Startup progress accurately distinguishes direct inspection from fallback
  copying; report measured timing/copy volume without promising a fixed speedup.
- [x] Compare representative large-database startup before/after on disposable
  fixtures; do not run crash/race experiments against the user's live project.
- [x] Use the implementation/TDD workflow at the real startup seam; run focused
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

2026-11-08: User authorized implementation in the shared checkout as part of the
coordinated batch. The original live database remains untouched.

## Implementation evidence — 2026-11-08

- `CoordinationDatabase` now avoids copying only after positive ordinary-file,
  rollback-header, sidecar, locked current-ledger and mode checks. Read-only
  EXCLUSIVE mode is selected before pager access; the retained SHARED lock
  overlaps the eventual writable connection's RESERVED lock. Schema, complete
  integrity and foreign-key checks finish inside that transaction. No marker,
  cache, migration, journal-mode change, immutable mode or health shortcut added.
- Ordinary filesystem descriptors close before SQLite locking, avoiding the
  POSIX descriptor-close hazard. The actual Node 24.18.1 / SQLite 3.53.1 driver
  was exercised with real raced WAL/SHM, hot journals and external connections.
  Every incompatible retained-file/sidecar refusal comparison remains exact.
- Independent Spec review found and reproduced a journal appearing after the
  protected read that could escape into stale copied inspection. Its regression
  was red, then green after newly observed file/mode/identity changes and other
  post-read ambiguities became terminal refusals while still protected.
- The full suite caught fail-fast contention breaking concurrent application
  startup. Re-acquisition now preserves the existing five-second SQLite busy
  allowance, closes all connections before a bounded wait, and starts each check
  fresh. Once contention is observed, later ineligibility cannot select copying.
  Persistent contention refuses; transient contention can finish and start cleanly.
  The existing concurrency test passes unchanged, including three repeat checks.
- The actual filesystem copy-open seam proves no inspection copy on supported
  current startup; no retained pre-upgrade backup appears. Existing WAL/older
  migration, hot-journal recovery, incompatible-history, atomic rollback,
  configuration-shell and startup-paused tests pass. New tests also preserve
  schema/integrity/foreign-key refusal and release every probe lock on failure.
- Progress distinguishes direct inspection, lock waiting and copied fallback.
  On a disposable 1,075,654,656-byte fixture, the unchanged copy path took
  1,059/1,078 ms and copied all 1,075,654,656 bytes; direct startup took 708/742 ms
  with zero copied inspection bytes. Both retained full health checks. The
  alternating host-local measurements are not a fixed speedup promise. See the
  self-cleaning [benchmark](../benchmark.mjs) and [ADR 0042](../../../docs/adr/0042-inspect-clean-current-databases-without-copying.md).
- Final Standards and Spec re-reviews report **0 findings** each. Typecheck and
  build pass. Final full accumulated-tree suite: **479 passed, 6 skipped,
  0 failed** (135 seconds). The focused startup/migration/CLI set passed 48 tests
  before the final concurrency refinement; final safety/concurrency checks
  passed 12 tests. All changes remain unstaged; prior user-staged ticket
  snapshots are unchanged.
