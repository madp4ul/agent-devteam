# Agent Coordination Framework

This repository contains the first production TypeScript vertical slice of the
local Agent Coordination Framework. It loads a version-controlled YAML process,
validates it, constructs product-owned boards in SQLite, appends each board's
framework-owned Completion column, and starts with automation paused.

Requirements: Node.js 24 or later and pnpm.

```sh
pnpm install
pnpm validate:example
pnpm start -- --process examples/software-delivery/process.yaml
```

Open `http://127.0.0.1:3000`. See the
[process-definition reference](docs/process-definition-reference.md) and
[start-a-process tutorial](docs/tutorials/start-a-process.md) for authoring and
startup details.

This slice does not dispatch agents. Codex threads, task workspaces, activation
lifecycle, retries, and drag-and-drop are intentionally deferred. Task movement
uses the permanent accessible select-and-submit interaction.
