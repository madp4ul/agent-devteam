# 17 — Finalize architecture and verification

**What to build:** Reconcile the architecture inspection map with the implemented seams and prove that the complete product behavior remains intact after the maintainability effort.

**Blocked by:** 14 — Contract compatibility cleanup; 15 — Organize browser tests by capability; 16 — Organize application and runtime tests.

**Status:** ready-for-agent

- [ ] The architecture map accurately describes major authoritative queries, adapters, transaction ownership, and state ownership without inventorying source-level internal modules.
- [ ] Source-level journal, attention, idempotency, modal, and refresh implementation details are removed from the architecture overview unless they express a durable authoritative flow.
- [ ] The durable reasoning for the new application-projection and shared transactional seams is recorded in an ADR, with any other lasting seam decision recorded there or in a focused companion ADR.
- [ ] Typechecking, build, non-browser tests, browser tests, MCP tests, runtime tests, and documentation tests pass.
- [ ] No temporary compatibility path or abandoned abstraction remains.
- [ ] The final diff contains no unrelated, staged, or generated changes.
