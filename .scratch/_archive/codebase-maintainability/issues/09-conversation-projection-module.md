# 09 — Conversation projection module

**What to build:** Give conversation index, status, detail, messages, runs, transcript availability, owner identity, and continuation availability one cohesive projection module.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Conversation projections no longer reside in the general task projection module.
- [x] Compact indexes do not load transcript evidence or duplicate attempt-owned content.
- [x] Status and continuation availability preserve their current precedence and archival behavior.
- [x] Historical agent identity and replacement-thread evidence remain intact.
- [x] Conversation behavior is tested through the application seam.

## Answer

Added one internal conversation projection module that owns compact task indexes,
status precedence, conversation detail, authored messages, run assembly, transcript
availability, owner identity, and continuation availability. `CoordinationApplication`
continues to expose the public queries, while the module reuses task-owned activation
and attempt projections and participates in the existing SQLite authority. Automation
now asks the conversation module for user-follow-up source messages, so message
projection no longer leaks through the general task projection store.

The ticket's proposed seam remained valuable; the implementation adapted it by keeping
task activity rendering and reusable activation/attempt shaping in the task projection
module rather than duplicating those behaviors. ADR 0011 records the durable seam
decision. No architecture overview update was needed because authority, state ownership,
and end-to-end flow are unchanged. Focused conversation, discovery, and archival
application tests pass, as do typechecking, the production build, and the full 199-test
non-browser suite (197 passed, 2 intentional skips).
