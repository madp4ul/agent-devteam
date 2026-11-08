# Inspect clean current databases without copying

Status: accepted

## Decision

Retain the released ledger, schema snapshot, full integrity and foreign-key
checks from ADR 0018. Avoid its disposable compatibility copy only for a
positively identified clean, current rollback-mode database. No migration,
shutdown marker, schema cache, journal-mode change or immutable-file option is
introduced. The project-state operation guard remains unchanged.

`CoordinationDatabase` owns this optimization and the lock handoff. Eligibility
and each lock handoff are synchronous; there is no asynchronous gap while
deciding whether the two connections refer to accepted current state.

1. Require an ordinary file, no WAL/SHM/rollback-journal directory entries, the
   SQLite magic and rollback read/write header versions (both 1). Verify the
   opened file matches the inspected device/inode. These checks only avoid
   unnecessary probing; they do **not** establish compatibility or cleanliness.
2. Open `DatabaseSync` with `readOnly: true`. Before any pager read, set
   `locking_mode=EXCLUSIVE`, then begin a transaction and read the real ordered
   migration ledger. A successful rollback-mode read acquires a retained SHARED
   lock. Require `journal_mode=delete`, the exact current registry, unchanged
   file identity, and still-absent sidecars. Newly observed sidecars, journal-mode
   or identity changes, and ambiguous post-read checks **refuse startup while
   still protected**. Releasing that lock into copied inspection could otherwise
   accept old history while an external writer commits a replacement. A stable
   non-current history retains the old copied path.
3. While that read connection still owns its lock, open the eventual writable
   connection and acquire `BEGIN IMMEDIATE` with zero busy timeout. The SHARED
   lock prevents another SQLite writer from committing or switching to WAL;
   the new RESERVED lock excludes competing writers before the reader closes.
   On BUSY/LOCKED, close both connections before yielding and rechecking the
   complete eligibility sequence with fresh connections. Keep the existing
   five-second SQLite busy allowance as a total deadline, with bounded 25 ms
   waits. Once contention is seen, subsequent ineligibility cannot select the
   copied path. Persistent contention blocks with an explicit retry diagnostic.
   Post-read evidence changes remain terminal refusals, not retryable snapshots.
4. Close the reader, run the existing schema/integrity/foreign-key checks in
   the retained writable transaction, then commit the read-only verification
   work. Failure rolls back and closes it. Ordinary application recovery and
   startup-paused behavior begin only after this gate succeeds.

Normal filesystem descriptors used to read the header close **before** SQLite
takes a lock. On POSIX, closing an independent descriptor for the same inode
could release the process's advisory locks. The handoff uses two connections
managed by SQLite's own VFS; no filesystem content reads occur between them.

## Why ordinary read-only opening is insufficient

A read-only SQLite connection can touch shared memory in WAL mode. A header or
sidecar check has a race before SQLite opens the file, so checking rollback
format first does not solve this. SQLite documents that setting exclusive
locking mode **before the first WAL access** prevents all shared-memory calls;
the WAL index is private instead. That setting is a defense against a raced WAL
transition, not permission to admit WAL into the fast path. Read-only hot-journal
recovery fails rather than writing retained pages. A pre-read failure requiring
recovery closes the probe and uses the existing disposable copy; detected
contention waits only after releasing all locks. Once a protected read succeeds, newly observed file/mode
changes or any ambiguous check refuse rather than releasing that protection
into an unfrozen copy.

The bundled Node 24.18.1 / SQLite 3.53.1 on Windows was exercised through actual
startup calls: constructor/probe/close leave raced incompatible WAL with existing
or absent SHM and hot rollback-journal files byte-identical. The WAL probes
return IOERR and the hot-journal probe READONLY_ROLLBACK on this driver. Their
specific codes are evidence, not an eligibility dependency. A separate Node
writer receives SQLITE_BUSY while verification holds the reservation. Refusal
and success both release their locks. A transient writer can finish while the
startup wait is yielded; its newly created journal never selects fallback.
Re-test these guarantees when changing
the SQLite driver/open sequence.

The application guard excludes cooperating framework hosts and maintenance,
not arbitrary SQLite clients. SQLite's locks protect against clients using its
locking protocol. Deliberate raw-file replacement/writes or broken filesystem
locking are outside that guarantee; file identity checks are additional refusal
checks, not a claim to prevent hostile replacement. Existing fallback copying
and migration semantics are unchanged. If the direct probe detects contention
it retries only fresh eligibility within the existing busy bound, then refuses
rather than claiming the fallback can snapshot an active writer. This is SQLite
lock acquisition behavior, not a change to agent/runtime retry policy.

## Consequences and evidence

Current clean startup reports direct migration inspection, with no copying
phase or backup. Ineligible WAL, cold/hot journals, older ledgers and pre-read
recovery fallback still report actual copying bytes. Current-schema comparison and database-wide health
verification remain fully required; no estimated percentage or ETA is added.

The regression suite observes the actual filesystem open seam for the copy,
compares all retained SQLite file bytes after refusal, injects mode/sidecar
changes after preliminary checks, and exercises real SQLite lock contention.
A second-connection regression starts a writer after the protected ledger read
and attempts to replace the ledger through a journal-appearance fallback; startup
refuses without committing/rolling back that writer or copying its changing state.
Existing migration tests cover WAL backup, hot-journal recovery, refusal
histories, atomic rollback, and application readiness gates.

A disposable 1,075,654,656-byte current-schema fixture filled with historical
command responses was measured with the same complete health checks. The
unchanged copied path (selected with an empty cold journal) took 1,059 and
1,078 ms and copied 1,075,654,656 bytes. Direct runs took 708 and 742 ms with zero
inspection bytes copied. Runs alternated copied/direct/direct/copied on this
host; cache, storage and database contents affect timings. This is not a fixed
speedup promise. The reproducible script is
[benchmark.mjs](../../.scratch/database-startup-fast-path/benchmark.mjs), which
creates and removes its own temporary fixture and accepts no retained path.

## Primary references

- [SQLite exclusive WAL without shared memory](https://www.sqlite.org/wal.html#use_of_wal_without_shared_memory)
  specifies the before-first-access requirement.
- [SQLite locking mode](https://www.sqlite.org/pragma.html#pragma_locking_mode)
  describes retained locks for exclusive mode.
- [SQLite rollback locking](https://www.sqlite.org/lockingv3.html)
  describes SHARED/RESERVED locks and hot-journal recovery.
