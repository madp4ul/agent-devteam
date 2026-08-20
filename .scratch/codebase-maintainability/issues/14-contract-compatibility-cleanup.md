# 14 — Contract compatibility cleanup

**What to build:** Remove obsolete compatibility structure once every production and test caller uses the capability contract that owns its concepts.

**Blocked by:** 12 — Migrate core and runtime contracts; 13 — Migrate adapter contracts.

**Status:** resolved

- [x] No caller depends on the former broad internal contract organization.
- [x] Any retained public barrel is intentionally small and documented by its consumers.
- [x] Contract ownership is navigable by capability without duplicate declarations.
- [x] Typechecking and the full test suite pass after contraction.

## Answer

Removed the temporary broad `coordination-contract.ts` declaration source and
the broad type exports from `coordination-application.ts`. Each of the 110
existing declarations now has one owner in the task, conversation, automation,
process, notification, or runtime capability contract. Remaining production and
test callers import the capability that owns the concepts they use. The shared
browser transport contract remains the intentional adapter interface consumed
by both the host and browser; no replacement compatibility barrel was added.

The contraction preserves serialized shapes, public behavior, and the single
`CoordinationApplication`/SQLite authority. Verification passed with
typechecking, 43 focused application/web/MCP/runtime seam tests, the full 199-test
non-browser suite (197 passed, 2 intentional skips), all 77 browser tests, the
production build, and `git diff --check`. The required parallel two-axis review
reported zero Standards findings and zero Spec findings.
