# Project-state backup and restore

The bound project state root is one recovery unit. It contains the coordination
database, conversation attachment content, and every framework-owned task
worktree, while the repository's Git
common directory contains the matching worktree registrations. Back up or
restore only while the coordination application and all task agents are
stopped.

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
