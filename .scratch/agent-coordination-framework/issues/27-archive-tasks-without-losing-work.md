# 27 — Archive Tasks Without Losing Work

**What to build:** A user can remove eligible tasks from normal board views
without deleting their coordination history or losing repository work. Agents
can deliberately inspect completed and archived work, and unarchiving honestly
starts any later workspace from the configured ref.

**Blocked by:** 18 — Let Agents Discover Shared Work; 19 — Inspect and Control a Task; 23 — Recover Queued Work After Restart; 32 — Observe Task Activity and Running Attempts Live

**Status:** resolved

- [x] Completed and process-rejected tasks remain visible until the user
  archives them; neither workflow outcome archives automatically.
- [x] An idle eligible task can be archived individually, including after
  mistaken creation, and completed tasks can be archived in bulk.
- [x] Archiving is unavailable while the task has active, queued, failed, or
  interrupted activation work or task automation suspension.
- [x] Workspace cleanup is rejected when staged, modified, or untracked files
  exist unless the user explicitly confirms their permanent deletion. Cleanup
  remains rejected when the current commit lacks a durable Git ref.
- [x] The framework removes the registered worktree before marking the task
  archived, and any removal failure leaves both task and workspace intact.
- [x] Cleanup does not infer merge success, require a particular merge target,
  or delete branches; an unmerged durable branch is sufficient to protect the
  commit.
- [x] Archiving retains task content, final column, comments, relationships,
  attention history, activity, attempts, and thread IDs without an age limit or
  permanent-delete path.
- [x] Explicit archival deletes all persisted transcript content for every
  attempt of the task together with its task workspace. Entering Completion or
  any other workflow column never deletes a transcript, and archived attempt
  summaries, outcomes, diagnostics, timing, and thread IDs remain honest when
  the detailed transcript is no longer available.
- [x] Archived tasks leave ordinary board views and default agent listings but
  remain available through explicit history or search and direct related-task
  inspection.
- [x] Unarchiving does not restore or remember the removed workspace; a later
  activation provisions a new detached worktree from the current process
  default starting ref. It does not restore discarded transcripts.
- [x] Real-Git and browser tests cover dirty worktrees, missing durable refs,
  cleanup failure, bulk archive, transcript cleanup, historical discovery, and
  unarchive behavior.

## Answer

Tasks now have explicit, idempotent individual archive and unarchive commands,
plus a bulk action that revalidates each completed task immediately before its
cleanup. A durable per-task archival claim prevents direct mutations and
indirect blocker-cleared activations while Git cleanup is in progress. Startup
reconciles interrupted claims on both sides of worktree removal: intact
workspaces are released for retry, successfully removed worktrees complete the
original archival command, and inconsistent states continue to fail closed.

Git cleanup rejects staged, modified, and untracked files and requires the
current commit to be reachable from a durable ref. It removes only the
registered worktree, never branches. Successful archival retains the complete
coordination record and attempt summaries while deleting task-workspace state,
custom starting-ref state, and all persisted transcript content. Archived work
is absent from normal board and agent listings but remains available through an
explicit browser history panel, direct task inspection, and the
`list_archived_tasks` agent tool.

Unarchive restores the task record without a workspace or discarded
transcripts. A later activation provisions a fresh detached worktree from the
current process default starting ref.

Both TypeScript typechecks, the production build, 119 local tests with one
intentional credentialed integration skip, and all 25 browser scenarios pass.
Independent Standards and Spec reviews report no remaining findings.

## User review follow-up

- Archive and unarchive timeline entries must describe archival behavior rather
  than falling through to the generic `Attempt activity` message.
- On task details, Archive is a primary action only for tasks in Completion.
  Other eligible tasks retain archival through a deliberately secondary,
  non-promoting action.
- Remove archive/history actions from the automation status control so that
  pause, current runs, and desktop notifications remain readable at narrower
  widths.
- Put bulk archival in each non-empty Completion row or column and scope it to
  that board's completed tasks.
- Replace the detached archived-task section with a toggle beside task search.
  Turning it on places archived cards back in their retained board/column
  locations; turning it off hides them again.
- Give archived cards an explicit visual treatment and badge whose design is
  echoed by the archive toggle, while preventing archived cards from being
  dragged.
- Compact the oversized board title area into a regular responsive application
  bar without removing automation, run, or notification controls.

## User review outcome

The archive and unarchive events now use task-specific timeline descriptions.
Archive remains directly promoted on completed task details and is available
through a secondary disclosure elsewhere.

Bulk archive is scoped to a board and appears inside that board's non-empty
Completion lane. Archived visibility is a reversible toggle beside task search;
enabled archived cards return to their retained lanes with a matching visual
treatment, explicit badge, and no drag affordance. The detached archive panel
and both archive buttons in the automation control were removed, and the board
header was compacted into a responsive application bar.

Typechecks, the production build, 119 local tests with one intentional skip,
and all 26 browser scenarios pass. The interaction was also verified visually
at desktop and narrow widths in the application browser.

## Second user review follow-up

- In row layout, place the non-empty Completion lane's Archive action below
  its title instead of beside the title/count controls; it must not widen the
  header area shared by every workflow row.
- When individual archival is rejected because the task workspace is dirty,
  offer an explicit destructive confirmation. Confirming permits the framework
  to force-remove that workspace, including staged, modified, and untracked
  files, before completing archival.
- Keep active, queued, failed, interrupted, and automation-suspended work as
  hard archival blockers. Defining safe activation cancellation is deferred.

The Completion action now has its own line beneath the lane heading. Dirty
workspace archival remains fail-closed on the initial request and proceeds only
after a confirmation that states uncommitted files, the workspace, and retained
transcripts will be permanently removed. Commit durability and automation
eligibility checks are unchanged.

The final validation passed both TypeScript typechecks, the production build,
119 local tests with one intentional integration skip, and all 27 browser
scenarios. Standards and Spec review found no remaining issues.

## Third user review follow-up

- Successful individual archival keeps the user on the task details page and
  refreshes that page into its archived state instead of returning to the
  board automatically.
- Board navigation context retains archived visibility together with the task
  filter, layout, and scroll position. Returning from details restores those
  controls for that board visit without turning them into global preferences.

Both settings now travel in the same browser-history context used by the
existing board return flow. Directly opened task URLs still return to the
ordinary default board because no prior board context exists.

Archived visibility is explicit user intent rather than inferred from loaded
archive data. Delayed archive responses are invalidated when that intent
changes, so they cannot re-enable a toggle the user switched off. Final
validation passed both TypeScript typechecks, the production build, 119 local
tests with one intentional integration skip, and all 28 browser scenarios.
Standards and Spec review found no remaining issues.
