# 05 — Single durable activity journal

**What to build:** Give every coordination workflow one internal operation for appending durable task activity with consistent identity, actor, timestamp, type, and details.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Task commands, automation outcomes, and archival use the same activity journal.
- [ ] Existing activity shapes, ordering, provenance, and restart durability remain unchanged.
- [ ] The journal participates in the caller's existing database transaction.
- [ ] No journal interface is exposed through the external application contract.
- [ ] Application tests pass without asserting on journal implementation details.

