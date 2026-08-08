# 33 — Show Live Task-Workspace Git State

**What to build:** Extend the task-workspace section with an automatically
updating Git summary so a user can see repository changes while an agent works
without opening an external Git client.

**Blocked by:** 31 — Expose a Task's Workspace

**Status:** open

- [ ] Evaluate and define the smallest useful summary of the workspace's current
  branch or detached HEAD, commit, clean/dirty state, staged files, modified
  files, and untracked files.
- [ ] Decide how frequently state should refresh during an active attempt and
  how to avoid expensive repository scans or noisy UI updates on large
  workspaces.
- [ ] Distinguish authoritative workspace consistency from ordinary Git working
  state: a dirty workspace can be healthy, while a missing registration is a
  startup consistency error owned by issue 23.
- [ ] Preserve the basic path, Copy path, and Open workspace experience from
  issue 31 when Git status is slow or temporarily unavailable.
- [ ] Evaluate disk-usage and richer file-change presentation separately; they
  are possibilities, not acceptance criteria until their value and cost are
  understood.

## Comments

- Keep this issue lower priority than basic workspace discovery. It deliberately
  captures the richer direction without bloating issue 31's first useful task
  workspace section.
- Run another focused grilling or prototype before marking this issue
  ready-for-agent; the desired refresh behavior and presentation have not yet
  been validated.
