# 17 — Finalize architecture and verification

**What to build:** Reconcile the architecture inspection map with the implemented seams and prove that the complete product behavior remains intact after the maintainability effort.

**Blocked by:** 14 — Contract compatibility cleanup; 15 — Organize browser tests by capability; 16 — Organize application and runtime tests.

**Status:** resolved

- [x] The architecture map accurately describes major authoritative queries, adapters, transaction ownership, and state ownership without inventorying source-level internal modules.
- [x] Source-level journal, attention, idempotency, modal, and refresh implementation details are removed from the architecture overview unless they express a durable authoritative flow.
- [x] The durable reasoning for the new application-projection and shared transactional seams is recorded in an ADR, with any other lasting seam decision recorded there or in a focused companion ADR.
- [x] Typechecking, build, non-browser tests, browser tests, MCP tests, runtime tests, and documentation tests pass.
- [x] No temporary compatibility path or abandoned abstraction remains.
- [x] The final diff contains no unrelated, staged, or generated changes.

## Answer

Reconciled the architecture inspection map with the completed maintainability
seams. The overview now identifies the browser, host, MCP, and Codex adapters;
the complete board and task-detail application queries; the single SQLite state
authority; and workflow-owned transaction locality without inventorying the
internal activity, attention, idempotency, conversation, modal, or refresh
implementations. Durable reasoning was already recorded at the point each seam
was established: ADR 0008 covers complete application projections, ADR 0009
covers shared transaction-bound write mechanics, and ADRs 0010 through 0013
cover the remaining browser lifecycle, conversation, and contract seams.

The implementation audit found no former broad coordination contract,
compatibility barrel, temporary migration path, or abandoned replacement
abstraction. Verification passed with typechecking; 26 focused documentation,
MCP, and runtime tests; the full 199-test non-browser suite (197 passed and 2
intentional real-Codex skips); all 77 browser tests; the production build; and
`git diff --check`. The required two-axis review completed with zero Standards
findings and zero Spec findings.
