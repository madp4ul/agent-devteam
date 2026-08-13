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

To move an initialized root, stop the application and every agent and use the
dedicated offline command. Run it from the repository so only the destination
is required:

```powershell
node --experimental-strip-types src/cli.ts relocate-state D:\new\project-state
```

The command preserves the complete database and task-workspace Git state,
repairs the repository-local binding and worktree registrations, and leaves the
next application start paused. If it reports an interrupted relocation, rerun
the exact recovery command it prints. See the
[project-state backup, restore, and relocation procedure](../project-state-backup-and-restore.md)
for exceptional cleanup guidance.

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

Back up, restore, or relocate retained state using the
[project-state state-management procedure](../project-state-backup-and-restore.md).

The application uses the installed Codex SDK and the user's existing Codex
authentication, sandbox, web-search, command-network, project, and unrelated
MCP configuration. Because framework-launched runs are unattended, every run
sets `approval_policy = "on-request"` and
`approvals_reviewer = "auto_review"`. Auto-review evaluates one scoped
boundary crossing at a time; it does not widen writable roots, bypass managed
policy, or guarantee approval.

Every dispatched run also supplies the exact current task-workspace path as
process-local Git trust. It never sets `safe.directory=*` or edits Git
configuration. This allows the sandbox identity to inspect Git without a
first-command ownership failure. Linked-worktree branch, stage, and commit
operations normally cross protected Git metadata and are retried only after
scoped Auto-review. Process roles provide behavioral instructions only and do
not grant additional technical access.

If a required escalation remains denied or unavailable, the agent reports a
permission block and the task requires attention. Continue requires a message
describing the exact retry the user authorizes or the external action/policy
change already made. That message is supplied to the resumed Codex thread so
Auto-review can assess the retry with explicit user context; Continue is not a
policy bypass and can be denied again.
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
