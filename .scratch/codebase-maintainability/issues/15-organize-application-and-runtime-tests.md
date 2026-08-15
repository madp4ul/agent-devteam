# 15 — Organize application and runtime tests

**What to build:** Divide the largest application and runtime suites by observable capability while preserving the authoritative application and runtime seams.

**Blocked by:** 09 — Conversation command module; 11 — Migrate core and runtime contracts.

**Status:** ready-for-agent

- [ ] Task activation, handoff, conversation, recovery, and runtime behaviors have focused suites.
- [ ] Shared fixtures use domain language and public interfaces.
- [ ] Tests do not import extracted persistence modules or inspect private storage details.
- [ ] No meaningful coverage is deleted or weakened.
- [ ] The full non-browser suite passes with no new order dependence.

