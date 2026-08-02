# Tutorial: author, validate, and start a process

This tutorial starts from the supplied software-delivery example and ends with
a visible, paused local board.

## 1. Install the TypeScript application dependencies

From the repository root, use Node.js 24 or later:

```sh
pnpm install
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
pnpm start -- --process examples/software-delivery/process.yaml
```

The default database is `.data/coordination.sqlite3` and the default address is
`http://127.0.0.1:3000`. Override them when needed:

```sh
pnpm start -- --process examples/software-delivery/process.yaml --database .data/tutorial.sqlite3 --host 127.0.0.1 --port 3100
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
