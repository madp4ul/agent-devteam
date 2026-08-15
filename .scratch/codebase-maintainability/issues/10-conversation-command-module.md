# 10 — Conversation command module

**What to build:** Give user follow-up continuation one cohesive command module that atomically owns message creation, activity, activation, conversation activity order, ownership validation, and idempotency.

**Blocked by:** 05 — Single durable activity journal; 06 — Atomic attention recording; 08 — Structured idempotent command identity; 09 — Conversation projection module.

**Status:** ready-for-agent

- [ ] Conversation continuation no longer resides in the general task command module.
- [ ] One transaction records the authored message, conversation activity, and activation.
- [ ] Ownership, archival, missing-thread, and missing-agent rejection behavior remains unchanged.
- [ ] Replays return the original message and activation without duplicating either.
- [ ] Restart, recovery, process-evolution, archival, and HTTP scenarios remain green.
