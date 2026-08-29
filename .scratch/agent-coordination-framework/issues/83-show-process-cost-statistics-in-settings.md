# 83 — Show Process Cost Statistics in Settings

**What to build:** Add a quiet, read-only Cost statistics section to the
existing Settings surface that explains the process's configured model prices
and shows one accumulated estimated cost across all retained tasks.

**Blocked by:** 76 — Correct Conversation Cost Aggregation.

**Status:** resolved

- [x] Keep the existing Settings name and entry point. Add Cost statistics as
  a secondary section rather than promoting cost into the primary navigation
  or making it compete visually with operational settings.
- [x] List every model-price entry currently authored by the loaded process,
  identified by its exact model name and showing the configured USD-per-million
  rate for ordinary input, cached-input reads, cache-write input, and output.
- [x] Present the configured rates as current USD prices per one million tokens,
  distinct from the accumulated historical cost. Keep the explanatory copy
  concise in accordance with user review.
- [x] Show one total accumulated estimated cost across every retained task in
  the current project state, including archived tasks and all of their agent
  conversations. Do not count the same cumulative thread checkpoint more than
  once.
- [x] Build the total from the authoritative conversation aggregation semantics
  established by issues 70, 75, and 76. Historical attempts keep their
  snapshotted rates; editing the process's current price table must not reprice
  earlier work.
- [x] Preserve truthful incomplete-data behavior. Priceable running work is
  pending, settled unpriced work makes the known total a lower bound, and a
  process with no known priced work must not present a misleading zero-dollar
  lifetime total.
- [x] Keep the current configured-price overview distinct from the historical
  total: a configured model may have no usage, and historical cost may include
  a model or earlier rate no longer present in the current process definition.
- [x] Present the statistics compactly and accessibly in dark and light themes,
  with responsive behavior suitable for the existing Settings surface and
  without requiring a Save or Apply action.
- [x] Add application coverage for cross-task and cross-conversation
  aggregation, archived tasks, cumulative resumed threads, replacement
  threads, historical price changes, pending runs, and unpriced settled work.
  Add browser coverage for the configured-rate table, total and lower-bound
  states, keyboard access, responsive layout, and both appearances.

## Context

Process-owned pricing is currently visible only indirectly through cost
controls attached to individual tasks and conversations. A user can inspect a
single calculation but cannot see which model rates the current process
defines or how much estimated cost has accumulated across the project as a
whole.

The existing Settings surface has room for this supporting information. Cost
statistics should remain discoverable but visually subordinate: this request
does not justify renaming Settings, creating a separate primary destination,
or changing how agents discover and use tools.

## Answer

Settings now includes a read-only Cost statistics category with compact Total
cost, Tasks, and AVG cost per task metrics. It lists every currently configured
model rate by exact model name and input, cached-input, cache-write, and output
price per million tokens.

The application aggregates authoritative conversation cost across all retained
tasks, including archived conversations. Archived records retain cumulative
thread checkpoints and historical pricing so resumed threads are not counted
twice and later process-price changes do not reprice completed work. Pending,
unpriced, and lower-bound states remain explicit when the total is incomplete.

The implementation includes application, persistence/restart, HTTP, and browser
coverage, including responsive dark and light appearances. Verification passed
with TypeScript typechecking, the production build, 243 application tests (3
skipped), 125 browser tests, and the focused cost-statistics browser checks.

## Comments

- 2026-08-29: Corrected the tracker workflow after implementation had
  inadvertently begun while the ticket still said `ready-for-agent`; recorded
  the claim before resolving the completed work.
