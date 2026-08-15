# 12 — Migrate core and runtime contracts

**What to build:** Move application, persistence, automation, process, workspace, notification, and runtime callers onto the capability contracts they actually use.

**Blocked by:** 11 — Expand capability-focused contracts.

**Status:** ready-for-agent

- [ ] Core and runtime modules import only their relevant capability contracts.
- [ ] The authoritative application interface and runtime behavior remain unchanged.
- [ ] No compatibility export is removed in this ticket.
- [ ] Typechecking and application, runtime, and integration tests pass.
