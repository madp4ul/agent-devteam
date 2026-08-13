# Agent Coordination Framework

This repository contains the first production TypeScript slices of the local
Agent Coordination Framework. It loads a version-controlled YAML process,
persists product-owned boards and activations in SQLite, provisions an isolated
Git worktree per task, and dispatches watched-column work through the Codex SDK.

For the implemented system structure, module boundaries, state ownership, and
end-to-end execution flows, see the [architecture overview](docs/architecture.md).

Development from source requires Node.js 24 or later and pnpm 11.9.0. Follow the
[development setup guide](docs/development-setup.md) when preparing a machine.
The planned production distribution is a self-contained host-native
application; users will not need the TypeScript development toolchain. See
[ADR 0002](docs/adr/0002-self-contained-host-native-distribution.md).

On Windows, the preferred source launcher for the supplied example is:

```powershell
pnpm install --frozen-lockfile
pnpm validate:example
.\examples\software-delivery\start.cmd
```

The launcher checks that pnpm and Git are usable by the current Windows
account, builds the browser application, and starts the software-delivery
example. Other hosts can use the equivalent `pnpm build` and `pnpm start`
commands documented in the tutorial.

During pre-release testing, stop the application and run
`.\examples\software-delivery\reset-state.cmd` to explicitly discard the bound
project state root and its registered task worktrees.

Open `http://127.0.0.1:3000`. See the
[process-definition reference](docs/process-definition-reference.md) and
[start-a-process tutorial](docs/tutorials/start-a-process.md) for authoring and
startup details. The [agent MCP tool reference](docs/agent-mcp-reference.md)
lists every coordination tool and its response contract. To exercise the
complete architecture-led example, follow the
[software-delivery proof procedure](docs/tutorials/prove-software-delivery-workflow.md).

Every startup remains paused until the user explicitly resumes automation.
Each repository clone is bound to one sibling project state root containing its
database and task worktrees; startup fails closed when that retained state is
inconsistent. Each distinct activation starts a Codex thread with the user's
existing authentication, sandbox, web, network, project, and MCP capabilities.
For these unattended runs, the framework sets Codex approval policy to
`on-request` with `auto_review`; managed restrictions can still deny an action.
It also adds the exact task-workspace path as process-local Git trust so the
sandbox identity can inspect that worktree without changing Git configuration.
The project-scoped MCP surface provides summary-first board discovery,
explicit-column paginated task overviews, full task and on-demand history
inspection, and collaborator summaries. The React board
supports task creation, linkable task details, unified history, attempt
transcripts, revision-checked editing and movement, and Atlassian Pragmatic
Drag and Drop. The contextual non-drag move chooser remains the permanent
keyboard and assistive-technology path.
