# Ticket 15 handoff

Deployment note: [ADR 0002](../../docs/adr/0002-self-contained-host-native-distribution.md)
supersedes this handoff's container-specific production assumption. Preserve
application access to the repository, task workspaces, Codex authentication,
and project containers, but provide that access through the self-contained
host-native application rather than requiring a container boundary.

Ticket 14 answered the board-foundation feasibility question. It did not create
the production application. Ticket 15 should use this spike as executable
evidence for the coordination contract and establish the real TypeScript
application around that contract.

## Preserve

Preserve these decisions and observable behaviors:

- the product-owned board and authoritative relational coordination state;
- the application-level command-and-query seam shared by every adapter;
- atomic current-state, immutable-activity, attention, and activation changes;
- explicit actor provenance, optimistic revisions, and idempotency;
- stable process entity IDs, framework-owned Completion columns, retired boards,
  unmapped tasks, and user-only remapping;
- linkable task details and accessible non-drag movement;
- application access to the project repository, task workspaces, Codex
  authentication, and project containers; and
- the behavioral scenarios captured by the spike's integration tests.

These are interface obligations. Ticket 15 tests should restate them at the
production application's seam without depending on the spike implementation.

## Replace

Do not promote these spike implementation choices into production by default:

- the Python standard-library HTTP server;
- the Python module layout and individual HTTP routes;
- server-rendered demonstration templates and styling;
- the hand-written spike SQLite schema and migration mechanism;
- caller-supplied demonstration actor headers;
- placeholder authentication, seeded demo process, and project-tool sidecar;
  and
- tests that import the Python implementation directly.

The production implementation should be TypeScript. This aligns the application
with the planned TypeScript Codex SDK and the custom board's future Atlassian
Pragmatic Drag and Drop integration.

## Defer

Ticket 15 should not absorb later lifecycle work:

- pointer drag-and-drop and production visual design;
- agent activation dispatch, Codex threads, attempts, retries, and interruption;
- task-workspace provisioning and cleanup; and
- notification delivery or the complete task-control experience.

The accessible Move control remains required while drag-and-drop is deferred.

## Production seam for ticket 15

Create one deep application module whose interface lets callers validate a
process definition, start the application, query the resulting boards and
diagnostics, and request resume. Its interface owns the invariants and error
modes; it must not expose parser, fingerprinting, migration, storage-table, or
scheduler details.

At startup the module returns exactly one observable mode:

- **Paused**: the definition is valid, its semantic fingerprint and ordered
  boards are available, every board has its Completion column, and no attempt
  can start until explicit resume.
- **Configuration error**: actionable diagnostics are available, no agent can
  dispatch, and board mutation is rejected.

The web UI is the first adapter at this seam. Future MCP and Codex-runtime
adapters must call the same module. Tests cross the same interface as callers,
using real validation and relational storage with local test substitutes only
for genuine external dependencies.
