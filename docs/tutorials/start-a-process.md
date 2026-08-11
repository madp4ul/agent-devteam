# Tutorial: author, validate, and start a process

This developer tutorial runs the TypeScript application from source. It starts
from the supplied software-delivery example and ends with a visible, paused
local board. The planned production distribution is self-contained and will not
require users to install this development toolchain.

## 1. Install the TypeScript application dependencies

First complete the [development setup](../development-setup.md) to install and
verify Node.js 24 LTS and pnpm 11.9.0. Then, from the repository root, install
the locked dependencies:

```sh
pnpm install --frozen-lockfile
```

## 2. Copy or inspect the example

The example definition is
[`examples/software-delivery/process.yaml`](../../examples/software-delivery/process.yaml).
Its first-line JSON Schema modeline enables completion and structural feedback
in editors backed by YAML Language Server. Agent instructions sit beside it in
the `agents/` directory and are referenced from the YAML.

When creating another process, give boards, columns, and agents stable lowercase
IDs. Edit display names freely, but keep an ID when the entity is still the same
thing. Define only workflow columns; the framework owns Completion.

## 3. Validate before startup

```sh
pnpm validate:example
```

A successful command prints `Valid process definition` and its semantic
version. To see actionable diagnostics, temporarily change a `watchingAgent` to
an undeclared ID and validate again. Restore the value before continuing.

## 4. Start the local application

On Windows, use the repository launcher from a normal, non-elevated terminal
running as the account that owns the checkout:

```powershell
.\examples\software-delivery\start.cmd
```

This is the preferred source-based entry point for the supplied example until
the planned self-contained distribution replaces the development toolchain. It
anchors paths to the repository root, checks that pnpm and Git are available to
the current account, builds the browser application, and then starts the
software-delivery process with its durable state in the bound sibling
`<repository>-agent-coordination-state` directory. The launcher never changes
Git's global trust configuration.

On other hosts, or when invoking the development command directly, use:

```sh
pnpm start -- --process examples/software-delivery/process.yaml --project .
```

The first start binds the repository clone to the sibling
`<repository>-agent-coordination-state`, which contains `coordination.sqlite3`
and `task-worktrees/`. The binding is stored in repository-local Git config.
Use `--state-root <path>` only on first initialization to choose a different
root. Later starts reuse the binding and reject attempts to redirect it. The
default address is `http://127.0.0.1:3000`.

The Windows launcher passes host and port arguments through to the application,
so the equivalent address override is:

```powershell
.\examples\software-delivery\start.cmd --host 127.0.0.1 --port 3100
```

The direct cross-platform command remains:

```sh
pnpm start -- --process examples/software-delivery/process.yaml --project . --host 127.0.0.1 --port 3100
```

### Reset the Windows example state

During pre-release testing, the example database and Git worktree registrations
may be discarded together. Stop the application, then run:

```powershell
.\examples\software-delivery\reset-state.cmd
```

The reset prints its two exact targets and requires typing `RESET`. It removes
the example's registered task worktrees, deletes their workspace root, prunes
stale worktree registrations, and deletes the database together with its SQLite
sidecar files. It does not delete other `.data` databases or worktrees outside
the example's dedicated workspace root. The Git prune step may also discard
administrative registrations for other worktrees whose directories are already
missing; it never deletes an existing worktree. For non-interactive local
automation, pass `--yes` only after independently confirming the printed paths.

The page shows `Automation paused`, the process fingerprint, all configured
columns in order, and a final unwatched Completion column. Inspect the board,
then use **Resume automation** explicitly. Restarting the application returns
the process to paused.

If startup finds invalid YAML, a missing instruction file, duplicate identity,
unknown watcher, or schema violation, the same address opens in Configuration
error mode. Correct the source-located diagnostic and restart. The application
does not expose a prior definition or accept board mutations while the
configuration is invalid.

Pointer drag-and-drop is intentionally deferred. Task details retain a labeled
destination selector and **Move task** button as the permanent keyboard- and
assistive-technology-friendly movement path.

## 5. Resume Codex automation

`--project` selects the Git repository whose task worktrees Codex will change.
Its bound project state root is authoritative for both the coordination
database and detached task worktrees. Startup checks that binding, database
records, directories, and Git registrations agree before it permits mutation
or dispatch. A missing or inconsistent root enters Configuration error mode;
startup never adopts, reconstructs, deletes, or substitutes state.

Back up and restore retained state using the
[project-state backup and restore procedure](../project-state-backup-and-restore.md).

The application uses the installed Codex SDK and the user's existing Codex
authentication, sandbox, and approval configuration. Every dispatched run also
supplies the exact current task-workspace path as process-local Git trust. It
never sets `safe.directory=*`, edits Git configuration, or modifies the user's
Codex configuration. This allows the sandbox identity to inspect Git without a
first-command ownership failure; branch, stage, and commit operations remain
subject to the user's ordinary Codex permissions. Process roles provide
behavioral instructions only and do not grant additional technical access.
When **Resume automation** is accepted, the header changes to Automation
running. If the runtime is unavailable or a worktree cannot be provisioned,
the page remains paused and displays an actionable error.

Each new activation starts a Codex thread in its task worktree. After a host
interruption, recovery retains the activation at the head of its queue and
resumes its prior thread when available. The agent can
orient through board summaries, page through explicitly selected columns,
inspect shared tasks and collaborator summaries, and load task activity or
attachments on demand. Idempotent comments and movement stay scoped to the
activation's current task.
