# 89 — Reassess Automation Persistence Lifecycles

**Type:** research

**What to decide:** Determine whether runnable-activation selection, dispatch
claims, task-workspace registration, interruption and continuation, attempt
startup and settlement, transcript and usage persistence, retry scheduling,
and failure attention still form one deep persistence module or now warrant a
smaller set of lifecycle-focused internal modules.

**Blocked by:** 88 — Localize Activation Resolution Commands.

**Status:** resolved

## Maintainer decision

The agent doing this research is the intended long-term maintainer and likely
implementer. Optimize for its ability to locate a state transition, understand
the complete transaction, change one lifecycle safely, and verify it through
the public application seam. Do not split by table, line count, or method count.
A well-evidenced decision to keep the current module intact is valid.

## Investigation

- Reconstruct the authoritative activation and attempt state transitions across
  startup recovery, scheduling, claiming, thread start, interruption,
  continuation, completion, technical retry, permission block, and exhausted
  failure.
- Identify which operations must share one transaction and which dependencies
  and invariants actually change together. Include conversation activity,
  transcript usage isolation, token-cost evidence, workspace identity,
  attention, activity, idempotency, and the coordinator's in-memory run state.
- Compare at least three designs: retain the current module, separate queue and
  workspace dispatch from attempt settlement, and use lifecycle-focused modules
  around activation scheduling, active attempts, and retained evidence.
- Apply the deletion test to each proposed module. Reject pass-through stores,
  table repositories, duplicated SQL policy, and interfaces that leak
  transaction ordering to the coordinator.
- Determine whether the coordinator currently depends on persistence mechanics
  that should instead be hidden behind a deeper operation, and whether any
  proposed interface reduces rather than merely redistributes its knowledge.
- Use repository source, tests, architecture documentation, and decision history
  as primary evidence. Create a small state-model or interface prototype only
  if inspection cannot settle transaction ownership or interface depth.
- Do not implement the decomposition in this ticket.

## Expected result

Write a research note under the effort's `research/` directory and append the
answer here. Recommend one concrete module map, including “retain the current
module,” with its interfaces, transaction ownership, rejected alternatives,
incremental migration shape, verification seams, and stopping condition. If a
change is justified, propose fresh-context implementation tickets rather than
performing the refactor here.

## Acceptance criteria

- [x] The complete automation persistence state model and transaction
  invariants are recorded from repository evidence.
- [x] Alternatives are compared on depth, leverage, locality, interface size,
  coordinator knowledge, and testability rather than source length.
- [x] The recommendation preserves one database owner, workflow-owned atomic
  changes, application authority, deterministic scheduling, recovery safety,
  conversation continuity, and truthful attempt evidence.
- [x] Any proposed internal seam has a deletion-test justification and at least
  one complete lifecycle it hides from callers.
- [x] The result states whether architecture documentation or an ADR would need
  updating if the recommendation is implemented.
- [x] The result gives a clear no-change stopping condition and splits any
  justified implementation into independently green, fresh-context tickets.

## Answer

Replace `AutomationStateStore` with three lifecycle-focused internal modules
over the existing single `CoordinationDatabase`: `ActivationSchedulingModule`
for deterministic selection, durable dispatch claims, workspace registration,
dispatch release, and pre-runtime failure; `ActiveAttemptModule` for started
attempt recovery, thread association, interruption, settlement, retries,
attention, activity, conversation state, and interruption idempotency; and a
settlement-only `AttemptEvidenceModule` for transcript retention, cumulative
usage isolation, pricing snapshots, and attempt-cost evidence.

The complete state model, transaction inventory, source and test evidence,
three-way design comparison, interface sketches, deletion tests, verification
seams, migration shape, and stopping condition are recorded in
[Automation persistence lifecycle boundaries](../research/automation-persistence-lifecycles.md).

The split is justified by independent change axes rather than source length.
Queue eligibility and claim/workspace preparation, active attempt outcomes, and
truthful retained evidence each hide a complete policy. The coordinator should
continue to own asynchronous Git and Codex sequencing, retry-clock wakeups,
concurrency, abort controllers, pause/drain state, attachment projection
lifetime, and interruption confirmation. It should no longer know provisional
attempt/claim representation, workspace/start commit ordering, retry arithmetic,
attention rules, thread correlation writes, usage isolation, or idempotent
interruption settlement.

Retaining the current store remains the no-change fallback because it is not a
shallow module. A two-way dispatch/settlement split improves locality but leaves
failure policy and evidence semantics coupled. Table repositories and a
delegating facade are rejected because deleting them removes no policy and
would expose transaction ordering to callers.

Implement only through independently green, fresh-context tickets: 89A extracts
the private retained-evidence collaborator; 89B combines runnable selection and
claim while localizing workspace dispatch preparation; 89C deepens the remaining
active-attempt lifecycle, shares normal and host-stop retry policy, hides
run-start correlation, and removes `AutomationStateStore`. Stop and retain the
current module if any extraction duplicates SQL policy, moves async runtime
state into persistence, leaks transaction choreography, or weakens public-seam
coverage.

This is a code-only internal decomposition with no schema migration. A
behavior-preserving implementation does not require an architecture update or
ADR because the existing documentation already specifies one database owner,
workflow-owned transactions, focused internal modules, and coordinator-owned
runtime integration. Reinspect documentation after implementation; update it
only if authority, startup ordering, the Git/SQLite recovery protocol, crash
semantics, or durable schema actually changes.

## Follow-up tickets

- [91 — Extract Retained Attempt Evidence](./91-extract-retained-attempt-evidence.md)
- [92 — Localize Activation Dispatch Preparation](./92-localize-activation-dispatch-preparation.md)
- [93 — Deepen the Active Attempt Lifecycle](./93-deepen-active-attempt-lifecycle.md)
