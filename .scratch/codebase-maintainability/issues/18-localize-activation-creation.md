# 18 — Localize activation creation

**What to build:** Give ordinary and user-follow-up activation creation one cohesive internal module that owns durable activation insertion, execution-profile snapshots, process-version provenance, conversation assignment, current-conversation reuse, replacement-lineage creation, and ordinary activation-created activity.

**Blocked by:** 10 — Conversation command module.

**Status:** claimed

- [ ] General task commands no longer own conversation selection or direct activation insertion.
- [ ] Conversation follow-ups use the same activation-creation module without moving message, continuation-activity, validation, or idempotency ownership out of the conversation command workflow.
- [ ] Ordinary activation creation records its immutable activity and conversation activity order through one operation.
- [ ] Column-entry, mention, blocker-clearance, follow-up, retirement replacement, execution-profile, and process-version behavior remains unchanged.
- [ ] Tests continue to exercise behavior through `CoordinationApplication`, browser HTTP, MCP, and runtime seams rather than importing the internal module.
- [ ] Typechecking, build, focused tests, and the complete non-browser suite pass.

## Rationale

The post-maintenance conversation-continuation feature had to change the general
task command store because ordinary activation creation still selected and
created conversation lineages there. User follow-ups separately inserted their
own activations. The repeated durable mechanics and cross-capability knowledge
identify one remaining deepening opportunity. Localizing them should keep the
next activation or conversation-lifecycle change out of unrelated task mutation
implementation while preserving the single application and SQLite authority.
