# 92 — Localize Activation Dispatch Preparation

**Type:** task

**What to build:** Preserve deterministic activation order, competing-coordinator
safety, workspace identity, pause behavior, and startup-failure evidence while
placing runnable selection, durable claiming, workspace registration, release,
and attempt start behind complete dispatch-preparation operations.

**Blocked by:** 91 — Extract Retained Attempt Evidence.

**Status:** resolved

## Decision source

Implement the second independently green slice recommended by
[issue 89](./89-reassess-automation-persistence-lifecycles.md) and its
[research note](../research/automation-persistence-lifecycles.md). Keep Git
provisioning asynchronous and coordinator-owned, while hiding the database
protocol that surrounds it. Do not change the current schema or silently repair
an inconsistent workspace.

## Acceptance criteria

- [x] One activation-scheduling module atomically selects and claims the next
  runnable activation while preserving mapping, stale-state, suspension,
  blocker, retry-due, strict queue-head, applied-agent, and immutable-provenance
  rules.
- [x] A competing coordinator can receive only a contention/no-work result; the
  interface does not expose a caller-visible read-then-claim race or SQL row
  shape.
- [x] The module owns complete operations for starting a prepared attempt,
  releasing an unstarted claim after pause, and recording pre-runtime startup
  failure. Only a still-claimed provisional attempt may be deleted.
- [x] Starting a prepared attempt commits first-time workspace registration,
  attempt timing, start activity, conversation activity, and claim consumption
  atomically on the shared database connection.
- [x] Git worktree provisioning and verification remain outside SQLite
  transactions. A failed database commit after external provisioning fails
  closed on restart and never adopts, reconstructs, or deletes inconsistent
  workspace state automatically.
- [x] The coordinator retains asynchronous Git sequencing but no longer knows
  provisional-attempt deletion, dispatch-claim representation, workspace/start
  commit ordering, or run-start persistence mechanics.
- [x] Characterization covers pause after claim and workspace preparation but
  before start, including no runtime dispatch, restored continuation data, no
  retained attempt-start activity, and a correctly queued activation.
- [x] Startup continues to validate database records, physical directories, and
  Git registrations before host-stop attempt recovery or process mutation.
- [x] Replace superseded scheduling and dispatch-preparation methods rather than
  layering a pass-through facade; stop if the interface leaks transaction
  choreography or requires runtime promises and cancellation state.
- [x] Run typechecking, focused scheduling/workspace/recovery tests, the full
  non-browser suite, production build, affected browser suites, and the required
  two-axis code review, reporting unrelated pre-existing failures separately.
- [x] Inspect architecture documentation after implementation and update it only
  if an authoritative flow, owner, runtime integration, startup invariant, or
  crash contract materially changes.

## Answer

Added one internal `ActivationSchedulingModule` that owns deterministic runnable
selection and durable claiming in a single `BEGIN IMMEDIATE` transaction. Its
returned domain claim hydrates the immutable activation provenance, current task,
snapshotted agent profile, conversation continuity, prior process version, and
registered workspace without exposing a caller-visible candidate-read/claim race
or SQL row shape.

The module now owns complete prepared-dispatch transitions: first-time workspace
registration and attempt start commit atomically with timing, `attempt.started`
activity, conversation activity, and claim consumption; pause releases only a
still-claimed provisional attempt and restores its continuation; pre-runtime Git
failure deletes only that same provisional state while retaining startup failure,
attention, activity, and notification evidence. The coordinator still sequences
asynchronous Git and runtime work, but no longer knows the provisional deletion,
workspace persistence ordering, or run-start persistence protocol. Superseded
selection, claim, workspace-save, release, start, and startup-failure methods were
removed from `AutomationStateStore` rather than retained behind a facade.

Added public-seam characterization for pausing after workspace verification but
before attempt start. It proves zero additional runtime dispatch, restored
continuation guidance, a correctly queued activation, no provisional attempt,
and no extra start activity. A second characterization injects a start-transaction
failure after Git provisioning: SQLite registration and start evidence roll back,
the external worktree remains untouched, and restart fails closed on the
database/directory/Git identity mismatch instead of adopting or deleting it.

Verification:

- TypeScript typechecking passed.
- All 33 focused scheduling, workspace, pause, activation-recovery, and restart
  tests passed (including the two new characterizations).
- The full Node suite ran 265 tests: 260 passed and 3 were skipped. The same two
  unrelated pre-existing runtime prompt assertions recorded by tickets 88 and 91
  remain red because they expect `Do not inspect the task merely to confirm
  delivery`, text absent from the unchanged current prompt.
- The production Vite build passed.
- The affected task-workspace browser suite passed all 4 scenarios.
- The required independent two-axis review reported zero Standards findings and
  zero Spec findings.

`docs/architecture.md` was inspected and remains accurate. The implementation
deepens an existing internal module boundary over the same database authority,
coordinator runtime ownership, startup validation order, and fail-closed crash
contract, so no architecture or ADR update was needed.
