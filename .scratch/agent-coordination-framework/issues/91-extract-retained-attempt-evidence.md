# 91 — Extract Retained Attempt Evidence

**Type:** task

**What to build:** Keep every existing attempt transcript, usage, pricing, and
cost outcome unchanged while moving the complete retained-evidence policy behind
one settlement-only internal module, so a maintainer can change truthful attempt
evidence without navigating scheduling, workspace dispatch, retry, interruption,
or coordinator mechanics.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

## Decision source

Implement the first independently green slice recommended by
[issue 89](./89-reassess-automation-persistence-lifecycles.md) and its
[research note](../research/automation-persistence-lifecycles.md). Preserve one
database owner and the current workflow-owned settlement transaction. This is a
behavior-preserving extraction, not a schema or evidence-semantics redesign.

## Acceptance criteria

- [ ] One private retained-evidence module owns attempt transcript upsert,
  cumulative same-thread usage baseline lookup and isolation, invalid or
  negative-delta rejection, snapshotted pricing, and attempt-cost evidence.
- [ ] The module has one settlement-oriented interface and is injected only
  into the attempt-settlement owner; it is not exposed through
  `CoordinationPersistence`, `CoordinationApplication`, or the automation
  coordinator.
- [ ] Evidence writes participate in the caller's existing SQLite transaction;
  the module opens no connection or transaction and exposes no table rows,
  query ordering, or transcript CRUD interface.
- [ ] Fresh threads, resumed threads, replacement threads, archived conversation
  checkpoints, missing baselines, malformed evidence, pricing changes, and
  unknown-cost lower bounds retain their current observable behavior.
- [ ] Context-window evidence remains distinct from cumulative token and cost
  evidence, and absent evidence is never converted into zero usage.
- [ ] Replace the old evidence implementation rather than retaining it beneath
  a delegating facade; stop if the extraction becomes table-oriented or forces
  the coordinator to assemble evidence steps.
- [ ] Existing permission-continuation, conversation transcript, token-cost,
  archival, restart, HTTP, and browser behavior remains green through public
  seams; add focused characterization only for an atomic rollback or evidence
  edge not already protected.
- [ ] Run typechecking, focused tests, the full non-browser suite, production
  build, affected browser suites, and the required two-axis code review, with
  unrelated pre-existing failures reported separately.
- [ ] Inspect architecture documentation after implementation and update it only
  if an authoritative flow, owner, runtime integration, startup invariant, or
  crash contract materially changes.

