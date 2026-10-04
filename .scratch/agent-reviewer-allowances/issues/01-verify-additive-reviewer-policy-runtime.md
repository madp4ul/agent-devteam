# 01 — Verify additive reviewer-policy runtime support

**Type:** research
**Status:** resolved
**Blocked by:** None

## Question

Which supported bundled Codex version can deliver `auto_review.extra_policy`
through the framework's TypeScript SDK, preserving main and managed policy?

Bundled 0.154.0 rejects the setting. Follow the
[recorded evidence](../../framework-improvements-2026-09/research/routine-permission-interruptions.md),
not SDK generic-config typing or acceptance without strict validation.

## Completion criteria

- Establish compatible SDK/CLI versions through primary evidence and an isolated
  strict-config probe with baseline and unknown-key controls.
- Verify actual reviewer delivery, fresh/resumed behavior and managed precedence;
  distinguish offline schema proof from any model-backed behavioral proof.
- Determine whether generated extra policy replaces inherited local extra text,
  and identify supported effective-policy discovery/composition options.
- Identify supported behavior when additive policy is unavailable or suppressed.
  Do not substitute `auto_review.policy` or fake a user continuation.
- Record upgrade impact and remaining proof requirements. A dependency upgrade is
  a separate delivery change, not implied by this research ticket.

## Comments

- 2026-10-04: Published from framework ticket 04 research. Existing incident logs
  are unavailable; this ticket establishes mechanism support, not incident cause.

## Answer

2026-10-04: Resolved by supersession. Verified native fresh/resumed delivery and
accepted optional-add-on design are retained in
[current ticket 04](../../framework-improvements-2026-09/issues/04-reduce-routine-permission-interruptions.md)
and its [specification](../../framework-improvements-2026-09/04-reviewer-allowances-spec.md).
The user approved implementation with baseline fallback and considers the design
questions answered. Historical criteria above are not separate blocking work;
remaining delivery and compatibility verification belong to ticket 04.
