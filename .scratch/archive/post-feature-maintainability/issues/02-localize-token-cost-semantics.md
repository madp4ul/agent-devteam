# 02 — Localize token cost semantics

**What to build:** Give attempt calculation and conversation aggregation one focused application module so every priceable run, compact conversation index, and complete conversation detail uses the same cost, breakdown, pending, and lower-bound rules.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] One focused token-cost module calculates an attempt estimate and breakdown from isolated usage and the attempt's snapshotted process price.
- [x] Ordinary input excludes cached-input reads and cache-write input exactly once, while reasoning output remains informational and is not billed separately.
- [x] Invalid, negative, unsafe, internally inconsistent, or non-finite usage produces no invented cost.
- [x] One aggregation operation combines priced evidence with bounded numeric precision and preserves whether settled evidence is missing a usable cost.
- [x] Aggregation retains every historical category and rate row; compact grouping combines only equal category-and-rate pairs.
- [x] Conversation index and complete conversation detail projections use the same aggregation semantics even though they obtain evidence through different read paths.
- [x] Running attempts remain excluded from settled totals while pending and known-lower-bound facts remain truthful.
- [x] Automation persistence retains ownership of attempt completion and usage isolation but no longer implements pricing arithmetic itself.
- [x] Representative behavior remains covered through the application seam, with a focused pure matrix only where it prevents disproportionate application setup.
- [x] Existing persisted amounts, displayed totals, transcript facts, process pricing validation, and restart behavior remain unchanged.
- [x] Typechecking, focused automation and conversation coverage, the full non-browser suite, the production build, and the complete browser suite pass.

## Answer

Implemented one focused public `token-cost` application module that calculates attempt estimates from isolated usage and snapshotted pricing, rejects unusable usage, and aggregates settled and running evidence with bounded precision, lower-bound and pending facts, historical breakdown preservation, and optional category-and-rate grouping. Automation persistence still owns attempt completion and usage isolation but delegates pricing arithmetic. Compact conversation index reads and complete conversation detail reads now normalize their distinct evidence paths and delegate all cost semantics to the same aggregation operation.

Verification completed on 2026-08-25:

- `pnpm typecheck` — passed before and after review fixes.
- Focused token-cost, conversation, and automation coverage — 23 passed after review fixes.
- Focused pure token-cost matrix — 5 passed, including invalid usage, historical rate grouping, bounded precision, pending/lower-bound facts, and aggregate overflow.
- `pnpm test` — 226 passed, 3 skipped, 0 failed.
- `pnpm build` — passed.
- `pnpm test:browser` — 105 passed, 0 failed.
- `git diff --check` — passed after review fixes.
- Required independent two-axis code review — initial findings addressed; final Standards: 0 findings; final Spec: 0 findings.

All implementation and ticket-resolution changes remain unstaged. Existing user-staged specification content was preserved as the immutable baseline.
