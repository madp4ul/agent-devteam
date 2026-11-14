# 18 — Localize activation creation

**What to build:** Give ordinary and user-follow-up activation creation one cohesive internal module that owns durable activation insertion, execution-profile snapshots, process-version provenance, conversation assignment, current-conversation reuse, replacement-lineage creation, and ordinary activation-created activity.

**Blocked by:** 10 — Conversation command module.

**Status:** resolved

- [x] General task commands no longer own conversation selection or direct activation insertion.
- [x] Conversation follow-ups use the same activation-creation module without moving message, continuation-activity, validation, or idempotency ownership out of the conversation command workflow.
- [x] Ordinary activation creation records its immutable activity and conversation activity order through one operation.
- [x] Column-entry, mention, blocker-clearance, follow-up, retirement replacement, execution-profile, and process-version behavior remains unchanged.
- [x] Tests continue to exercise behavior through `CoordinationApplication`, browser HTTP, MCP, and runtime seams rather than importing the internal module.
- [x] Typechecking, build, focused tests, and the complete non-browser suite pass.

## Rationale

The post-maintenance conversation-continuation feature had to change the general
task command store because ordinary activation creation still selected and
created conversation lineages there. User follow-ups separately inserted their
own activations. The repeated durable mechanics and cross-capability knowledge
identify one remaining deepening opportunity. Localizing them should keep the
next activation or conversation-lifecycle change out of unrelated task mutation
implementation while preserving the single application and SQLite authority.

## Answer

Added a transaction-bound `ActivationCreationModule` that owns ordinary and
follow-up activation insertion, execution-profile and process-version
snapshots, and conversation linkage. Ordinary task commands now delegate
current-conversation reuse, replacement-lineage creation, generated labels,
activation-created activity, and conversation activity ordering to that module.
The conversation command workflow delegates only the shared activation
mechanics and retains continuation validation, authored messages, continuation
activity, and idempotency.

Updated ADR 0009 to record the deeper shared-write seam. Existing behavior is
still covered exclusively through the public application, HTTP, MCP, and
runtime seams. Verification passed with typechecking; 57 focused application,
HTTP, MCP, and runtime scenarios; the complete 206-test non-browser suite (203
passed and 3 intentional skips); the production build; and `git diff --check`.
The required two-axis code review completed with zero Standards findings and
zero Spec findings.

The complete browser suite was not used as a completion gate for this
transaction-only refactor: isolated browser attempts timed out first in
unrelated UI scenarios while concurrent browser work was in progress. The
browser HTTP conversation scenarios included in the non-browser suite passed.
