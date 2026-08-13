# 34 — Relocate a Project State Root

**What to build:** Provide one simple offline command that moves an initialized
project's complete coordination state to a chosen destination and leaves the
project ready to start there without losing database history, task-workspace
Git state, or registrations.

**Blocked by:** 23 — Recover Queued Work After Restart

**Status:** resolved

- [x] `coordination relocate-state <destination> [--project <repository>]`
  relocates the project bound to the current repository by default. The command
  derives the source from `coordination.projectStateRoot`; the user never has to
  repeat or override the source path.
- [x] Relocation and normal application startup share an exclusive project-state
  operation guard. Relocation refuses to begin while the application or any of
  its agent runs may still be using the state, and startup cannot begin during a
  relocation. A proven-stale guard is recoverable without weakening exclusivity.
- [x] Before changing files, registrations, or configuration, the command
  validates the existing binding, project identity, coordination database,
  task-workspace records and directories, Git worktree registrations, and
  available destination capacity. Existing inconsistency fails closed with
  actionable diagnostics.
- [x] The destination must not already contain state and must not be the source,
  lie inside the source, or lie inside the project repository. Unsafe,
  ambiguous, unrelated, or insufficient destinations are rejected without
  changing either location.
- [x] The complete state root is copied to a staged destination while the source
  remains intact as rollback material. The copied database retains every record
  and transaction, including committed WAL data, and every task workspace
  retains untracked, staged, unstaged, committed, detached, and branch state.
- [x] The destination database rewrites every persisted absolute task-workspace
  path, including historical attempt paths, from the old task-worktree root to
  the corresponding new path without changing task or attempt identity.
- [x] The command repairs the project repository's linked-worktree metadata for
  every relocated task workspace using supported Git operations. It does not
  recreate worktrees, check out commits, prune registrations, or infer missing
  state.
- [x] A durable relocation journal records the source, destination, completed
  phases, and authoritative side outside the moving root. Re-running the same
  command after interruption safely resumes or rolls back; normal startup
  detects an unfinished journal and blocks with the exact recovery command.
- [x] Cutover occurs only after the destination database, directories, and Git
  registrations validate together. The repository-local binding changes last,
  and a final validation must succeed before the destination is reported as
  authoritative.
- [x] Failure before cutover restores the original Git registrations and leaves
  the original binding and source authoritative. Failure after cutover never
  redirects startup to the source. Neither failure path initializes empty state,
  adopts unrelated state, or leaves two roots independently authoritative.
- [x] After verified cutover, the command removes the old source. If cleanup
  alone fails, relocation still succeeds, the destination remains authoritative,
  and the command identifies the inert old directory for manual removal.
- [x] Successful relocation prints the new authoritative root and confirms that
  the application will next start paused. Errors identify the phase, preserved
  authoritative root, and one safe resume or recovery command.
- [x] Automated coverage exercises same-volume and cross-volume relocation,
  clean and dirty task workspaces, branches and detached heads, path escaping,
  insufficient space, active-use exclusion, every interruptible phase, Git and
  database repair failures, source-cleanup failure, rerun recovery, and a real
  paused application restart from the new root.
- [x] User documentation presents the one-command workflow and explains only
  the exceptional recovery and inert-source cleanup paths. Ordinary backup and
  restore remains a separate same-location recovery procedure.

## Context

The repository-local binding already provides the authoritative source path,
so accepting a separate source argument would create avoidable ambiguity. The
coordination database stores absolute paths in both current task-workspace
records and attempt history, while Git stores linked-worktree locations outside
the project state root. Moving only the directory therefore cannot produce a
consistent project.

Relocation is deliberately offline. Pausing process automation would still
leave the web application, database connections, and possibly agent processes
alive, so it is not a sufficient safety boundary. The source itself serves as
rollback material until verified cutover; requiring the user to prepare a
second backup would complicate the normal one-command path without improving
that transactional guarantee.

## Comments

- Git records linked-worktree locations in the primary repository, so moving a
  state directory with ordinary filesystem tools is insufficient. The
  coordination store also currently records absolute workspace paths.
- This is intentionally lower priority than establishing the persistent binding
  and startup consistency checks. Run a separate requirements session before
  marking it ready-for-agent; relocation may not be needed in the first usable
  version.
- Requirements grilling on 2026-08-13 selected a dedicated offline CLI command
  over a browser action or manual procedure. The user wants the ordinary path to
  require only a destination and delegated detailed safety restrictions to the
  implementation, provided the command completes with a working relocated
  project.

## Answer

Implemented `coordination relocate-state <destination> [--project <repository>]`
as a guarded, offline, destination-only operation. It validates the bound state
and canonical destination, stages a complete copy, rewrites every current and
historical workspace path, repairs Git worktree registrations, switches the
repository binding last, and starts the relocated application paused. A durable
Git-common-directory journal supports safe reruns and startup blocking, while
pre-cutover failures restore the source and post-cutover cleanup failures leave
one authoritative destination with an explicit inert-source warning.

Startup and relocation now share a fail-closed project operation guard. Normal
shutdown drains agent work before releasing it; after an abnormal shutdown,
durable running-attempt evidence prevents relocation until a normal startup has
recovered the interrupted work. Automated CLI coverage exercises relocation,
recovery and rollback phases, Git/database failures, active and crash-stale
ownership, symlink/junction path aliases, insufficient capacity, workspace Git
states, cleanup warnings, and restart from the new root.
