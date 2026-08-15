# 14 — Contract compatibility cleanup

**What to build:** Remove obsolete compatibility structure once every production and test caller uses the capability contract that owns its concepts.

**Blocked by:** 12 — Migrate core and runtime contracts; 13 — Migrate adapter contracts.

**Status:** ready-for-agent

- [ ] No caller depends on the former broad internal contract organization.
- [ ] Any retained public barrel is intentionally small and documented by its consumers.
- [ ] Contract ownership is navigable by capability without duplicate declarations.
- [ ] Typechecking and the full test suite pass after contraction.
