# 31 — Expose a Task's Workspace

**What to build:** A user can understand whether a task workspace exists, find
its physical Git worktree, and open it in ordinary development tools without
leaving the task-details context or knowing Git worktree commands.

**Blocked by:** 19 — Inspect and Control a Task; 23 — Recover Queued Work After Restart

**Status:** ready-for-agent

- [ ] Task details contain a dedicated **Task workspace** section. The product
  uses *task workspace* for the user-facing concept and explains that Git
  implements it as a worktree where useful.
- [ ] Before provisioning, the section says that no workspace exists yet and
  explains that one will be created before the first runnable activation. It
  never implies that an unused task consumes a checkout.
- [ ] After provisioning, the section shows the absolute workspace location,
  persisted starting ref, and starting commit in a readable, copyable form.
- [ ] **Copy path** copies the exact workspace directory without requiring the
  user to select terminal output or inspect application configuration.
- [ ] **Open workspace** opens the verified task-workspace directory through a
  supported host-native action so the user's ordinary editor, file explorer,
  and Git tools can inspect the agent's files. Failure is reported in context
  and never falls back to another checkout.
- [ ] The displayed path comes from authoritative bound project state and is
  consistent across navigation and host restart.
- [ ] This slice does not continuously query branch, index, working-tree file,
  disk-usage, or command-progress state. Rich live Git state belongs to issue
  33 rather than being hidden inside the basic discovery feature.
- [ ] Application and browser tests cover unprovisioned and provisioned tasks,
  copy/open actions, unavailable host integration, direct task reopening, and
  paths containing spaces.

## Comments

- This requirement arose when a real agent created `test.txt` in a detached
  task worktree but the user could not discover the file from the board or task
  page. Opening the task workspace in the user's existing Git tools is the
  intended bridge; the framework does not need to reproduce an IDE.

