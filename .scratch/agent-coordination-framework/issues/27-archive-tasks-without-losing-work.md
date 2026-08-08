# 27 — Archive Tasks Without Losing Work

**What to build:** A user can remove eligible tasks from normal board views
without deleting their coordination history or losing repository work. Agents
can deliberately inspect completed and archived work, and unarchiving honestly
starts any later workspace from the configured ref.

**Blocked by:** 18 — Let Agents Discover Shared Work; 19 — Inspect and Control a Task; 23 — Recover Queued Work After Restart; 32 — Observe Running Attempts Live

**Status:** ready-for-agent

- [ ] Completed and process-rejected tasks remain visible until the user
  archives them; neither workflow outcome archives automatically.
- [ ] An idle eligible task can be archived individually, including after
  mistaken creation, and completed tasks can be archived in bulk.
- [ ] Archiving is unavailable while the task has active, queued, failed, or
  interrupted activation work or task automation suspension.
- [ ] Workspace cleanup is rejected when staged, modified, or untracked files
  exist or when the current commit lacks a durable Git ref.
- [ ] The framework removes the registered worktree before marking the task
  archived, and any removal failure leaves both task and workspace intact.
- [ ] Cleanup does not infer merge success, require a particular merge target,
  or delete branches; an unmerged durable branch is sufficient to protect the
  commit.
- [ ] Archiving retains task content, final column, comments, relationships,
  attention history, activity, attempts, and thread IDs without an age limit or
  permanent-delete path.
- [ ] Explicit archival deletes all persisted transcript content for every
  attempt of the task together with its task workspace. Entering Completion or
  any other workflow column never deletes a transcript, and archived attempt
  summaries, outcomes, diagnostics, timing, and thread IDs remain honest when
  the detailed transcript is no longer available.
- [ ] Archived tasks leave ordinary board views and default agent listings but
  remain available through explicit history or search and direct related-task
  inspection.
- [ ] Unarchiving does not restore or remember the removed workspace; a later
  activation provisions a new detached worktree from the current process
  default starting ref. It does not restore discarded transcripts.
- [ ] Real-Git and browser tests cover dirty worktrees, missing durable refs,
  cleanup failure, bulk archive, transcript cleanup, historical discovery, and
  unarchive behavior.
