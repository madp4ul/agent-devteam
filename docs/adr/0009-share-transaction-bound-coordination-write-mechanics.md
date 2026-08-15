# Share transaction-bound coordination write mechanics

Status: accepted

Use shared internal modules for durable activity, attention evidence, eligible
notification recording, and idempotent command responses. Supply those modules
with the coordination database connection while leaving each workflow as the
owner of its SQLite transaction and domain decisions.

The shared modules hide repeated storage mechanics and invariant ordering. They
do not become independent state owners, open their own transactions, or expose
new application interfaces. Workflows that cross external operations explicitly
replay and retain command results around those phases instead of holding a
database transaction open.

## Consequences

- Storage-shape changes for activity, attention, and command responses remain
  local to one implementation.
- A workflow still decides when evidence exists and which result is retained.
- Attention, its provenance activity, and any eligible notification remain in
  the caller's authoritative transaction.
- Idempotent command identity is structured for callers while its compatible
  durable string representation remains owned by the persistence module.
