# 26 — Evolve Process Definitions Safely

**What to build:** A user can restart with a changed process definition without
silently reinterpreting live tasks or running old activations under new roles.
Removed workflow state remains visible and recoverable, and compatible stale
work resumes only after explicit process-level approval.

**Blocked by:** 15 — Start a Validated, Paused Process; 23 — Recover Queued Work After Restart

**Status:** resolved

- [x] Renaming or reordering a board, workflow column, or agent preserves live
  identity, while changing its stable ID removes one entity and introduces
  another.
- [x] A non-completed task whose saved workflow column disappears becomes a
  conspicuous unmapped task with its former identities and history preserved.
- [x] Unmapped tasks are excluded from agent queries, cannot run agents, and
  create no activations from new mentions; only the user can move them into a
  defined workflow column.
- [x] Restoring the same workflow-column identity remaps tasks without creating
  activations or replaying historical events.
- [x] Removing a board with live state retires it; completed tasks remain
  inspectable, unfinished tasks become unmapped, and restoring the board ID
  restores matching state without activation.
- [x] Applying a new semantic process version marks every older queued, failed,
  or interrupted activation stale and prevents automatic dispatch or retry.
- [x] The startup impact view identifies stale activations, unmapped tasks, and
  targets whose agent identity no longer exists.
- [x] One Resume with current process action rebases compatible stale
  activations while preserving original reason, source event, order, and target
  ID and using current instructions for new attempts.
- [x] Removed target agents require individual dismissal, and activations on
  unmapped tasks remain dormant.
- [x] Loading or restoring a definition never synthesizes activations from
  existing watchers, mappings, comments, relationships, or board state.
- [x] Behavioral and browser tests cover rename, removal, restoration, process
  rebase, unusable target, and unmapped-task recovery.

## Answer

Implemented stable-ID process evolution over retained coordination state. Each
activation now records its originating process-definition version; semantic
changes mark queued, failed, and user-interrupted work stale, persist a startup
impact across restarts, and block ordinary Resume until the user either approves
current-process execution or dismisses activations individually. Approval keeps
the original target, reason, source event, and queue order while new attempts use
the current agent instructions.

Removed columns and boards retain their identities and history. Unfinished tasks
become user-recoverable unmapped tasks that are excluded from agent discovery and
dispatch, while completed tasks on retired boards remain directly inspectable.
Restoring stable IDs remaps retained state without replaying comments, watchers,
relationships, or historical events. The browser presents stale activations,
missing targets, former locations, dismissal, remapping, and Resume with current
process through the shared application command/query seam.

Verification passed 94 automated tests with one credentialed Codex test skipped,
the production build, 16 browser scenarios, and `git diff --check`. Parallel
Standards and Spec reviews found no remaining issue after their findings were
addressed.
