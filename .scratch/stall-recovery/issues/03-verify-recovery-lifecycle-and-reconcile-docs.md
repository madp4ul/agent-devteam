# 03 — Verify recovery lifecycle and reconcile documentation

**Type:** task
**Status:** resolved
**Blocked by:** 01, 02.

Source: [intake 27](../../framework-improvements-2026-09/issues/27-recover-stalled-work-without-user-attention.md).
Contract: [spec.md](../spec.md). Verify delivered behavior through public seams.

## Deliver and acceptance

- [x] All twelve spec scenarios have meaningful passing evidence, including
  run/recovery/handoff, waiting/cycle validation, third-run escalation, and
  address/grace/fresh-budget sequences.
- [x] Verify migration from retained state, startup pause, interrupted/stale/failed
  work, restart with pending grace/recovery, and concurrent scheduling boundaries.
- [x] Core/runtime/HTTP/MCP/browser agree; both themes remain operable/readable.
- [x] Inspect legacy relationships for concrete rollout risks without rewriting
  them or adding an unagreed startup hold; record remaining limitations.
- [x] Architecture, glossary, agent reference, ADR implementation status, and map
  describe final behavior. Intake 12 remains separate.
- [x] Run normal checks and code review, repair actionable findings, record
  validation before resolving delivery, and leave changes unstaged.

Distinguish delivered implementation from the already-resolved intake design.

## Answer

Verified all twelve acceptance scenarios through public application, runtime,
HTTP/MCP and browser seams. Eleven dedicated recovery tests pass, including
concurrent deadline expiry, retained waiting/reopening, grace handoff, duplicate
prevention and technical retry ordering. The full suite passed 365 tests with
four skips and no failures/cancellations. Browser regression passed 213 tests;
a deterministic fixture-duration correction was verified with 24 passing tests
in the affected timeline, attention and relationship suites. Both typechecks,
production build and diff checks pass.

Standards and Spec reviews completed; their actionable findings were repaired
and reviewed again. Architecture, domain glossary, MCP reference and ADR now
describe implemented behavior. Legacy graphs are preserved; retained circular
waits still require explicit relationship repair. No new startup hold was added.
Intake 12 remains separate.

See [verification.md](../verification.md) for scenario evidence, checks and
rollout limits. All delivery tickets are resolved. Implementation changes are
unstaged; the user's staged planning content and unrelated work were preserved.
