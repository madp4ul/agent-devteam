# Project-state backup and restore

The bound project state root is one recovery unit. It contains the coordination
database and every framework-owned task worktree, while the repository's Git
common directory contains the matching worktree registrations. Back up or
restore only while the coordination application and all task agents are
stopped.

## Schema lifecycle

Before the first release, coordination databases contain disposable development
state. Startup replaces a version-mismatched or structurally incomplete database
with the current schema; no pre-release migration paths are maintained.

After the first release, databases produced by supported released versions are
user-retained state. Before shipping a later schema-changing release, the
application must provide verified, transactional migrations and a recovery
backup. A failed migration or unknown future schema must preserve the original
store and block startup. The pre-release replacement behavior must not be used
for a database created by a supported released version.

## Back up

1. Read the authoritative root and Git common directory without changing them:

   ```powershell
   $projectStateRoot = git config --local --get coordination.projectStateRoot
   $gitCommonDirectory = git rev-parse --path-format=absolute --git-common-dir
   git worktree list --porcelain
   ```

2. Confirm that the root exists and contains `project-state.json`,
   `coordination.sqlite3`, and `task-worktrees`. Copy the entire root to a new,
   versioned backup directory. Do not copy only the database or one worktree.
3. Preserve the repository clone, including its local `.git/config` binding and
   `.git/worktrees` administrative records, with the same backup generation.
   Ordinary Git commits or bundles do not contain this local deployment state.
4. Open the copied database read-only and run `PRAGMA integrity_check`; retain
   the backup only when it returns `ok`.

## Restore

1. Stop the application and agents. Keep the inconsistent root untouched until
   the backup has been independently verified.
2. Restore the repository clone's local Git metadata and the complete project
   state root from the same backup generation to their original absolute paths.
   Git worktree registrations contain absolute paths; relocating the root is a
   separate, unsupported workflow.
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
