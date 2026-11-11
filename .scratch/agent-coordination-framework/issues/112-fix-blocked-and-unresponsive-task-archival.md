# 112 — Fix blocked and unresponsive task archival

**Type:** task

**Status:** open

**Blocked by:** None — can start immediately.

**Scope:** Inspection and confirmed cleanup blockers. General operation feedback
is tracked in 113; archival progress and responsiveness are tracked in 114.

## Reported problem

Archiving completed tasks from a Completion column appears to do nothing for a
long time, sometimes reports a network error, and eventually can display a list
of tasks with cleanup problems. One affected task contains a nested Git worktree.
Opening that task and archiving it individually successfully opens the intended
confirmation dialog, whose presentation the user considers good.

The dialog lists the task worktree and its nested worktree, but inspection fails
with an error reported as stdout max buffer length exceeded. File Explorer can
open the worktrees, yet deletion is disabled with guidance that all worktrees
must be inspectable and the task workspace HEAD must have a durable named ref.
This blocks the user's explicit intent to discard these worktrees and archive
completed tasks. The exact command producing the buffer overflow and whether
the named-ref condition is independently failing are not yet established.

## Desired outcome and acceptance criteria

- Reproduce the individual inspection failure at the real
  Git/process and HTTP boundaries. Identify the overflowing command, output size,
  latency and timeout behavior; do not assume nested worktrees are the sole cause.
- Handle large Git output without overflowing a fixed stdout buffer. Prefer
  appropriately bounded queries or streamed processing over an arbitrary larger
  buffer as the only fix. Cover large dirty/untracked trees and nested worktrees.
- Return actionable per-task and per-worktree inspection/cleanup outcomes that
  the operation feedback and archival progress work in 113–114 can display.
- Preserve the useful individual confirmation dialog and nested-worktree scope
  listing. Clearly distinguish inspection failure, missing durable refs, and
  other blockers instead of presenting a generic combined prerequisite.
- Provide a deliberate, clearly confirmed discard path for user-owned task and
  nested worktrees when the user wants their contents deleted. Revisit whether
  requiring a durable named ref is appropriate for explicit discard. Inability
  to inspect changes must not become an unexplained permanent archival dead end.
  Specify what identity/scope evidence is required for that path: keep deletion
  confined to explicitly reviewed owned paths, reject redirects/path escapes,
  and never infer consent to delete unrelated worktrees or running agents' work.
- Preserve conversation/task history when archiving and avoid database/Git state
  divergence after partial cleanup. Provide recoverable per-worktree failures.
- Add regressions for output exceeding the old buffer, nested cleanup, missing
  named refs with explicit discard, retry after partial failure, and the individual
  inspection/confirmation dialog in both browser themes. Bulk operation progress
  and multi-column scheduling coverage belong to 114.

## Comments

2026-11-11: User report; not yet reproduced or diagnosed. The request is to track
this problem for later work, not to delete any current worktrees now. The user's
priority is being able to archive completed tasks and deliberately discard their
workspaces, rather than being trapped behind inspection/ref prerequisites.

2026-11-12: Further user feedback distinguishes three concerns. This ticket keeps
the inspection/discard problem; [113](./113-provide-viewport-fixed-interactive-operation-feedback.md)
owns shared feedback presentation and
[114](./114-make-archival-progress-visible-and-multi-column-requests-responsive.md)
owns progress, attribution, refresh and responsiveness for archival requests.
Neither new ticket requires resolving the Git inspection failure first: failures
must remain observable and actionable while that blocker exists.
