# Agent Coordination Framework

This repository contains the first production TypeScript slices of the local
Agent Coordination Framework. It loads a version-controlled YAML process,
persists product-owned boards and activations in SQLite, provisions an isolated
Git worktree per task, and dispatches watched-column work through the Codex SDK.

Development from source requires Node.js 24 or later and pnpm 11.9.0. Follow the
[development setup guide](docs/development-setup.md) when preparing a machine.
The planned production distribution is a self-contained host-native
application; users will not need the TypeScript development toolchain. See
[ADR 0002](docs/adr/0002-self-contained-host-native-distribution.md).

```sh
pnpm install --frozen-lockfile
pnpm validate:example
pnpm build
pnpm start -- --process examples/software-delivery/process.yaml --project .
```

Open `http://127.0.0.1:3000`. See the
[process-definition reference](docs/process-definition-reference.md) and
[start-a-process tutorial](docs/tutorials/start-a-process.md) for authoring and
startup details.

Every startup remains paused until the user explicitly resumes automation.
Each distinct activation starts a fresh Codex thread with the user's existing
sandbox and approval policy. The project-scoped MCP surface provides summary-
first board discovery, explicit-column paginated task overviews, full task and
on-demand history inspection, and collaborator summaries. The React board
supports task creation, linkable task details, unified history, attempt
transcripts, revision-checked editing and movement, and Atlassian Pragmatic
Drag and Drop. The contextual non-drag move chooser remains the permanent
keyboard and assistive-technology path.
