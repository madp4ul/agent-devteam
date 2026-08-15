# 67 — Archive Task Worktrees Owned by a Different Windows Identity

**What to build:** Host-side archival trusts the exact framework-managed task
worktree for its own Git operations, allowing dirty-state and durability checks
to run even when the application and worktree have different Windows owners.

**Blocked by:** None

**Status:** resolved

- [x] Apply an exact, process-local Git `safe.directory` value to host-side Git
  operations on a verified framework-owned task worktree.
- [x] Never set global or persistent Git configuration, use
  `safe.directory=*`, or trust a path broader than the exact verified worktree.
- [x] A dirty differently owned worktree reaches the existing discard-changes
  confirmation instead of failing early with `workspace-cleanup-failed`.
- [x] Confirming discard removes the registered worktree and archives the task;
  keeping the workspace leaves both task and workspace unchanged.
- [x] Clean differently owned worktrees archive normally.
- [x] A non-durable current commit still produces
  `workspace-commit-not-durable`.
- [x] Preserve distinct, actionable outcomes for dirty workspace, non-durable
  HEAD, invalid or inconsistent worktree registration, locked worktree, Git
  ownership/trust failure, and actual removal failure.
- [x] Do not report or imply partial deletion when the worktree directory,
  `.git` pointer, and primary-repository registration remain intact.
- [x] Add automated Windows coverage using different worktree and application
  identities or a faithful simulation of Git's dubious-ownership response.
- [x] Verify that no persistent or global Git trust configuration changes.

## Reproduction

1. Create or provision a task worktree as the interactive Windows user.
2. Run the coordination application under `CodexSandboxOffline`.
3. Complete the task.
4. Leave an untracked or modified file in its worktree.
5. Select Archive task.

## Actual behavior

- The UI reports `Workspace cleanup failed`.
- The discard-changes confirmation is never shown.
- Retrying produces the same error.
- Running Git normally inside the worktree reports dubious ownership.
- The worktree may appear not to be a Git repository, leading users to suspect
  partial deletion even though its directory, `.git` pointer, and primary
  repository registration can all remain intact.

## Expected behavior

The host application trusts the exact framework-owned task-worktree path for
its own Git operations. It can then show the dirty-workspace confirmation,
reject an unreferenced commit with the durability error, or remove the worktree
and archive the task successfully as appropriate.

## Root cause

`GitTaskWorkspaceManager.removeForArchival()` first verifies the worktree using
ordinary Git subprocesses. Those subprocesses receive no process-local
`safe.directory` configuration. On Windows, Git rejects the worktree when it is
owned by the interactive user while the application runs as the sandbox
identity. The resulting Git exception is caught broadly and converted to
`workspace-cleanup-failed` before workspace status is inspected, so the UI
cannot distinguish an ownership failure from an actual removal failure.

Agent-run Git commands already receive an exact, process-local `safe.directory`
value through issue 49. Host-side workspace management does not yet use the
same bounded trust mechanism.

## Answer

Host-side archival now verifies the task's exact framework-owned path and
primary-repository worktree registration before passing that path to Git as a
process-local `safe.directory` value. It replaces inherited process-local Git
trust entries without discarding unrelated Git configuration and never writes
global, repository-local, or broader wildcard trust.

Archival preserves separate outcomes for dirty work, non-durable HEAD,
registration inconsistency, rejected ownership trust, locked worktrees,
unexpected inspection failure, and actual removal failure. Browser feedback
states when inspection stopped before removal and when the task, directory,
`.git` pointer, and worktree registration remain unchanged.

Focused real-Git tests faithfully simulate dubious ownership unless the exact
worktree trust is present. They cover dirty keep/discard, clean removal,
non-durable commits, invalid registration, residual ownership rejection,
unexpected verification failure, actual removal failure, retained unrelated
process-local Git configuration, and unchanged global and repository-local
trust. Both TypeScript typechecks, the production build, and all 197 runnable
tests pass; the two credentialed real-Codex integration tests remain skipped.
Independent Standards and Spec reviews report no remaining findings.
