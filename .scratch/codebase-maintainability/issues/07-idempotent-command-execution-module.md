# 07 — Idempotent command execution module

**What to build:** Encapsulate the common read, execute, retain, and replay lifecycle for transactional commands whose idempotency semantics are equivalent.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Compatible commands use one internal idempotent execution interface.
- [ ] Accepted and rejected results replay exactly as before.
- [ ] Command-specific validation and behavior remain inside their owning workflow modules.
- [ ] Archived conversation bodies cannot become recoverable through retained command responses.
- [ ] Concurrency and replay tests pass through the application and adapter seams.

