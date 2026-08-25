# 75 — Explain Token Cost Breakdown

**Type:** task

**What to build:** Make each available cost control disclose how its displayed
USD total was calculated from token quantities and the process-owned rate for
each billable token category.

**Blocked by:** None

**Status:** resolved

## User experience

- Keep the existing compact cost total in the agent-conversation header and the
  task-detail Conversations panel header.
- Hovering or focusing the cost control reveals a small tooltip with a bullet
  for each reported billable category: ordinary input, cached-input reads,
  cache-write input, and output. Each bullet shows token quantity, snapshotted
  USD rate per million tokens, and resulting USD subtotal.
- Do not show reasoning-token usage separately because it is already included
  in output and has no distinct process-defined rate.
- Preserve the current two-decimal total in the compact control. Use enough
  three decimal places for the smaller subtotals inside the breakdown.

## Aggregated controls

- An attempt control shows that attempt's calculation.
- A conversation control aggregates the known settled attempts included in its
  displayed total. The Conversations-panel control aggregates the same known
  costs across its conversations.
- In the Conversations panel, combine token counts for the same billing
  category and rate so the task-wide tooltip stays compact.
- Preserve each attempt's snapshotted rows when aggregating, so historical
  attempts with different rates remain truthful.
- Preserve issue 70's lower-bound behavior: when settled attempts without cost
  are excluded, explain that the shown breakdown covers known costs only.
- Preserve pending behavior: active priceable attempts remain excluded until
  usage settles, and the breakdown explains that the displayed total will
  update rather than inventing live token quantities.
- Do not render a disclosure when cost itself is unavailable.

## Correctness and accessibility

- Derive ordinary input without double-counting the reported cached-input and
  cache-write subsets. Every displayed category subtotal must reconcile with
  the persisted attempt estimate, subject only to presentation rounding.
- Use the attempt's persisted usage and snapshotted pricing semantics; later
  process edits must not rewrite historical breakdowns.
- Give the disclosure an accessible name, keyboard focus, and Escape dismissal.
- Keep the detail visually subordinate to task content and readable in both
  dark and light themes without enlarging the resting header controls.
- Add focused application and browser coverage for persistence, aggregation,
  pointer and keyboard access, calculations, and pending/lower-bound notes.

## Context

Issue 70 intentionally made the resting cost presentation compact. The total
is useful for comparison, but it does not let a user verify whether a run was
mostly ordinary input, discounted cache reads, cache writes, or output. This
ticket adds an inspectable explanation without turning the primary transcript
surface into a billing table or claiming invoice authority.

## Answer

Implemented as a lightweight tooltip on both existing aggregate cost controls.
Each settled priced attempt snapshots its ordinary-input, cached-input,
cache-write-input, and output token counts together with the rate used. The
tooltip renders those rows as `tokens × USD/1M = subtotal`; reasoning-token
usage is neither displayed separately nor charged twice. The task-level view
groups equal categories and rates across conversations and shows subtotals to
three decimal places. Both totals combine only complete known breakdowns while
retaining the existing pending and lower-bound explanations.
