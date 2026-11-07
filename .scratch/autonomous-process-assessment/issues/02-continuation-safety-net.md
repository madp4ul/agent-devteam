# Implement the selected continuation safety net

**Do not implement the earlier recursive-parent-recovery proposal.** The user
rejected that direction. Ticket 01 must be reconsidered against the
[finite-integration discussion](../discussion-handoff-2026-11-05.md); framework
work is contingent on a demonstrated remaining gap in the corrected process.

Type: task
Status: open
Blocked by: 01

## Problem

Instructions already request continued execution, but the demonstrated successful-run stop remains undetected. The safety net must detect missing executable ownership without equating all idle work with a failure.

## Scope

Implement only the contract selected in 01, in isolated development state. Start with bounded observable conditions if automatic correction cannot be justified. Preserve one authoritative application boundary, durable provenance, existing user holds, and explicit workflow completion.

## Acceptance

- The incident regressions from 01 fail before and pass after the implementation at the real seam.
- Legitimate dependencies, user decisions, pauses, permission blocks and stale process versions preserve their authority.
- Repeated reconciliation/restart cannot duplicate a handoff or silently discard requested work.
- No auto-completion based only on Git ancestry; no unbounded agent wake loop.
- Update architecture/ADR/contracts where required and run appropriate framework checks.
- Leave implementation unstaged for user review. Applying it to the running Idle Games host is a separate reviewed rollout, not part of research permission.

## Comments

2026-11-02: Dependent proposal. Exact API/storage/UI scope is intentionally deferred to 01.
