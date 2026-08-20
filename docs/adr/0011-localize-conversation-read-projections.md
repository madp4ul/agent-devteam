# Localize conversation read projections

Status: accepted

Assemble conversation indexes, status, detail, authored messages, runs,
transcript availability, owner identity, and continuation availability in one
focused internal projection module. Keep `CoordinationApplication` as the public
query interface and use the existing coordination database connection and
task-owned activation and attempt projections inside the module.

The compact task index remains a distinct query path that reads conversation
indexing metadata and status evidence without loading attempt transcripts or
duplicating attempt-owned content. The module does not create a repository seam,
transaction authority, or second source of truth.

## Consequences

- Conversation read behavior and its precedence rules change in one module.
- The general task projection module no longer exposes conversation indexes,
  details, messages, runs, identity, continuation, or transcript availability.
- Automation resolves authored follow-up source messages through the conversation
  module while retaining its existing activation-selection rules.
- Application-seam tests remain the behavioral test surface; private SQL and
  module wiring are not independent contracts.
