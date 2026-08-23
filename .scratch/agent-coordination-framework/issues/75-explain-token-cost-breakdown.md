# 75 — Explain Token Cost Breakdown

**Type:** task

**What to build:** Make each available cost control disclose how its displayed
USD total was calculated from token quantities and the process-owned rate for
each billable token category.

**Blocked by:** None

**Status:** open

## User experience

- Keep the existing compact cost total in run headers, agent-conversation
  headers, and the task-detail Conversations panel header.
- Hovering the cost control should reveal a compact breakdown. The same detail
  must be reachable by keyboard focus and activation; provide an operable
  click/tap disclosure when a transient tooltip would not work for touch or
  assistive-technology users.
- Show one calculation row for each applicable billing category: ordinary
  input, cached-input reads, cache-write input, and output. Each row shows the
  token quantity, snapshotted USD rate per million tokens, and resulting USD
  subtotal.
- When reasoning-token usage is available, identify it as part of output rather
  than charging it again as a separate category unless a future pricing schema
  explicitly gives it a distinct rate.
- Preserve the current two-decimal total in the compact control. Use enough
  precision inside the breakdown for small subtotals to remain meaningful and
  make rounding understandable.

## Aggregated controls

- An attempt control shows that attempt's calculation.
- A conversation control aggregates the known settled attempts included in its
  displayed total. The Conversations-panel control aggregates the same known
  costs across its conversations.
- If historical attempts used different snapshotted rates, do not imply that
  one current rate applies to every token. Split otherwise-identical categories
  by rate or group them by attempt so the subtotals reconcile truthfully.
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
- Give the disclosure an accessible name and deterministic focus, dismissal,
  and Escape behavior. Hover-only content is insufficient.
- Keep the detail visually subordinate to task content and readable in both
  dark and light themes without enlarging the resting header controls.
- Add browser coverage for pointer and keyboard access, category calculations,
  small-value precision, aggregation across different rates, lower-bound and
  pending explanations, dismissal, and both appearance themes.

## Context

Issue 70 intentionally made the resting cost presentation compact. The total
is useful for comparison, but it does not let a user verify whether a run was
mostly ordinary input, discounted cache reads, cache writes, or output. This
ticket adds an inspectable explanation without turning the primary transcript
surface into a billing table or claiming invoice authority.
