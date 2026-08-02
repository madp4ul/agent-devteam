# 22 — Prevent Conflicting and Duplicate Changes

**What to build:** Concurrent users, agents, and retried transports can change
the shared board without silently overwriting one another or duplicating task
commands and activations.

**Blocked by:** 16 — Execute the First Task Activation;
29 — Decompose Coordination Persistence by Behavior

**Status:** ready-for-agent

- [ ] Every logical board command atomically changes authoritative current
  state, appends corresponding activity, and creates any resulting activation.
- [ ] Durable constraints enforce one active run per task and preserve strict
  activation order.
- [ ] Mutable task commands require an optimistic revision and return current
  state when a stale edit or move loses a conflict.
- [ ] Naturally additive distinct comments can succeed concurrently without
  unnecessary task-wide conflicts.
- [ ] Retriable user, MCP, adapter, and transport commands carry idempotency keys
  that prevent duplicate comments, moves, relationships, and activations.
- [ ] Multiple tasks can execute concurrently while one task remains serialized.
- [ ] Simultaneous moves, edits, comments, and relationship changes produce
  complete and explainable activity rather than partial state.
- [ ] Concurrency tests run through the public application boundary against the
  production relational engine.
