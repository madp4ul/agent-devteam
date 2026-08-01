# Define the Git Task-Workspace Lifecycle

Type: wayfinder:prototype
Status: resolved
Blocked by: 01, 02, 05
Parent: ../map.md

## Question

How should the framework create, reuse, and remove one isolated Git workspace
per task without prescribing the process-controlled branch ancestry or merge
target, including for parent and child tasks?

## Comments

### Working decisions

- The coordination framework owns task-workspace provisioning and cleanup. It
  passes the resulting directory to Codex as the run's working directory and
  does not use Codex-managed app worktrees.
- One task workspace is reused by every activation for that task. Codex
  conversation context remains fresh per activation while filesystem state
  persists across the task's agent runs.
- The framework provisions the workspace just in time, after the first
  activation becomes runnable and before its Codex thread starts.
- The process definition supplies a task workspace starting ref rather than
  embedding it in agent instructions or relying on a framework-hardcoded
  branch name. At provisioning time, the framework resolves the ref and creates
  a detached worktree at that commit; it never checks out the starting branch.
- Parent and child tasks always have separate workspaces. Child creation may
  supply a task-specific starting ref, such as the parent branch or current
  parent commit, but the child inherits only committed, Git-addressable state.
  The framework does not copy dirty files, replay patches, or manufacture a
  hidden snapshot commit; a process that needs the child's work to include
  uncommitted parent changes must commit those changes first.
- Archiving is the workspace cleanup boundary. It is rejected while the task
  has active, queued, failed, or interrupted activation work, while the
  workspace has staged, modified, or untracked files, or while its current
  commit lacks a durable Git ref. The framework removes the worktree before it
  marks the task archived; any failure leaves both task and workspace intact.
- Cleanup protects against losing work but does not enforce process success. A
  feature branch that durably references the workspace commit is sufficient
  even when it has not been merged. The process remains responsible for merge
  targets and integration; the framework neither checks whether a branch was
  merged nor deletes branches during workspace cleanup.
- Unarchiving does not restore the removed workspace or remember its last
  commit. If the unarchived task later receives an activation, the framework
  provisions a fresh workspace from the process-defined starting ref exactly
  as it would for a task that had never run. Processes that need completed work
  preserved must merge or otherwise retain it before archival.
- Before each activation starts, the framework checks that an existing task
  workspace still exists and is registered as the expected Git worktree. An
  unexpected missing or invalid workspace stops the activation and is never
  replaced automatically. The first version only needs to report the problem
  for explicit user recovery; it does not reconstruct lost workspace state.
- Task worktrees live beneath a framework-owned workspace root outside the
  project's primary checkout, at stable paths based on internal project and
  task identities. The root is deployment configuration rather than process
  configuration so it can accommodate disk-location and container-mount needs.
  Framework worktree creation and removal are serialized per project repository;
  ordinary agent runs in separate task workspaces remain concurrent.

## Answer

The coordination framework owns one isolated Git worktree per task. It passes
that worktree's directory to Codex as the working directory for every agent run
on the task; it does not use Codex-managed app worktrees. Fresh Codex threads
therefore keep conversation context isolated while successive runs for one task
share the same filesystem and Git state. Different tasks, including parent and
child tasks, never share a task workspace.

The framework provisions a workspace just in time, after the task's first
activation becomes runnable and before its Codex thread starts. The process
definition supplies the default starting Git ref instead of relying on agent
instructions or a hardcoded branch such as `main`. The framework resolves that
ref at provisioning time and creates the worktree detached at the resulting
commit, leaving the referenced branch free for the primary checkout and other
worktrees. Process-controlled agents may then create task-specific branches and
remain solely responsible for ancestry, commits, merges, and merge targets.

A child task may override the process default with a starting ref supplied when
the child is created, commonly the parent branch or current parent commit. The
framework transfers only committed, Git-addressable state. It does not copy the
parent's dirty files, replay patches, or create hidden snapshot commits; a
process that wants a child to inherit uncommitted work must first preserve that
work through its own Git workflow.

Task worktrees live at stable paths beneath a framework-owned workspace root
outside the project's primary checkout. The workspace root is deployment
configuration rather than process configuration so local disk and container
mounting concerns do not enter version-controlled workflow definitions. The
framework serializes worktree provisioning and removal per project repository,
but ordinary agent runs in separate task workspaces remain concurrent.

Before every run, the framework verifies that the task's expected worktree
still exists and is registered correctly. An unexpected missing or invalid
workspace stops the activation and is never replaced automatically. The first
version only needs to report the problem for explicit user recovery; it does
not attempt to reconstruct lost workspace state.

Reaching the final workflow column does not remove the workspace. Archiving is
the cleanup boundary and succeeds only when the task has no active, queued,
failed, or interrupted activation work; the worktree has no staged, modified,
or untracked files; and its current commit is preserved by a durable Git ref.
The framework removes the worktree before marking the task archived, so any
cleanup failure leaves both the task and workspace intact.

These archival checks prevent data loss but do not enforce process success. An
unmerged feature branch is a sufficient durable ref, even if allowing it to go
stale would be a process failure. The framework does not infer a merge target,
require integration, or delete branches. Those responsibilities remain with
the configured process.

Unarchiving does not restore the removed workspace or remember its previous
commit. If the task later receives another activation, the framework provisions
a fresh detached worktree from the process-defined default starting ref. A
process that needs completed work retained must merge or otherwise preserve it
before archival.

Codex's normal `workspace-write` sandbox protects Git metadata, including the
Git directory reached through a worktree's `.git` pointer. The permission or
approval mechanism that allows process-directed branch, commit, and merge
operations is intentionally delegated to **Define Agent Permissions and
Approval Boundaries**.
