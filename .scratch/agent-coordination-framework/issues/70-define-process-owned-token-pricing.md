# 70 — Define Process-Owned Token Pricing and Cost Display

**What to build:** Define an optional process-owned model-pricing configuration
that can turn an attempt's isolated token usage into a compact estimated cost,
without embedding model prices or provider billing assumptions in the
framework.

**Blocked by:** None

**Status:** open

- [ ] Define optional model pricing in the process definition rather than in
  framework source code. A process that supplies no applicable pricing must
  keep the current token-only display and must not show a zero cost.
- [ ] Determine how agents reference priced model definitions while preserving
  the existing ability to omit a model and inherit the user's Codex default.
- [ ] Define currency, rate unit, precision, and the supported reported usage
  categories, including ordinary input, cached-input reads, cache-write input,
  output, and reasoning output.
- [ ] Establish an unambiguous calculation for SDK categories that overlap.
  The framework must neither double-charge nested counts nor silently invent a
  provider-specific interpretation when the process metadata is incomplete.
- [ ] Calculate cost only from trustworthy isolated per-attempt usage. Missing
  usage, a missing price for the effective model or category, or an invalid
  resumed-thread baseline must produce unavailable cost rather than a partial
  or misleading value.
- [ ] Decide whether pricing metadata is snapshotted on the activation or
  attempt so later process edits cannot rewrite the displayed historical cost.
- [ ] Define how pricing changes participate in process validation, semantic
  definition changes, stale-activation handling, and source-located errors.
- [ ] Keep the presentation compact and subordinate to the transcript. Label
  it as an estimate unless the process definition can establish stronger
  billing semantics; do not add framework-wide budgets or billing claims.
- [ ] Turn the chosen schema, calculation, persistence, evolution, and browser
  behavior into implementation acceptance criteria before changing the token
  usage display.

## Context

Issue 53 deliberately persists the complete reported usage payload while
showing only uncached input and output tokens. That data makes a later cost
calculation possible, but the Codex SDK does not make the framework an
authority on provider prices, discounts, billing arrangements, or the meaning
of every overlapping counter.

The desired opt-in boundary is clear: pricing belongs to authored process/model
configuration. The remaining work is to make that configuration truthful,
version-safe, and compatible with inherited model selection before an
implementation ticket is written.

