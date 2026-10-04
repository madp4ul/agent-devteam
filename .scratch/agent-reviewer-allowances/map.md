# Per-agent reviewer allowances

**Superseded 2026-10-04:** research and design are consolidated in
[current ticket 04](../framework-improvements-2026-09/issues/04-reduce-routine-permission-interruptions.md)
and its [agreed specification](../framework-improvements-2026-09/04-reviewer-allowances-spec.md).
Both preliminary tickets below are resolved by supersession, not independent
implementation work. The remaining text records the initial research state.

Origin: [framework improvement 04](../framework-improvements-2026-09/issues/04-reduce-routine-permission-interruptions.md).
Evidence: [research notes](../framework-improvements-2026-09/research/routine-permission-interruptions.md).

The user selected research into an allowance list beside agent definitions,
supplied to the existing Codex reviewer as additional policy. This is a selected
research direction, not an agreed implementation specification.

## Tickets

| Ticket | Type | Status | Dependencies |
| --- | --- | --- | --- |
| [01 — Verify additive reviewer-policy runtime support](issues/01-verify-additive-reviewer-policy-runtime.md) | research | resolved (superseded) | None |
| [02 — Agree per-agent allowance authority and lifecycle](issues/02-agree-per-agent-allowance-authority-and-lifecycle.md) | grilling | resolved (superseded) | None |

## Decisions so far

- Current official documentation describes `auto_review.extra_policy`, but the
  repository's bundled Codex 0.154.0 rejects the key in an isolated strict-config
  probe. A compatible runtime is a prerequisite to the selected approach.
- Allowances are intended as explicit user-defined reviewer guidance. They do
  not guarantee approval or enforce a hard allow-only command boundary.
- Do not substitute replacement reviewer policy or framework-authored user assent.
- No runtime upgrade, policy change, allowance schema, or implementation is agreed.
  After 02, write an agreed specification and publish dependency-aware delivery
  tickets before presenting the decision work as resolved.
