# 13 — Migrate adapter contracts

**What to build:** Move browser, host, and MCP adapters onto their shared transport and capability contracts without changing their externally visible interfaces.

**Blocked by:** 11 — Expand capability-focused contracts.

**Status:** ready-for-agent

- [ ] Browser and host use the same user-facing transport definitions.
- [ ] MCP depends only on agent-facing coordination capabilities.
- [ ] Adapter status mapping, error behavior, and payloads remain unchanged.
- [ ] No compatibility export is removed in this ticket.
- [ ] Typechecking and adapter tests pass.
