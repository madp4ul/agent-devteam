# 16 — Execute the First Task Activation

**What to build:** A user can move a task into a watched column and observe one
durable activation execute through a controlled agent runtime in an isolated
Git task workspace. The task, activity, activation reason, and attempt outcome
remain inspectable through the application boundary.

**Blocked by:** 15 — Start a Validated, Paused Process

**Status:** resolved

- [x] Creating or moving a task into a watched column atomically records the
  board change, source event, and one targeted column-entry activation.
- [x] Creating or moving a task into an unwatched or Completion column creates
  no column-agent activation.
- [x] Paused automation retains runnable work without dispatching it; resuming
  starts the head activation.
- [x] The first runnable activation provisions a framework-owned detached Git
  worktree from the configured starting ref immediately before the run.
- [x] The controlled runtime receives the activated agent, immutable reason,
  exact source event, current task state, and task workspace.
- [x] Completing the controlled run records its attempt and activity without
  implicitly commenting on or moving the task.
- [x] A later activation for the same task reuses its workspace, while another
  task receives a distinct workspace.
- [x] Behavioral tests use the production relational store and real temporary
  Git repositories and worktrees through the confirmed application seam.

## Answer

Implemented durable column-entry activations, process-paused scheduling, a
controlled runtime boundary, inspectable attempts and monotonic task activity,
and just-in-time detached Git task workspaces. Successive activations verify and
reuse the task's registered worktree while distinct tasks receive isolated
worktrees. Application-boundary coverage uses SQLite plus real temporary Git
repositories and worktrees, including restart durability and fail-closed resume
without a configured runtime.
