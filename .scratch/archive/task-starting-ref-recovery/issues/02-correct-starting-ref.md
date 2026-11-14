# 02 — Correct an unprovisioned task starting ref through task.edit

**What to build:** Integrators inspect task workspace lifecycle, optionally edit
startingRef before preparation, and leave ordinary user retry available.

**Blocked by:** 01.

**Status:** resolved

- [x] Optional ref-only and content-only edits work through scoped MCP.
- [x] Ref edits reject blank values, active preparation and existing workspaces.
- [x] Revision, idempotency and cross-task provenance remain authoritative.
- [x] Inspection exposes starting ref and lifecycle/editability facts.
- [x] Corrected task provisions the intended commit on explicit user retry.
- [x] Update tool reference and framework guidance; run two-axis review.


Implementation: optional ref correction is available through the application,
scoped MCP and browser HTTP task-edit adapter. Inspection reports workspaceStatus
without changing the browser's workspace path record. ADR 0033 records the
preparation claim boundary and retained explicit user recovery authority.

Validation: public application/MCP workspace suites passed 13 tests; affected
browser HTTP/API and discovery suites passed 19 tests. TypeScript checks passed.
New regressions include corrected real Git HEAD after user retry, preparation
race rejection while content editing stays allowed, blank/stale/idempotency
rejections, cross-task provenance, optional MCP edits and optional browser edits.
Final validation: full suite 441 tests, 435 passed, 6 skipped, 0 failed;
TypeScript checks and production build passed. Standards review: no findings.
Spec review: no findings. Late browser adapter edits received a separate
Standards recheck with no findings. Changes remain unstaged for user review.
