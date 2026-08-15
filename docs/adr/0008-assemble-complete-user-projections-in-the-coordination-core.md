# Assemble complete user projections in the coordination core

Status: accepted

Assemble complete user-facing board and task-detail projections behind the
authoritative coordination application interface. The web adapter serializes
those results and maps transport status, but it does not coordinate lower-level
queries or reconstruct related coordination state.

This keeps knowledge about which task, relationship, conversation, attention,
automation, and process facts form one user view with the same authority that
owns those facts. It also gives application and adapter tests one stable seam
for the complete projection.

## Consequences

- Adding a fact to a complete user view changes the coordination projection and
  its shared transport contract rather than duplicating assembly in the host.
- Agent-facing compact discovery remains separate from user-facing projections.
- Transport-specific decoding and status codes remain in the web adapter.
- The coordination application implementation may internally compose focused
  projection modules without changing this authoritative interface.
