# 15 — Start a Validated, Paused Process

**What to build:** A user can start the local application with a
version-controlled process definition, see its boards and framework-owned
Completion columns, and inspect actionable configuration diagnostics. A valid
process starts with automation paused; an invalid process starts no automation
and permits no board mutation.

**Blocked by:** 14 — Establish the Board Foundation

**Status:** resolved

## Production starting point

Implement this ticket as the first production TypeScript vertical slice; do not
extend the ticket-14 Python spike as the product. Preserve the spike's proven
behavioral contracts while replacing its server, routes, templates, schema,
placeholder authentication, and demo fixtures as described in the
[ticket-15 handoff](../../../spikes/board-foundation/HANDOFF.md) and
[ADR 0001](../../../docs/adr/0001-product-owned-board-and-authoritative-coordination-state.md).

Place validation, semantic fingerprinting, startup mode, board construction,
and mutation gating behind one deep application module at the logical
command-and-query seam. The web UI and future MCP and Codex-runtime adapters
must use that same interface. Its startup result is either Paused with a valid
applied process or Configuration error with actionable diagnostics and no
dispatch or board mutation. Keep accessible non-drag movement; Pragmatic Drag
and Drop and production visual design remain deferred.

- [x] Schema-backed structured definitions describe boards, workflow columns,
  agents, roles, stable entity IDs, coordination guidance, and a default task
  workspace starting ref while referencing long-form agent instructions.
- [x] Validation is available explicitly and at startup and reports the source
  location, invalid value, violated rule, consequence, and a safe correction
  when one is known.
- [x] A valid definition produces ordered boards with exactly one permanently
  last, permanently unwatched Completion column per board.
- [x] The applied process receives a semantic fingerprint that includes
  referenced instructions and ignores non-semantic formatting differences.
- [x] An invalid definition enters configuration-error mode with no agent
  dispatch and no board mutation rather than using a previous definition.
- [x] Every application startup visibly begins with process automation paused
  and requires an explicit resume action before attempts can start.
- [x] Reference documentation, a tutorial, and an example process let a user
  author and validate a definition with ordinary editor tooling.
- [x] Application-boundary tests cover valid startup, invalid startup, stable
  identities, Completion-column invariants, and semantic version calculation.

## Answer

Implemented the first production TypeScript vertical slice behind the shared
application command-and-query seam. Schema-backed process definitions now
validate with actionable diagnostics, produce semantic fingerprints that
include referenced instructions, construct ordered boards with framework-owned
Completion columns, and start in either Paused or Configuration error mode.
Invalid configuration rejects board mutation, and valid startup requires an
explicit resume before automation can begin. The CLI, reference documentation,
tutorial, example process, and application-boundary tests cover the delivered
authoring and startup workflow.
