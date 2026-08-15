# 16 — Finalize architecture and verification

**What to build:** Reconcile the architecture inspection map with the implemented seams and prove that the complete product behavior remains intact after the maintainability effort.

**Blocked by:** 13 — Contract compatibility cleanup; 14 — Organize browser tests by capability; 15 — Organize application and runtime tests.

**Status:** ready-for-agent

- [ ] The architecture map accurately describes authoritative queries, persistence workflow modules, adapters, and state ownership.
- [ ] Durable decisions not already covered by existing architecture are recorded appropriately.
- [ ] Typechecking, build, non-browser tests, browser tests, MCP tests, runtime tests, and documentation tests pass.
- [ ] No temporary compatibility path or abandoned abstraction remains.
- [ ] The final diff contains no unrelated, staged, or generated changes.
