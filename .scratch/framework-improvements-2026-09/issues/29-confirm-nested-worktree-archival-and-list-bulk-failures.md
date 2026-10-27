# 29 — Preview and confirm nested-worktree deletion during task archival

**Type:** task
**Status:** open
**Blocked by:** None.
**Next step:** Specify the archive confirmation and cleanup contract using the existing workspace controls.

## Problem and requested behavior

Individual task archival currently stops with `workspace-nested-worktrees` when
the task workspace contains another registered Git worktree. The user must
investigate and remove that checkout manually before retrying. Bulk archival
receives per-task rejection reasons but displays only an aggregate rejection
count, leaving the user to discover which tasks require intervention.

For individual archival, show a dialog explaining the nested worktrees and
offering Abort and Proceed. Before deciding, the user must be able to inspect
each affected worktree's Git summary and open it in Visual Studio Code or File
Explorer, using the existing workspace-control presentation and host opening
behavior where practical. Proceed explicitly authorizes deleting the displayed
nested worktrees as part of archiving the task.

Bulk archival need not offer nested-worktree deletion in this version. It must
identify every failing task and direct the user to that task's individual
archive flow.

## Acceptance criteria

- [ ] Selecting Archive on a task with nested registered worktrees opens an
  explanatory confirmation dialog instead of ending with only a rejection.
  Identify all affected nested worktrees and make the extent of deletion clear.
- [ ] Each nested worktree has a preview based on the existing workspace Git
  summary: path, branch or detached HEAD, staged/unstaged/untracked changes and
  relevant commit information. Reuse its presentation and inspection logic
  where practical instead of introducing a competing Git-status control.
- [ ] Include unpushed-commit information and whether detached commits lack a
  durable named ref. Distinguish these concepts from commits since task start;
  a nested checkout need not have its own task-start baseline. Missing upstream,
  unavailable Git status, or uncertain remote information is explicit rather
  than presented as zero risk. Do not silently fetch or push during preview.
- [ ] Account for ignored/generated files that deletion would remove; a clean
  ordinary Git status must not imply that no local evidence exists. A compact
  warning/summary is sufficient; a new repository browser is not required.
- [ ] Provide the existing Visual Studio Code and File Explorer opening options
  for the exact nested checkout, with actionable failure feedback. The user can
  inspect it externally before choosing Abort or Proceed.
- [ ] Abort closes the flow without deleting worktrees or archiving the task.
  No destructive cleanup occurs before explicit Proceed. Coordinate this with
  the existing dirty-parent confirmation so the user's consent covers the
  actual files and worktrees being discarded.
- [ ] Proceed revalidates task eligibility, workspace ownership/registration,
  and the inspected deletion scope before cleanup. Newly discovered worktrees
  or materially changed risks require renewed review. An uninspectable target
  must not be treated as a clean checkout.
- [ ] Cleanup handles multiple/nested levels deliberately, removes registrations
  through Git, and never deletes branches or broadens persistent Git trust.
  Preserve ordinary activation, ownership, and archival guards. Only mark the
  task archived after required cleanup succeeds. Report any partial cleanup
  honestly and make retries safe; do not promise rollback of deleted files.
- [ ] Bulk-archive feedback retains the summary and lists every rejected task
  with task ID, title, a navigable task link, and its actionable rejection reason.
  Nested-worktree failures explicitly suggest opening that task and archiving
  individually to review and confirm deletion. No bulk deletion confirmation or
  automatic nested-worktree deletion is required.
- [ ] Cover single and multiple nested worktrees, clean and dirty states,
  untracked and ignored evidence, detached/non-durable and unpushed commits,
  unavailable status, Abort/Proceed, changed previews, cleanup failure/retry,
  and mixed bulk success/failure with application and browser coverage.
- [ ] The dialog, previews, Open actions, and bulk task links are keyboard
  accessible, usable with long paths/many failures and narrow viewports, and
  readable in dark and light themes. Follow the shared SVG icon-button rules
  and geometry coverage if a new icon-button pattern is introduced.

## Investigation context

The read-only Idle Game investigation on 2026-10-26 found six completed tasks
rejected by the nested-worktree guard: T-0133, T-0136, T-0143, T-0144, T-0165,
and T-0168. They demonstrate why the dialog must show more than checkout names:

- T-0133 and T-0144 contained uncommitted reproduction hooks and helper files.
- T-0143 contained an untracked failure log referenced by a maintained report
  and another task's commentary.
- T-0144 and T-0165 contained ignored generated evidence inside the baseline
  checkout, including data differing from checked retained counterparts.
- T-0136 and T-0168 had clean ordinary Git status but ignored build outputs.
- All six baseline HEADs were reachable through named refs; detached HEAD did
  not itself establish a commit-loss risk.

These are historical examples, not current deletion authorization. This issue
does not authorize cleaning up those six tasks or changing their evidence.

## Implementation pointers and related work

- `src/application/internal/git-task-workspace.ts`: nested-worktree guard in
  `removeForArchival`, currently checked before the discard-changes option.
- `src/web/client/BoardPage.tsx`: bulk result feedback currently uses rejection
  counts despite receiving individual reasons.
- `src/web/client/feedback.ts`: existing individual archive rejection feedback.
- [Workspace discovery](../../agent-coordination-framework/issues/31-expose-task-workspace.md),
  [live Git summary](../../agent-coordination-framework/issues/33-show-live-task-workspace-git-state.md),
  and [archival ownership handling](../../agent-coordination-framework/issues/67-archive-differently-owned-worktrees.md)
  supply existing behavior to build on; these resolved issues are not blockers.

## Comments

- 2026-10-27: Created from the user's requested follow-up to the read-only
  investigation. Individual preview/confirmation and per-task bulk failure
  navigation are in scope; implementing the feature and executing cleanup are
  separate work.
