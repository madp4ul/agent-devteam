# 26 — Evolve Process Definitions Safely

**What to build:** A user can restart with a changed process definition without
silently reinterpreting live tasks or running old activations under new roles.
Removed workflow state remains visible and recoverable, and compatible stale
work resumes only after explicit process-level approval.

**Blocked by:** 15 — Start a Validated, Paused Process; 23 — Recover Queued Work After Restart

**Status:** ready-for-agent

- [ ] Renaming or reordering a board, workflow column, or agent preserves live
  identity, while changing its stable ID removes one entity and introduces
  another.
- [ ] A non-completed task whose saved workflow column disappears becomes a
  conspicuous unmapped task with its former identities and history preserved.
- [ ] Unmapped tasks are excluded from agent queries, cannot run agents, and
  create no activations from new mentions; only the user can move them into a
  defined workflow column.
- [ ] Restoring the same workflow-column identity remaps tasks without creating
  activations or replaying historical events.
- [ ] Removing a board with live state retires it; completed tasks remain
  inspectable, unfinished tasks become unmapped, and restoring the board ID
  restores matching state without activation.
- [ ] Applying a new semantic process version marks every older queued, failed,
  or interrupted activation stale and prevents automatic dispatch or retry.
- [ ] The startup impact view identifies stale activations, unmapped tasks, and
  targets whose agent identity no longer exists.
- [ ] One Resume with current process action rebases compatible stale
  activations while preserving original reason, source event, order, and target
  ID and using current instructions for new attempts.
- [ ] Removed target agents require individual dismissal, and activations on
  unmapped tasks remain dormant.
- [ ] Loading or restoring a definition never synthesizes activations from
  existing watchers, mappings, comments, relationships, or board state.
- [ ] Behavioral and browser tests cover rename, removal, restoration, process
  rebase, unusable target, and unmapped-task recovery.

