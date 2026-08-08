# 29 — Decompose Coordination Persistence by Behavior

**What to build:** After the task-facing read and command requirements from
ticket 19 are known, reassess the relational persistence implementation against
the creation baseline below. If the same change axes remain concentrated in one
implementation, restructure them into cohesive internal modules before the
persistence-heavy work in tickets 20–22. Keep one database owner and preserve
atomic coordination transactions; do not create one shallow repository per
table.

**Blocked by:** 19 — Inspect and Control a Task

**Status:** resolved

## Creation baseline and applicability

This ticket was created immediately after ticket 18 and its maintenance pass.
At that point:

- `CoordinationApplication` had been reduced to the external application seam,
  with contracts, discovery/pagination, and automation/runtime coordination in
  cohesive modules.
- Schema initialization and migrations had moved to
  `coordination-database.ts`.
- `RelationalCoordinationStore` still had roughly 970 lines and independently
  changing behavior for process state, board and task projections, atomic task
  commands, activation and attempt persistence, workspace registration, and SQL
  hydration helpers.
- The concern was not the line count by itself. It was that tickets 20–27 were
  expected to add several different kinds of persistence behavior to that same
  implementation after ticket 19 clarified the final task-facing projections.

The implementing agent must inspect the post-ticket-19 code rather than assume
this baseline still exists. This ticket still applies when the same persistence
implementation remains the likely home for several independent upcoming change
axes, making navigation, transaction reasoning, or focused enhancement harder.

This ticket no longer requires code changes when ticket 19 or other intervening
work has already produced cohesive behavioral modules with one database owner,
preserved atomic commands, and no all-purpose pass-through façade. It may also
be resolved without restructuring if the reassessment demonstrates that the
remaining implementation is one genuinely cohesive deep module and the
upcoming work will not recreate the concentration described above. In either
case, record the evidence and resulting module map under `## Answer` before
marking the ticket resolved.

- [x] Compare the post-ticket-19 implementation with the creation baseline and
  record whether the ticket still applies. If it does, partition the
  implementation around cohesive behavior such as process state, read
  projections, atomic task commands, automation and attempt lifecycle, and
  database lifecycle/schema. Closely coupled behavior may remain together when
  splitting it would leak transaction rules.
- [x] One module continues to own the SQLite connection, transaction primitive,
  and current-schema initialization. Pre-release schema migrations are not
  supported; incompatible test state is recreated.
- [x] Commands that change authoritative task state, append activity, and create
  resulting activations remain one atomic transaction.
- [x] The decomposition introduces no table-by-table repository layer and no
  large façade consisting mainly of pass-through methods.
- [x] `CoordinationApplication` remains the external seam, and its existing
  caller imports and observable behavior remain compatible.
- [x] Internal callers depend only on the cohesive persistence capabilities they
  use; database implementation details do not escape into the application,
  discovery, automation, MCP, or web interfaces.
- [x] Existing tests remain green through the public application seam, with
  focused characterization coverage added for any transaction or migration
  behavior that was not previously protected.
- [x] The old all-purpose store implementation is replaced rather than retained
  underneath a new layer, and the resulting structure is judged by locality and
  interface depth rather than an arbitrary line-count target.

## Comments

- This maintenance gate was added after ticket 18. The store remained cohesive
  enough to defer one ticket, but tickets 20–27 are expected to add mentions,
  attention, relationships, concurrency, recovery, retries, interruption,
  process evolution, and archival. Deferring the decomposition beyond ticket 19
  would make those changes accumulate in the same implementation file.

## Answer

The ticket still applied after issue 20: the former 1,319-line relational store
contained independent process-definition state, task coordination, and
activation/attempt/workspace lifecycle behavior. It was replaced by cohesive
internal persistence modules rather than wrapped in a new façade:

- `CoordinationDatabase` exclusively owns the SQLite connection, current-schema
  initialization, transaction primitive, and close lifecycle.
- `ProcessStateStore` owns applied agents, boards, columns, process projections,
  and the persisted automation switch.
- `CoordinationTaskStore` owns task projections and atomic task commands,
  including comments, mentions, attention, activity, and resulting activations.
- `AutomationStateStore` owns runnable activation selection, task-workspace
  registrations, attempt state, startup failures, and attempt activity.
- `openCoordinationPersistence` composes these capabilities over the one
  database owner; it delegates no behavior and exposes no table repositories.

`CoordinationApplication` remains the external command-and-query seam.
`TaskDiscovery` receives only process and task capabilities, while
`AutomationCoordinator` receives process, task, and attempt-lifecycle
capabilities. Database details remain inside the persistence implementation.
Task commands retain one `BEGIN IMMEDIATE` transaction across authoritative
state, immutable activity, and resulting activation creation.

Per user feedback, unused pre-release migrations were removed. Fresh databases
are initialized directly at the current schema, and incompatible test state may
be deleted and recreated until retained real-world state makes upgrade
compatibility a product requirement. The full application-level suite remains
green after the decomposition.
