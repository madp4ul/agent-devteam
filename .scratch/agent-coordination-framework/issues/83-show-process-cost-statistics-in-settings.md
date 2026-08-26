# 83 — Show Process Cost Statistics in Settings

**What to build:** Add a quiet, read-only Cost statistics section to the
existing Settings surface that explains the process's configured model prices
and shows one accumulated estimated cost across all retained tasks.

**Blocked by:** 76 — Correct Conversation Cost Aggregation.

**Status:** ready-for-agent

- [ ] Keep the existing Settings name and entry point. Add Cost statistics as
  a secondary section rather than promoting cost into the primary navigation
  or making it compete visually with operational settings.
- [ ] List every model-price entry currently authored by the loaded process,
  identified by its exact model name and showing the configured USD-per-million
  rate for ordinary input, cached-input reads, cache-write input, and output.
- [ ] Make clear that these rates come from the process definition and are
  estimates used by this framework, not prices discovered from OpenAI billing
  or a provider invoice.
- [ ] Show one total accumulated estimated cost across every retained task in
  the current project state, including archived tasks and all of their agent
  conversations. Do not count the same cumulative thread checkpoint more than
  once.
- [ ] Build the total from the authoritative conversation aggregation semantics
  established by issues 70, 75, and 76. Historical attempts keep their
  snapshotted rates; editing the process's current price table must not reprice
  earlier work.
- [ ] Preserve truthful incomplete-data behavior. Priceable running work is
  pending, settled unpriced work makes the known total a lower bound, and a
  process with no known priced work must not present a misleading zero-dollar
  lifetime total.
- [ ] Keep the current configured-price overview distinct from the historical
  total: a configured model may have no usage, and historical cost may include
  a model or earlier rate no longer present in the current process definition.
- [ ] Present the statistics compactly and accessibly in dark and light themes,
  with responsive behavior suitable for the existing Settings surface and
  without requiring a Save or Apply action.
- [ ] Add application coverage for cross-task and cross-conversation
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
