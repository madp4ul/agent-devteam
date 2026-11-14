# 01 — Reproduce local verification

**What to build:** Let a fresh framework maintainer run the relevant checks with
a predictable fixture environment and distinguish environment failures from
product failures without rediscovering temporary-path and browser setup.

**Blocked by:** None.

**Status:** open

**Scheduling:** Deferred by the user. Do not claim or implement until the user
explicitly resumes this effort after the idle game run.

**Parent:** [November assessment](../spec.md).

## Acceptance criteria

- [ ] Provide documented, reproducible local verification that accounts for
  short temporary paths, installed browser discovery and localhost access.
  Respect sandbox restrictions and report unavailable capabilities clearly.
- [ ] Keep generated fixtures and logs out of Git changes. Never recreate an
  unignored fixture tree such as the audit's removed temporary directory.
- [ ] Preserve ordinary supported environments; avoid hardcoded user paths,
  machine-specific browser assumptions or changes to global Git trust.
- [ ] Bound diagnostic waits and own fixture cleanup, preserving the actual
  SQLite, Git or browser error when setup fails.
- [ ] Establish and record the full Node-suite baseline, including the
  1,000-retry stress case, and relevant browser baseline. Do not silently skip
  stress coverage, raise timeouts indiscriminately or weaken assertions.
- [ ] Recheck the observed scroll-cancellation and archival-menu failures under
  controlled conditions. Record unresolved behavior defects separately instead
  of expanding this ticket into unrelated product fixes.
- [ ] Verify the resulting workflow and documentation without modifying live
  coordination state, authored processes or real Codex execution settings.

## Scope

The audit demonstrated sensitivity in its desktop environment, not a universal
defect in every development setup. Prefer the smallest supported setup and
fixture-lifecycle improvements that make failures reproducible.
