# 31 — Expose a Task's Workspace

**What to build:** A user can understand whether a task workspace exists, find
its physical Git worktree, and open it in ordinary development tools without
leaving the task-details context or knowing Git worktree commands.

**Blocked by:** 19 — Inspect and Control a Task; 23 — Recover Queued Work After Restart

**Status:** resolved

- [x] Task details contain a dedicated **Task workspace** section. The product
  uses *task workspace* for the user-facing concept and explains that Git
  implements it as a worktree where useful.
- [x] Before provisioning, the section says that no workspace exists yet and
  explains that one will be created before the first runnable activation. It
  never implies that an unused task consumes a checkout.
- [x] After provisioning, the section shows the absolute workspace location,
  persisted starting ref, and starting commit in a readable, copyable form.
- [x] **Copy path** copies the exact workspace directory without requiring the
  user to select terminal output or inspect application configuration.
- [x] **Open workspace** opens the verified task-workspace directory through a
  supported host-native action so the user's ordinary editor, file explorer,
  and Git tools can inspect the agent's files. Failure is reported in context
  and never falls back to another checkout.
- [x] The displayed path comes from authoritative bound project state and is
  consistent across navigation and host restart.
- [x] This slice does not continuously query branch, index, working-tree file,
  disk-usage, or command-progress state. Rich live Git state belongs to issue
  33 rather than being hidden inside the basic discovery feature.
- [x] Application and browser tests cover unprovisioned and provisioned tasks,
  copy/open actions, unavailable host integration, direct task reopening, and
  paths containing spaces.

## Comments

- This requirement arose when a real agent created `test.txt` in a detached
  task worktree but the user could not discover the file from the board or task
  page. Opening the task workspace in the user's existing Git tools is the
  intended bridge; the framework does not need to reproduce an IDE.

## Answer

Task details now include a dedicated Task workspace section. Before lazy
provisioning it explains when the Git worktree will be created; afterward it
shows the persisted absolute path, starting ref, and starting commit, with
exact-path Copy and Open actions. Open re-verifies that the persisted directory
is the task's registered project worktree before invoking the supported native
host action, while unavailable or failed host integration is reported in the
task context without opening another checkout.

The user-only workspace projection remains stable across navigation and host
restart and does not add live Git-status queries or change the agent inspection
contract. Application, web-adapter, host-integration, restart, and browser
coverage includes lazy and provisioned tasks, direct reopening, paths with
spaces, exact copying/opening, and unavailable integration. Final verification
passed both TypeScript typechecks, 99 local tests with one intentional
credentialed integration skip, the production build, all 17 browser scenarios,
`git diff --check`, and independent Standards and Spec reviews after their
findings were resolved.
