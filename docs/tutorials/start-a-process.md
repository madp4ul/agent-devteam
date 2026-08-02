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

```sh
pnpm start -- --process examples/software-delivery/process.yaml --project .
```

The default database is `.data/coordination.sqlite3` and the default address is
`http://127.0.0.1:3000`. Override them when needed:

```sh
pnpm start -- --process examples/software-delivery/process.yaml --database .data/tutorial.sqlite3 --project . --task-workspaces ../agent-devteam-task-workspaces --host 127.0.0.1 --port 3100
```

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
`--task-workspaces` selects the framework-owned root for those detached
worktrees and should be outside the selected checkout. If omitted, it defaults
to a sibling named `<project>-task-workspaces`.

The application uses the installed Codex SDK and the user's existing Codex
authentication, sandbox, and approval configuration. Process roles provide
behavioral instructions only; they do not grant additional technical access.
When **Resume automation** is accepted, the header changes to Automation
running. If the runtime is unavailable or a worktree cannot be provisioned,
the page remains paused and displays an actionable error.

Each activation starts a fresh Codex thread in its task worktree. The agent can
inspect only its current task, add an idempotent authored comment, and move that
task through the initial project-scoped MCP surface.
