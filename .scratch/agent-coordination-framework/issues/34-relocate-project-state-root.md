# 34 — Relocate a Project State Root

**What to build:** Let a user explicitly move an initialized project's complete
coordination state to another location without losing database history,
uncommitted task-workspace files, or Git worktree registrations.

**Blocked by:** 23 — Recover Queued Work After Restart

**Status:** open

- [ ] Define a guarded relocation workflow that operates only on the project
  state root identified by the existing project state binding and never treats
  an edited startup path as an implicit migration request.
- [ ] Preserve the coordination database, every task workspace, and uncommitted
  or detached Git state while repairing Git's linked-worktree location metadata
  and updating the project state binding.
- [ ] Decide the required pause, free-space, destination, backup, rollback, and
  interrupted-relocation checks before implementation.
- [ ] The old binding remains authoritative until the moved database,
  directories, and every Git registration validate together at the destination.
- [ ] A failed or interrupted move must not make the framework initialize empty
  state, adopt an unrelated directory, or leave both locations independently
  runnable.
- [ ] Document any supported manual relocation procedure if a dedicated product
  action is not justified by usage.

## Comments

- Git records linked-worktree locations in the primary repository, so moving a
  state directory with ordinary filesystem tools is insufficient. The
  coordination store also currently records absolute workspace paths.
- This is intentionally lower priority than establishing the persistent binding
  and startup consistency checks. Run a separate requirements session before
  marking it ready-for-agent; relocation may not be needed in the first usable
  version.
