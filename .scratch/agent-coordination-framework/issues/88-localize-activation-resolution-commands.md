# 88 — Localize Activation Resolution Commands

**Type:** task

**What to build:** Keep every existing activation retry, continuation, and
dismissal workflow unchanged while placing their complete state-transition,
attention-resolution, suspension-clearing, activity, and idempotency behavior
behind one cohesive internal module, so ordinary task-command work no longer
requires navigating activation recovery mechanics.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

## Maintainer outcome

This is a behavior-preserving deepening change for the project's AI maintainer.
The new module should make an activation-resolution change local without
introducing a second application authority, a generic repository, or a
pass-through interface. `CoordinationApplication` remains the public command
seam and the existing database owner continues to provide the transaction.

## Acceptance criteria

- [ ] Ordinary queued-activation dismissal, interrupted-head dismissal, stale
  activation dismissal, failed-run retry, failed-run dismissal, and
  permission-block continuation are owned by one cohesive internal module.
- [ ] The module owns the complete atomic result of each workflow: activation
  state, retry-cycle or continuation data, resolved startup-failure and
  attention state, task suspension state, immutable activity, and idempotent
  response.
- [ ] Task creation, editing, movement, relationships, comments, mentions, and
  their resulting activations remain outside the activation-resolution module.
- [ ] The interface uses domain commands and results and does not expose SQL,
  tables, row shapes, transaction controls, or storage-oriented identifiers to
  callers.
- [ ] Application methods and browser and agent transport contracts retain
  their observable behavior, status mapping, provenance, and idempotency.
- [ ] Existing activation-recovery, process-evolution, interruption, HTTP, MCP,
  and rendered-browser coverage continues to exercise public seams; add
  characterization only where an atomic outcome is not already protected.
- [ ] Replace the old implementation rather than retaining it beneath a new
  pass-through layer, and stop if the extraction cannot reduce the interface
  or maintenance context without duplicating shared task policy.
- [ ] Typechecking, focused tests, the full non-browser suite, production build,
  and affected browser suites are run, with pre-existing unrelated failures
  reported separately.
- [ ] Inspect architecture documentation after implementation and update it
  only if an authoritative flow, state owner, runtime integration, or startup
  invariant materially changes.

