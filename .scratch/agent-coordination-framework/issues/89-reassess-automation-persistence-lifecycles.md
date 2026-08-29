# 89 — Reassess Automation Persistence Lifecycles

**Type:** research

**What to decide:** Determine whether runnable-activation selection, dispatch
claims, task-workspace registration, interruption and continuation, attempt
startup and settlement, transcript and usage persistence, retry scheduling,
and failure attention still form one deep persistence module or now warrant a
smaller set of lifecycle-focused internal modules.

**Blocked by:** 88 — Localize Activation Resolution Commands.

**Status:** ready-for-agent

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

- [ ] The complete automation persistence state model and transaction
  invariants are recorded from repository evidence.
- [ ] Alternatives are compared on depth, leverage, locality, interface size,
  coordinator knowledge, and testability rather than source length.
- [ ] The recommendation preserves one database owner, workflow-owned atomic
  changes, application authority, deterministic scheduling, recovery safety,
  conversation continuity, and truthful attempt evidence.
- [ ] Any proposed internal seam has a deletion-test justification and at least
  one complete lifecycle it hides from callers.
- [ ] The result states whether architecture documentation or an ADR would need
  updating if the recommendation is implemented.
- [ ] The result gives a clear no-change stopping condition and splits any
  justified implementation into independently green, fresh-context tickets.

