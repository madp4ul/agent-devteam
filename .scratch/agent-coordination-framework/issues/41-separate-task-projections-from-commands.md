# 41 — Separate Task Projections from Atomic Commands

**What to build:** Make task persistence easier to navigate and change by
separating relational task projection hydration from atomic task-command
orchestration, without weakening transaction locality or changing the public
application behavior.

**Blocked by:** 22 — Prevent Conflicting and Duplicate Changes

**Status:** resolved

- [x] Task projection reads and SQL hydration live in one cohesive internal
  module used by application queries, discovery, and automation.
- [x] Atomic create, edit, move, comment, relationship, and attention commands
  live in a separate cohesive internal module.
- [x] Command transactions still atomically change authoritative task state,
  append activity, and create resulting attention or activations.
- [x] The decomposition keeps one `CoordinationDatabase` owner and does not add
  table-by-table repositories, pass-through façades, or new public seams.
- [x] Internal consumers depend only on the task persistence capability they
  use where doing so improves locality.
- [x] `CoordinationApplication`, MCP, web, runtime, and test-observable behavior
  remain unchanged.
- [x] The resulting modules are judged by comprehensibility, cohesive reasons
  to change, and interface depth rather than line-count targets.

## Comments

- This reassesses issue 29 after task relationships, attention, concurrency,
  idempotency, and durable dispatch claims increased the remaining task store's
  behavioral breadth. The goal is not to split persistence by table.

## Answer

Replaced the combined `CoordinationTaskStore` with two cohesive internal
modules. `TaskProjectionStore` owns task and overview hydration, attention,
attachments, relationships, activation and attempt projections, starting-ref
lookups, and source-event reads. `TaskCommandStore` owns all atomic task
commands together with idempotency, activity, attention, relationship, and
activation side effects.

`openCoordinationPersistence` still creates one `CoordinationDatabase` and
injects the same connection owner into both modules. The command module retains
transaction orchestration and uses the projection module only for validation
and authoritative read-back inside those transactions. Application queries,
task discovery, and automation now depend on projections, while application
mutations depend on commands. No table repositories, pass-through façade, or
new public application seam was introduced.

Verification passed both TypeScript typechecks, 68 local tests plus one
intentionally skipped credentialed Codex test, the production build, all 10
browser scenarios, and `git diff --check`. Final independent Standards and Spec
reviews reported no findings.
