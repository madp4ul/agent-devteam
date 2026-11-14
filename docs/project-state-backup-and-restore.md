# Project-state backup and restore

The bound project state root is one recovery unit. It contains the coordination
database, conversation attachment content, and every framework-owned task
worktree, while the repository's Git
common directory contains the matching worktree registrations. Back up or
restore only while the coordination application and all task agents are
stopped.

During execution the coordination database uses WAL with FULL synchronization.
Committed data can reside in its `-wal` file. Clean shutdown normally checkpoints
and restores rollback journaling; an abrupt exit or another open connection can
leave WAL recovery files. Include every SQLite sidecar in an offline backup.
Use SQLite's online backup facility for an incident database capture while the
host is running.
After an offline `VACUUM`, checkpoint WAL or close the database before measuring
the compacted main-file size.

The root can also contain `archival-remainders/`. These are files preserved when
Git unregistered a task workspace but failed to finish deleting its contents.
Each retained directory has a sibling JSON identifying the task, original path,
retained path, and preservation time. They are recovery material, not active task
workspaces. Include them in the full-root backup and review their contents before
any explicit manual cleanup.

Archival refuses tasks containing other registered Git worktrees, including
ignored evidence directories. Confirming discard of ordinary workspace changes
does not authorize deleting those separate worktrees. Move or remove them
explicitly before retrying archival. Startup never prunes stale registrations
automatically.

## Stopping a host with unconfirmed agent termination

1. Pause automation. Pausing prevents new dispatch but lets current work finish;
   it does not itself interrupt a model run. For a budget retry activation, use
   **Stop retries**. Ordinary **Interrupt** instead suspends the task for later
   continuation. Either button order joins the same shutdown operation.
2. Read **Run cleanup** in task activity or its conversation. **Verifying agent
   shutdown** is process cleanup, not model execution. **Termination verification
   blocked** retains workspace ownership and shows the diagnostic. Use **Retry
   termination verification** when offered; it retries inspection/termination of
   the owned attempt, not the model call. Reload does not cancel a requested stop.
3. Ctrl+C (or SIGTERM) pauses dispatch. If verification is blocked, the terminal
   reports the affected tasks and leaves the host/UI available for recovery.
   Once verification succeeds, request shutdown again. Do not infer that a past
   retry eligibility time means a retry is running while automation is paused.
4. If automatic verification is unavailable, keep automation paused. Record the
   task, attempt, native thread IDs and diagnostics. Preserve the coordination
   database using SQLite's online backup facility and verify its integrity and
   foreign keys; copying only the live `.sqlite3` file can omit committed WAL data.
   Preserve the corresponding Codex session files under the configured Codex home
   (`sessions` and `archived_sessions`, when present). Native transcripts are
   separate from the framework database. This targeted incident capture is not a
   complete project-state backup while processes can still modify worktrees.
5. Establish process ownership externally before a forced stop: inspect the
   owned worker/descendants with PID **and creation time**. A vanished worker PID
   or taskkill error is not proof that all its children exited. Do not terminate
   all Node/Codex processes by name or reuse an old PID without identity checks.
   If ownership cannot be reconstructed, a controlled OS restart after saving
   other work is the conservative way to eliminate surviving local processes;
   first retain the incident evidence above. There is no safe force-unlock button.
6. After the host and owned processes are stopped, take the complete recovery-unit
   backup described below. Start the framework normally and leave it paused.
   Verify retained conversation history, native thread IDs and workspaces before
   explicitly continuing. Completed persisted messages are not erased by host
   restart. Output not yet delivered/persisted can be missing, and an in-memory
   pending stop is not replayed across host restart; inspect the recovered task.

Windows snapshot inspection cannot reconstruct a descendant whose intermediate
parent was born and exited entirely between observations. See
[ADR 0043](adr/0043-supervise-codex-execution-outside-its-event-stream.md) for the
containment limits; do not treat a timeout as proof of exit.

## Schema lifecycle

Released coordination databases identify their schema through the ordered
`coordination_migrations` ledger. The first supported history contains
`0001_initial_released_schema`; package versions and SQLite `user_version` are
not compatibility identities. Fresh databases are created through that
migration path and start paused.

Databases created before this released boundary have no supported adoption or
migration path. Startup leaves a ledger-less database and its WAL and
shared-memory files untouched and reports a blocking configuration error. Keep
that store as a backup if its development data is still useful, then configure
a new database path. Do not add a ledger manually or copy tables into a
released database.

Every released migration remains supported indefinitely. When the ledger is an
older exact prefix of the running application's registry, startup creates one
uniquely named `coordination.sqlite3.pre-migration-*.sqlite3` recovery file
beside the live database through SQLite's online backup facility. It
independently verifies the copied ledger, SQLite integrity, and foreign keys,
including committed data still resident in WAL, before changing the source.
All pending migrations and ledger entries then run in one immediate transaction
and the resulting schema, integrity, and foreign keys verify before commit.

Unknown, malformed, divergent, or future histories fail closed without
migration. Backup creation, migration, and post-migration verification failures
are distinct blocking startup diagnostics. A failed migration or verification
rolls back the complete pending sequence and identifies the verified recovery
file; process application, restart and workspace recovery, board changes, and
agent dispatch have not run.

To recover after a reported upgrade failure, stop the application, retain the
failed source and its reported recovery file, independently open the recovery
file read-only and run `PRAGMA integrity_check` and `PRAGMA foreign_key_check`,
then copy that recovery file to the configured database path. Keep the original
until the restored application starts paused and retained data is confirmed.
Do not copy a WAL or shared-memory file from the failed source over the recovered
database.

The automatic migration backup is database-only. It does not contain
conversation attachment bytes, task worktrees, Git registrations, or repository
binding metadata, so it is not a substitute for the complete project-state
operational backup below.

## Compact command-result upgrade and disk reclamation

Migrations `0014_compact_command_results` and
`0015_compact_historical_command_responses` introduce compact historical task
command results. The first ledger boundary prevents older packages from reading
the changed command-result contract. The second converts supported retained
snapshots, one row at a time, using their own historical values. It does not
reconstruct results from current tasks, change retry keys or normalized request
strings, delete retry protection, or rewrite authoritative task/conversation data.
Upgrades from before 0013 normalize human attribution and create existing retry
aliases before conversion. Unknown, incomplete or malformed legacy records remain
preserved; an unsupported replay reports a retained-result diagnostic rather than
executing the command again.

The normal released-upgrade path creates and verifies a fresh pre-migration
database recovery backup before applying these migrations atomically. An earlier
cleanup backup is not current recovery evidence once further project work has
occurred. Preserve adequate free space for the original database, verified backup,
SQLite transaction files and any compacted replacement.

Logical response reduction frees reusable SQLite pages; it does not automatically
shrink the file. Reclamation is an explicit offline operation, never part of an
ordinary command or each archival:

1. Stop the host and all task agents. Acquire the shared project-state operation
   guard for `state maintenance`; refuse a live owner or surviving running attempt.
2. Create a fresh database backup through SQLite's backup facility and independently
   verify integrity, foreign keys and migration history. For database-only
   conversion/compaction this is targeted recovery material; a complete project
   restore still requires the recovery unit described above.
3. Apply the supported released migrations through the database lifecycle. Do not
   edit the ledger manually or run a conversion outside its transaction. Record
   before/after cache payload, row/key/request identities and authoritative facts.
4. After successful upgrade, run SQLite `VACUUM` while retaining exclusive project
   ownership. Keep the verified recovery file. Do not interrupt the rewrite merely
   because large-file I/O takes time; SQLite's rollback files are part of recovery.
5. Verify integrity and foreign keys, original retry identities and compact
   historical results, and unchanged authoritative content and recorded row
   identities. Compare SQLite's internal `sqlite_sequence` by named counters;
   its unreferenced internal row numbers can change during compaction.
6. Record actual live-file savings separately from reusable free pages and retained
   backup bytes. Rerun task-workspace consistency against the recorded database,
   physical task directories and Git registrations: SQLite checks and unchanged
   fingerprints cannot detect a pre-existing orphan checkout. Do not declare the
   project restart-ready while those diagnostics remain. Release the guard only
   after checks and connection close. Restart
   normally; startup remains paused until the user resumes automation.

Conversion or verification failure requires the existing upgrade recovery procedure,
not deleting failed retry records. Backups are not deleted by this maintenance.

## Back up

1. Read the authoritative root and Git common directory without changing them:

   ```powershell
   $projectStateRoot = git config --local --get coordination.projectStateRoot
   $gitCommonDirectory = git rev-parse --path-format=absolute --git-common-dir
   git worktree list --porcelain
   ```

2. Confirm that the root exists and contains `project-state.json`,
   `coordination.sqlite3`, `conversation-attachments`, and `task-worktrees`.
   Copy the entire root to a new,
   versioned backup directory. Do not copy only the database or one worktree.
3. Preserve the repository clone, including its local `.git/config` binding and
   `.git/worktrees` administrative records, with the same backup generation.
   Ordinary Git commits or bundles do not contain this local deployment state.
   Include agent-created nested evidence worktrees and their registrations too;
   they can contain uncommitted implementation evidence. They are artifacts of
   their recorded containing task, not additional framework task workspaces.
4. Open the copied database read-only and run `PRAGMA integrity_check`; retain
   the backup only when it returns `ok`.

## Restore

1. Stop the application and agents. Keep the inconsistent root untouched until
   the backup has been independently verified.
2. Restore the repository clone's local Git metadata and the complete project
   state root from the same backup generation to their original absolute paths.
   Git worktree registrations contain absolute paths; use the supported
   relocation command below when the destination must change.
3. Verify that `coordination.projectStateRoot` names the restored root and that
   `git worktree list --porcelain` names every directory under
   `task-worktrees/`. Do not use `git worktree prune`, manually register an
   orphan, or delete a mismatched directory as a repair shortcut.
4. Start the application. A successful recovery starts paused. If startup
   reports any binding, identity, database, directory, or registration
   mismatch, stop and restore a coherent backup generation; the application
   deliberately performs no adoption or reconstruction.

This procedure has been exercised by the restart integration tests against an
isolated Git repository, production SQLite store, registered detached
worktree, interrupted attempt, and deliberate workspace inconsistency.

## Auxiliary worktree placement

The immediate children of `task-worktrees/` are reserved for database-recorded
task workspaces. An agent-created comparison or baseline checkout placed there
blocks the next startup, even when its files and Git registration are valid.
Keep auxiliary worktrees inside their owning task workspace. If Windows path
length limits make that impractical, arrange a short location outside
`task-worktrees/` with the user and include it in the operational backup.

A missing-record diagnostic does not by itself prove database loss. First
inspect the database read-only and establish the directory's provenance from
retained run commands and Git metadata. A confirmed auxiliary checkout is not
a missing task and must not be given a fabricated database record.

Recovery of a confirmed misplaced auxiliary checkout requires stopped hosts
and agents, a verified backup of that checkout and the Git administrative
records the move changes, and an explicit destination outside the reserved
directory. Keep the database read-only: this operation does not reconstruct
task records or restore coordination history. A targeted backup is sufficient
for this metadata-only move; do not copy every unrelated task workspace.
Preserve the checkout using Git's worktree move operation, verify its file
identities, HEAD and index, then rerun the workspace consistency validator. Do not delete, prune,
or silently adopt unknown directories. Relocation refuses auxiliary registrations
elsewhere inside either state root as well as nested task artifacts: preserve
those checkouts outside both relocation roots before using that command.
If ownership cannot be established,
use the coherent-backup restore procedure instead.

## Relocate

Relocation is a separate offline operation, not a variant of restore. Stop the
coordination application and all of its agents, then run this from the project
repository:

```powershell
node --experimental-strip-types src/cli.ts relocate-state D:\new\project-state
```

When invoked outside the project repository, identify it explicitly:

```powershell
node --experimental-strip-types src/cli.ts relocate-state D:\new\project-state --project D:\project
```

The command reads the source from the repository-local binding. It validates
the complete current state, available destination space, and exclusive access;
copies through a staged destination; rewrites durable workspace paths; repairs
Git's linked-worktree registrations; and changes the binding only after the
destination validates. The next application start is paused.

If relocation is interrupted, normal startup blocks and prints the exact
`relocate-state` command to rerun. Use that same destination: the durable
journal resumes or safely rolls back the unfinished phase. Do not move either
root or edit Git registrations manually.

After a verified cutover, failure to delete the old root does not roll the
project back. The command identifies that inert directory; confirm that the
repository binding names the new root before removing the old directory
manually.
