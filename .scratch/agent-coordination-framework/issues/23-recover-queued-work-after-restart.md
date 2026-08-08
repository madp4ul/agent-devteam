# 23 — Recover Queued Work After Restart

**What to build:** One persistently bound project state root keeps coordination
state, activation order, task workspaces, and retry schedules coherent across
application and machine interruption, while storage problems fail closed and
remain recoverable through documented backup and restore.

**Blocked by:** 22 — Prevent Conflicting and Duplicate Changes

**Status:** resolved

- [x] Current task state, authored records, activity, attention, activations,
  attempts, thread IDs, retry schedules, suspensions, and idempotency data remain
  durable across restart.
- [x] First-time project initialization selects one project state root and
  records a project state binding in repository-local Git configuration. The
  ordinary zero-configuration default is the sibling
  `<repository-name>-agent-coordination-state`; an optional custom root may be
  selected during initialization without entering the process definition.
- [x] The project state root contains the coordination database and a dedicated
  task-worktree directory. Once initialized, omitted or conflicting startup
  options cannot redirect either one or create a second empty coordination
  store.
- [x] Startup validates project state consistency before board mutation or agent
  dispatch by reconciling the binding, database workspace records, physical
  directories, and framework-owned entries from Git's worktree registrations.
  Missing, extra, or mismatched task worktrees are reported together rather than
  discovered one activation at a time.
- [x] A missing bound root, a root belonging to another project, or any database
  and Git worktree mismatch enters the existing blocking configuration-error
  mode with complete actionable diagnostics. Startup never adopts, deletes,
  reconstructs, relocates, or silently replaces inconsistent state.
- [x] Startup detects an attempt left active without a live executor, records a
  technical interruption failure, and retains its activation at the head of the
  original queue.
- [x] Recovery uses at-least-once attempt delivery while atomic and idempotent
  commands prevent duplicate coordination effects.
- [x] A recovering attempt reuses the existing task workspace and receives
  attempt context describing its sequence, preceding outcome, and thread
  resume-or-replacement behavior.
- [x] The framework resumes an activation's Codex thread when usable and falls
  back to a fresh thread without discarding workspace changes.
- [x] Storage validation and schema migration complete before any agent dispatch
  or board mutation.
- [x] Migration creates and verifies a backup before changing durable storage.
- [x] Unavailable, inconsistent, or unmigratable storage starts no automation,
  permits no mutation, preserves damaged data, and never substitutes an empty
  store.
- [x] A documented manual backup-and-restore procedure is verified against an
  isolated deployment and treats the bound project state root as one unit while
  respecting Git's external worktree-registration metadata.
- [x] Restart tests cover queued, running, retry-scheduled, and idle tasks while
  proving that each task's activation order is preserved. Startup tests also
  cover a forgotten workspace-root argument, a missing bound root, a database
  workspace without its registration, and a framework-owned registration
  without its database record.

## Comments

- State-root relocation is deliberately excluded. Git records absolute linked
  worktree locations, so moving the directory requires explicit repair in
  addition to moving files. A lower-priority follow-up owns that workflow.
- This sharpens the existing fail-closed storage requirement after a live test
  used one custom task-workspace root and later restarted with the default. The
  resulting mismatch was diagnosed only when Resume reached a task activation;
  the complete project-level inconsistency must instead be visible at startup.

## Answer

Implemented one repository-local binding to a sibling or explicitly selected
project state root containing both `coordination.sqlite3` and `task-worktrees/`.
Startup now reconciles retained database workspace records, directories, and
Git worktree registrations before process mutation or dispatch, and presents
binding, identity, consistency, unavailable-storage, and migration failures in
the normal blocking configuration-error mode without adopting or replacing
state.

Restart recovery records orphaned running attempts as technical interruptions,
returns their activation to the head of its durable order, reuses the task
workspace, and resumes the retained Codex thread with a fresh-thread fallback
that reports replacement honestly. Schema changes run transactionally only
after a verified SQLite `VACUUM INTO` snapshot, including committed WAL data;
future schemas are rejected unchanged. The documented restore procedure treats
the state root as one unit and preserves Git's external absolute registrations.

Verification passed both TypeScript typechecks, 78 local tests plus one
intentionally skipped credentialed Codex test, the production build, all 10
browser scenarios, and `git diff --check`. Final independent Standards and Spec
reviews reported no findings. Retry scheduling and task suspension transitions
remain owned by issues 24 and 25; this ticket establishes the durable storage
and activation-order guarantees those states use.
