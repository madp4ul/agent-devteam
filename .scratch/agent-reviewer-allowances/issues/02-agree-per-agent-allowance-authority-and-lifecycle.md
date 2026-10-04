# 02 — Agree per-agent allowance authority and lifecycle

**Type:** grilling
**Status:** resolved
**Blocked by:** None — superseded

## Question

How should the user define, authorize, inspect and revoke per-agent allowance
guidance while the native Codex reviewer retains its policy boundary?

Origin: [framework ticket 04](../../framework-improvements-2026-09/issues/04-reduce-routine-permission-interruptions.md).
Start with the [research findings](../../framework-improvements-2026-09/research/routine-permission-interruptions.md).

## Decisions to resolve with the user

- Structured YAML entries versus a separate Markdown policy file beside role
  instructions; choose terminology that does not promise hard command enforcement.
- Actual user authorization and trusted applied-process source. Agents must not
  grant themselves authority by editing a task worktree, comment or pin.
- Action, target and side-effect scope; omission, ambiguity, conflicting guidance,
  inherited extra-policy composition and managed-policy suppression.
- Process fingerprint, grant provenance and attempt evidence; application on fresh,
  resumed and replacement threads without preserving expired authorization.
- Effective revocation time. Pausing prevents new dispatch but drains running
  attempts; immediate withdrawal also needs interruption and confirmation.
- Revisit CONTEXT.md's shared runtime capability policy explicitly: per-agent
  reviewer guidance refines delegated intent without replacing technical limits.

## Completion criteria

Capture user-agreed examples and lifecycle rules in a dedicated specification.
Record durable authority decisions in an ADR and reconcile domain/architecture
docs as applicable. Publish dependency-aware implementation tickets for the
agreed design and link them here and in the map before resolving this decision.

## Answer

2026-10-04: Resolved by supersession. Verified native fresh/resumed delivery and
accepted optional-add-on design are retained in
[current ticket 04](../../framework-improvements-2026-09/issues/04-reduce-routine-permission-interruptions.md)
and its [specification](../../framework-improvements-2026-09/04-reviewer-allowances-spec.md).
The user approved implementation with baseline fallback and considers the design
questions answered. Historical criteria above are not separate blocking work;
remaining delivery and compatibility verification belong to ticket 04.
