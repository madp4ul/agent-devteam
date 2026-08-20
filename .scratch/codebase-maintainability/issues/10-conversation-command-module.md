# 10 — Conversation command module

**What to build:** Give user follow-up continuation one cohesive command module that atomically owns message creation, activity, activation, conversation activity order, ownership validation, and idempotency.

**Blocked by:** 05 — Single durable activity journal; 06 — Atomic attention recording; 08 — Structured idempotent command identity; 09 — Conversation projection module.

**Status:** resolved

- [x] Conversation continuation no longer resides in the general task command module.
- [x] One transaction records the authored message, conversation activity, and activation.
- [x] Ownership, archival, missing-thread, and missing-agent rejection behavior remains unchanged.
- [x] Replays return the original message and activation without duplicating either.
- [x] Restart, recovery, process-evolution, archival, and HTTP scenarios remain green.

## Answer

Implemented a focused internal `ConversationCommandModule` whose single command
owns continuation validation, authored-message creation, continuation activity,
activation creation, conversation activity ordering, and idempotent replay in
the existing SQLite transaction. `CoordinationApplication` remains the public
authority and the general task command module no longer contains continuation
behavior.

Recorded the durable seam in ADR 0012 and updated the architecture inspection
map. Verification passed with typechecking, 44 focused application and HTTP
scenarios, the full 199-test non-browser suite (197 passed, 2 skipped), and the
production build.

The required two-axis code review completed with no Standards findings and no
Spec findings.
