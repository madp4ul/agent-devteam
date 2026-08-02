# Board foundation feasibility spike

This is the bounded implementation for ticket 14. It proves the board-facing
command and query boundary with an authoritative SQLite store, a usable Kanban
overview, a linkable full task page, and an accessible non-drag move action.
It intentionally does not start process automation or dispatch agents; those
belong to ticket 15 and later tickets.

The spike selected the custom-board fallback. See [DECISION.md](./DECISION.md)
for the evidence and decision, and [HANDOFF.md](./HANDOFF.md) for the explicit
ticket-15 preserve/replace/defer guidance. The running UI is deliberately marked
as a feasibility spike: drag-and-drop and production presentation are absent.

## Run locally with Docker Compose

1. Copy `.env.example` to `.env` and set the three host paths. The Codex path
   should contain `auth.json`; it is mounted read-only.
2. Create the configured task-workspace and Codex directories if needed.
3. Run `docker compose up --build` from this directory.
4. Open <http://localhost:8088/>. Open the seeded task and use its **Move task**
   form to move it to any column without dragging.
5. Inspect <http://localhost:8088/api/deployment-capabilities> to confirm that
   the repository, task-workspace, authentication, and project-container
   boundaries are visible inside the deployment.

For a safe feasibility check, an empty placeholder `auth.json` is enough to
prove the read-only mount. Do not mount real credentials into an unreviewed
spike container.

The `project-tool` sidecar represents a project-owned service container. Real
project services can join `board-foundation-coordination-net`; repository and
task-workspace tooling use the configured bind mounts.

## Public spike contract

All mutations require an `Idempotency-Key` and an authored actor in the
`X-Actor: user:<id>` or `X-Actor: agent:<id>` form. The HTML move form supplies
the local single-user identity server-side and derives a retry-stable key from
task/revision/move. Trusted UI, MCP, and runtime adapters are responsible for
supplying actor context; a missing API actor is rejected rather than invented.

- `POST /api/process/apply`
- `GET /api/boards`
- `POST /api/tasks`
- `GET /api/tasks/{id}`
- `POST /api/tasks/{id}/move`
- `POST /api/tasks/{id}/comments`
- `POST /api/tasks/{id}/relationships`
- `POST /api/tasks/{id}/activations/{activation-id}/fail`
- `POST /api/tasks/{id}/attention/{reason-id}/retry`
- `POST /api/tasks/{id}/attention/{reason-id}/dismiss`
- `GET /api/deployment-capabilities`

The application command transaction owns current state, immutable activity,
attention, and resulting activations. UI and future adapters translate through
this boundary instead of writing a second board store.

## Automated checks

The tests use only Python's standard library and a real temporary SQLite
database:

```powershell
python -m unittest discover -s tests -v
```

After `docker compose up -d --build --wait`, exercise the same deployment
boundaries from the running container with:

```powershell
$env:BOARD_SPIKE_COMPOSE_URL = 'http://127.0.0.1:8088'
python -m unittest tests.test_compose_live -v
```

They cover stable identity reapplication, live-task preservation, actor/event
provenance, activation source pointers, atomic/idempotent commands, mentions,
attention and Retry/Dismiss recovery, relationships, removed-column mapping,
the full task route and accessible move interaction,
the rejected Kanboard webhook boundary, and the Compose deployment contract.
