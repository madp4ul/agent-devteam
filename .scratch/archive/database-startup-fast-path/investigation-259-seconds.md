# Startup timing investigation — 8 November 2026

Final disposition: the user also reported being unable to reproduce the delay
on retry and considers it possibly a one-time event. The investigation is closed
as not reproducible, with no claimed root cause or fix. Preserve these findings
and reopen only if the symptom recurs or new evidence becomes available.

The reported 259-second integrity delay is **not reproduced**. No database
verification policy or startup implementation has been changed. The measurement
does not justify weakening the existing integrity/foreign-key checks or claiming
the direct lock handoff caused the reported regression.

## Conditions and observations

Investigation began only after the Autonomous V2 API reported fully paused,
zero active runs and zero preparations. The only running framework host found
was V2 on port 3001. Its database was approximately 21 MB. The older Idle Game
database used for this investigation was 1,042,395,136 bytes and was not attached
to a running framework host. No source WAL/SHM/journal sidecars were present.

A read-only SQLite online backup created an isolated snapshot in ignored
`.scratch/local-evidence/startup-259/retained.sqlite3` in 9.180 seconds. The
source size and modification time were unchanged. This is snapshot creation
time, not the previous startup's raw inspection-copy timing. Database content
was not printed or published.

Environment: Node v24.18.1, SQLite 3.53.1, Windows, 4,096-byte pages,
254,491 pages, zero free pages, 66 indexes, default connection cache setting
`-2000`. Selected source row counts: 49,467 conversation history items, 27,610
activity records, 21,175 timeline sources, 17,753 timeline records, 12,688
comments, 11,649 command responses and 6,530 attempts. This differs materially
from the earlier synthetic 1,024-large-response benchmark.

The disposable probe called `CoordinationDatabase.open(snapshotPath, observer)`
from `src/application/internal/coordination-database.ts`, timing phase transitions
with `performance.now()` and closing the returned connection. It ran under
Node's `--experimental-strip-types` option against the isolated snapshot only.

A parent process imposed a 30-second timeout. It completed in 1.522 seconds,
including 1.344 seconds for integrity and 0.166 seconds for foreign keys. Thus
the attempt to establish a failing performance reproduction did not go red.
A separate read-only check of the original database then took 1.175 seconds
for integrity (`ok`) and 0.166 seconds for foreign keys (no violations), with
source size/modification time unchanged. This check did not invoke startup,
migrations, application recovery or any live framework commands.

## Alternating comparison on the isolated real-data snapshot

| Path | Total open | Inspection copy | Integrity | Foreign keys |
| --- | ---: | ---: | ---: | ---: |
| Copied fallback, first | 2.444 s | 0.405 s | 1.379 s | 0.180 s |
| Direct, first | 1.675 s | none | 1.489 s | 0.174 s |
| Direct, second | 1.641 s | none | 1.389 s | 0.239 s |
| Copied fallback, second | 2.055 s | 0.371 s | 1.444 s | 0.177 s |

The copied case uses an empty disposable journal beside the snapshot to select
the retained copy path, as the original benchmark does. It is a comparison of
the two current paths, not a separately installed previous application build.
Every case runs the same complete schema, integrity and foreign-key checks.
Phase totals also include inspection, its temporary-copy cleanup and opening;
the first inspection phase including cleanup took 0.470 s versus 0.052 s in
the last copied case.

These runs follow snapshot creation and other reads, so they are cache-warm
comparisons. They do not reproduce the user's original cache/storage/load
conditions. No operating-system cache was flushed, security scanning changed,
or unrelated workload stopped. The snapshot also has a different physical
file allocation. Original startup logs and conditions remain necessary before
assigning a cause. The read-only original-file result rules out a persistent
259-second cost under the conditions measured here; it does not rule out a
transient cold-cache or contention issue.

## Reporting ambiguity and next evidence

`src/startup-progress-worker.ts` computes `elapsed` from the single startup
`startedAt`; it does not reset this clock at phase changes. A console line saying
“Checking database integrity (...259s elapsed...)” therefore reports cumulative
startup time, not an independently measured 259-second integrity phase. The
user confirmed that this was the original Idle Games project, launched with
`start-agent-devteam.bat` without V2, and that its console counter ticked up to
259 seconds during the wait. This confirms the observed counter and project;
it does not supply the integrity phase's starting timestamp. The long wait
remains an unresolved report, not something disproven by the fast later checks.

Read-only launcher inspection confirms that the old batch file invokes this
same sibling `agent-devteam/src/cli.ts`, using the original Autonomous process
and default port 3000. The project's Git-local state binding points to the old
state root used for these measurements. The launcher also installs dependencies,
validates the process and builds before starting the host; those operations
precede the startup progress worker and are not part of its elapsed counter.
The launcher was inspected, not executed. Its earlier Node PATH and machine
load cannot be reconstructed from this observation.

Next evidence should establish the exact database/version and original phase
start/end times, then compare under matching conditions. The same observer-based
measurement can be repeated on another safely obtained snapshot. Avoid
repeated heavy checks without a new condition to test. A potential follow-up is
unambiguous total-versus-phase timing in startup diagnostics; it does not itself
fix a slow check and has not been implemented here.

SQLite documents the difference between full integrity and quick checks in its
[PRAGMA reference](https://www.sqlite.org/pragma.html#pragma_quick_check).
Switching to a quick check would skip uniqueness and index/table consistency
verification; the earlier user requirement in framework ticket 100 explicitly
retained the full check. No such policy change is justified by these results.

The disposable snapshot was removed after recording these results. The retained
probe lives at `scripts/diagnostics/measure-database-startup.mjs`; invoke it with
`node --experimental-strip-types` and a snapshot path beneath the ignored
`.scratch/local-evidence/startup-259/` directory. A future measurement must
likewise use a safely obtained disposable snapshot rather than opening retained
data through the startup/migration path.
During this investigation the running V2 application remained paused and was
not restarted or modified.
