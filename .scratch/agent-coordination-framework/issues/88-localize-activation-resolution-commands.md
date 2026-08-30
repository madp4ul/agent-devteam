# 88 — Localize Activation Resolution Commands

**Type:** task

**What to build:** Keep every existing activation retry, continuation, and
dismissal workflow unchanged while placing their complete state-transition,
attention-resolution, suspension-clearing, activity, and idempotency behavior
behind one cohesive internal module, so ordinary task-command work no longer
requires navigating activation recovery mechanics.

**Blocked by:** None — can start immediately.

**Status:** resolved

## Maintainer outcome

This is a behavior-preserving deepening change for the project's AI maintainer.
The new module should make an activation-resolution change local without
introducing a second application authority, a generic repository, or a
pass-through interface. `CoordinationApplication` remains the public command
seam and the existing database owner continues to provide the transaction.

## Acceptance criteria

- [x] Ordinary queued-activation dismissal, interrupted-head dismissal, stale
  activation dismissal, failed-run retry, failed-run dismissal, and
  permission-block continuation are owned by one cohesive internal module.
- [x] The module owns the complete atomic result of each workflow: activation
  state, retry-cycle or continuation data, resolved startup-failure and
  attention state, task suspension state, immutable activity, and idempotent
  response.
- [x] Task creation, editing, movement, relationships, comments, mentions, and
  their resulting activations remain outside the activation-resolution module.
- [x] The interface uses domain commands and results and does not expose SQL,
  tables, row shapes, transaction controls, or storage-oriented identifiers to
  callers.
- [x] Application methods and browser and agent transport contracts retain
  their observable behavior, status mapping, provenance, and idempotency.
- [x] Existing activation-recovery, process-evolution, interruption, HTTP, MCP,
  and rendered-browser coverage continues to exercise public seams; add
  characterization only where an atomic outcome is not already protected.
- [x] Replace the old implementation rather than retaining it beneath a new
  pass-through layer, and stop if the extraction cannot reduce the interface
  or maintenance context without duplicating shared task policy.
- [x] Typechecking, focused tests, the full non-browser suite, production build,
  and affected browser suites are run, with pre-existing unrelated failures
  reported separately.
- [x] Inspect architecture documentation after implementation and update it
  only if an authoritative flow, state owner, runtime integration, or startup
  invariant materially changes.

## Answer

Added one internal `ActivationResolutionModule` that owns ordinary queued and
interrupted-head dismissal, stale-activation dismissal, failed-run retry and
dismissal, permission-block continuation, and interrupted-task continuation.
Its interface accepts the existing domain commands and returns the existing
domain results while keeping SQL, row shapes, transaction mechanics, and
idempotent response storage inside the module.

The old implementations were removed from `TaskCommandStore` and
`AutomationStateStore`. `CoordinationApplication` remains the public command
seam and retains configuration-error gating and automation wake-up behavior.
The new module participates in the existing database-owned transaction through
`IdempotentCommandExecutor`; it does not create another authority or generic
persistence interface. Task authoring, movement, relationships, comments,
mentions, activation creation, and runtime attempt settlement remain outside
the module.

Existing public-seam coverage already characterized the complete atomic
outcomes, so no implementation-coupled module test was added. Verification:

- TypeScript typechecking passed.
- All 20 focused activation-recovery, interruption, and process-evolution
  application tests passed.
- The production Vite build passed.
- The full Node suite ran 263 tests: 258 passed and 3 were skipped. Two
  unrelated existing runtime prompt-composition assertions remained
  reproducibly red because they expect text absent from the current prompt;
  issue 88 changes no runtime prompt or runtime test files.
- The affected automation browser suite passed 19 of 20 tests, including all
  queued dismissal, interrupted dismissal/continuation, failed recovery, and
  permission continuation scenarios. One unchanged process-remapping scenario
  remained reproducibly red after task-detail navigation returned `not found`.
- An additional unchanged attention browser test remained reproducibly red
  because it expects one button while the region contains two.
- The required two-axis review reported zero Standards findings and zero Spec
  findings.

`docs/architecture.md` was inspected and remains accurate: this extraction
does not change an authoritative flow, state owner, runtime integration, or
startup invariant, and the document already describes focused internal modules
participating on the shared database connection. No architecture update was
needed.
