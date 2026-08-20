# Localize conversation continuation

Status: accepted

Place user follow-up continuation in one focused internal command module. The
module owns conversation ownership and continuation validation together with the
authored message, continuation activity, activation, conversation activity
order, and idempotent result recorded by that workflow.

Keep `CoordinationApplication` as the public command interface and execute the
workflow through the existing transaction-bound idempotent command and activity
modules. The conversation module uses the shared coordination database
connection; it does not open an independent transaction, create a repository
seam, or become another state authority.

## Consequences

- Conversation continuation invariants and durable writes change in one module.
- The general task command module no longer needs conversation-specific command
  knowledge.
- One SQLite transaction still commits the message, activity, activation,
  activity order, and replay response atomically.
- Application and HTTP seams remain the behavioral test surfaces; private SQL
  and module wiring are not independent contracts.
