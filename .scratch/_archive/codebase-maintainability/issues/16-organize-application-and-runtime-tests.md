# 16 — Organize application and runtime tests

**What to build:** Divide the largest application and runtime suites by observable capability while preserving the authoritative application and runtime seams.

**Blocked by:** 10 — Conversation command module; 12 — Migrate core and runtime contracts.

**Status:** resolved

- [x] Task activation, handoff, conversation, recovery, and runtime behaviors have focused suites.
- [x] Shared fixtures use domain language and public interfaces.
- [x] Tests do not import extracted persistence modules or inspect private storage details.
- [x] No meaningful coverage is deleted or weakened.
- [x] The full non-browser suite passes with no new order dependence.

## Answer

Split the broad activation, handoff/conversation, and Codex runtime suites by
observable capability while retaining their public `CoordinationApplication`
and runtime seams. Consolidated controlled runtime, retry-clock, committed Git
repository, activation, handoff, and Codex runtime setup into focused fixtures.
All 55 original behaviors remain represented, including populated incomplete
current-state recovery through an opaque fixture rather than private SQLite
knowledge.

Verification passed: typecheck; 55 focused tests; the full non-browser suite
(197 passed, 2 skipped); 77 browser tests; and the production build. The final
two-axis review reported zero Standards findings and zero Spec findings after
its findings were addressed.
