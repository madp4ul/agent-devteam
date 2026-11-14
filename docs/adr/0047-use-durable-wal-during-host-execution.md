# Use durable WAL during host execution

Status: accepted

## Evidence

Under the reported live workload, task GET requests took between 26 ms and
3.7 seconds. A trivial unknown-route response took 5.6 seconds, and an empty
archival-operation listing took 4.1 seconds. These delays occur across the host.
The database and two preparing worktrees share D:, whose disk reported 37 queued
I/O requests during the observation.

Alternating disposable databases on the same drive used 12 transactions each,
writing a 16 KiB value with `synchronous=FULL`. DELETE journaling took 8.3 and
14.0 seconds in total, with individual commits up to 1.69 seconds. WAL took 2.7
and 3.2 seconds, with commits up to 452 ms. The live database was never opened
by these experiments. This reproduces synchronous storage stalls under the
same competing checkout workload, without establishing a bound on all future
disk latency.

## Decision

After the existing ledger, schema, integrity and foreign-key gate succeeds,
file-backed coordination connections enable WAL and explicitly select FULL
synchronization. The application retains its transaction boundaries and native
SQLite checkpoint policy. In-memory diagnostic databases retain their native
journal mode. This changes connection policy, with no schema migration.

WAL reduces the flushes and random writes required for small transactions.
FULL synchronization retains commit durability before an agent event or user
command is acknowledged. An individual synchronous commit or checkpoint can
still block the host when the disk is slow. Full isolation would require moving
database work away from the HTTP event loop.

On close, an idle connection attempts to checkpoint and restore DELETE mode
with zero busy timeout. Successful close leaves the existing clean-startup
inspection path eligible. If another connection owns a reader or writer, the
host closes its own connection and preserves WAL recovery material. It never
deletes sidecars manually. Abnormal exit or a retained WAL connection uses the
existing copied compatibility-inspection and recovery path on the next launch.

Configuration occurs after verification, so unsupported histories and failed
migrations retain their existing refusal behavior. Online backups continue
to include committed WAL data. Regression coverage checks acknowledged commits
after abrupt exit, rollback of an unfinished transaction, retained readers,
clean restart, migration refusal and concurrent application commands.

## Deployment

The change applies when a new framework host opens its database. Editing this
module does not update the already imported module in a running host. Native
agent workers and MCP stdio processes do not import it. The diagnosis and tests
leave the running project's database, workers and served browser assets intact.

SQLite WAL requires all database clients to use the same host and filesystem
locking. Project state remains host-local. Backups must preserve SQLite recovery
files together or use SQLite's online backup facility.

- [SQLite WAL overview and checkpoint behavior](https://www.sqlite.org/wal.html)
- [SQLite synchronous policy](https://www.sqlite.org/pragma.html#pragma_synchronous)
