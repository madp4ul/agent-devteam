# 22 — Prevent Conflicting and Duplicate Changes

**What to build:** Concurrent users, agents, and retried transports can change
the shared board without silently overwriting one another or duplicating task
commands and activations.

**Blocked by:** 16 — Execute the First Task Activation;
29 — Decompose Coordination Persistence by Behavior; 36 — Configure Agent Models and Reasoning

**Status:** resolved

- [x] Every logical board command atomically changes authoritative current
  state, appends corresponding activity, and creates any resulting activation.
- [x] Durable constraints enforce one active run per task and preserve strict
  activation order.
- [x] Mutable task commands require an optimistic revision and return current
  state when a stale edit or move loses a conflict.
- [x] Naturally additive distinct comments can succeed concurrently without
  unnecessary task-wide conflicts.
- [x] Retriable user, MCP, adapter, and transport commands carry idempotency keys
  that prevent duplicate comments, moves, relationships, and activations.
- [x] Multiple tasks can execute concurrently while one task remains serialized.
- [x] Simultaneous moves, edits, comments, and relationship changes produce
  complete and explainable activity rather than partial state.
- [x] Concurrency tests run through the public application boundary against the
  production relational engine.

## Answer

Implemented conflict-safe and idempotent coordination through the existing
`CoordinationApplication` seam. SQLite now waits briefly for competing writers,
prevents duplicate typed relationships, enforces one claimed or running
activation per task, and rejects out-of-order activation starts. A durable
dispatch-claim record is created atomically with the attempt before external
workspace provisioning, so competing coordinators cannot provision or dispatch
the same activation and interruption leaves explicit ownership evidence for
issue 23's restart-recovery workflow.

The automation pump now runs independent tasks concurrently, immediately wakes
for newly queued independent work, and continues to serialize each task's
activation order. Existing optimistic revisions and command-response replay
were verified under genuinely overlapping worker-thread application instances,
including stale move/edit races, additive comments, an idempotently retried move
with exactly one activation, and distinct-key relationship races.

Verification passed both TypeScript typechecks, 68 local tests plus one
intentionally skipped credentialed Codex test, the production build, all 10
browser scenarios, and `git diff --check`. Final independent Standards and Spec
reviews reported no remaining in-scope findings.
