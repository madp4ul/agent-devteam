# 91 — Extract Retained Attempt Evidence

**Type:** task

**What to build:** Keep every existing attempt transcript, usage, pricing, and
cost outcome unchanged while moving the complete retained-evidence policy behind
one settlement-only internal module, so a maintainer can change truthful attempt
evidence without navigating scheduling, workspace dispatch, retry, interruption,
or coordinator mechanics.

**Blocked by:** None — can start immediately.

**Status:** resolved

## Decision source

Implement the first independently green slice recommended by
[issue 89](./89-reassess-automation-persistence-lifecycles.md) and its
[research note](../research/automation-persistence-lifecycles.md). Preserve one
database owner and the current workflow-owned settlement transaction. This is a
behavior-preserving extraction, not a schema or evidence-semantics redesign.

## Acceptance criteria

- [x] One private retained-evidence module owns attempt transcript upsert,
  cumulative same-thread usage baseline lookup and isolation, invalid or
  negative-delta rejection, snapshotted pricing, and attempt-cost evidence.
- [x] The module has one settlement-oriented interface and is injected only
  into the attempt-settlement owner; it is not exposed through
  `CoordinationPersistence`, `CoordinationApplication`, or the automation
  coordinator.
- [x] Evidence writes participate in the caller's existing SQLite transaction;
  the module opens no connection or transaction and exposes no table rows,
  query ordering, or transcript CRUD interface.
- [x] Fresh threads, resumed threads, replacement threads, archived conversation
  checkpoints, missing baselines, malformed evidence, pricing changes, and
  unknown-cost lower bounds retain their current observable behavior.
- [x] Context-window evidence remains distinct from cumulative token and cost
  evidence, and absent evidence is never converted into zero usage.
- [x] Replace the old evidence implementation rather than retaining it beneath
  a delegating facade; stop if the extraction becomes table-oriented or forces
  the coordinator to assemble evidence steps.
- [x] Existing permission-continuation, conversation transcript, token-cost,
  archival, restart, HTTP, and browser behavior remains green through public
  seams; add focused characterization only for an atomic rollback or evidence
  edge not already protected.
- [x] Run typechecking, focused tests, the full non-browser suite, production
  build, affected browser suites, and the required two-axis code review, with
  unrelated pre-existing failures reported separately.
- [x] Inspect architecture documentation after implementation and update it only
  if an authoritative flow, owner, runtime integration, startup invariant, or
  crash contract materially changes.

## Answer

Added one internal `AttemptEvidenceModule` with the single settlement-oriented
operation `recordWithinSettlement`. It owns transcript upsert, archived and
live same-thread baseline selection, cumulative usage isolation, invalid-delta
rejection, process-price snapshots, and price-derived attempt cost evidence.
The old evidence methods and helpers were removed from `AutomationStateStore`.

`CoordinationPersistence` constructs the module privately and injects it only
into `AutomationStateStore`, the current attempt-settlement owner. Both normal
completion and user interruption invoke it inside their existing
`CoordinationDatabase.transaction` callback. The module shares the existing
connection, opens no connection or transaction, and exposes no transcript CRUD,
table rows, query ordering, or partial evidence steps. Context-window evidence
remains a separate direct attempt snapshot in the settlement owner, as designed.

Existing public-seam coverage already characterized every requested evidence
edge, so no implementation-coupled test was added. Verification:

- TypeScript typechecking passed.
- All 38 focused permission-continuation, interruption, conversation,
  transcript/restart, usage-isolation, archived-checkpoint, pricing, cost, and
  context-window application tests passed.
- The production Vite build passed.
- The three affected browser suites passed all 34 token-cost, conversation
  transcript, and conversation-lifecycle scenarios.
- The full Node suite ran 263 tests: 258 passed and 3 were skipped. Two unrelated
  pre-existing runtime prompt-composition assertions remained red because they
  expect `Do not inspect the task merely to confirm delivery`, text absent from
  the unchanged current prompt. Ticket 91 changes no runtime prompt or runtime
  test file; ticket 88 records the same failures.
- The required independent two-axis review reported zero Standards findings and
  zero Spec findings.

`docs/architecture.md` was inspected and remains accurate. This internal
extraction does not change an authoritative flow, owner, runtime integration,
startup invariant, crash contract, or schema; the document already describes
focused internal modules participating on the shared database connection. No
architecture or ADR update was needed.
