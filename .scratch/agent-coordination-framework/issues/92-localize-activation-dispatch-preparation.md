# 92 — Localize Activation Dispatch Preparation

**Type:** task

**What to build:** Preserve deterministic activation order, competing-coordinator
safety, workspace identity, pause behavior, and startup-failure evidence while
placing runnable selection, durable claiming, workspace registration, release,
and attempt start behind complete dispatch-preparation operations.

**Blocked by:** 91 — Extract Retained Attempt Evidence.

**Status:** ready-for-agent

## Decision source

Implement the second independently green slice recommended by
[issue 89](./89-reassess-automation-persistence-lifecycles.md) and its
[research note](../research/automation-persistence-lifecycles.md). Keep Git
provisioning asynchronous and coordinator-owned, while hiding the database
protocol that surrounds it. Do not change the current schema or silently repair
an inconsistent workspace.

## Acceptance criteria

- [ ] One activation-scheduling module atomically selects and claims the next
  runnable activation while preserving mapping, stale-state, suspension,
  blocker, retry-due, strict queue-head, applied-agent, and immutable-provenance
  rules.
- [ ] A competing coordinator can receive only a contention/no-work result; the
  interface does not expose a caller-visible read-then-claim race or SQL row
  shape.
- [ ] The module owns complete operations for starting a prepared attempt,
  releasing an unstarted claim after pause, and recording pre-runtime startup
  failure. Only a still-claimed provisional attempt may be deleted.
- [ ] Starting a prepared attempt commits first-time workspace registration,
  attempt timing, start activity, conversation activity, and claim consumption
  atomically on the shared database connection.
- [ ] Git worktree provisioning and verification remain outside SQLite
  transactions. A failed database commit after external provisioning fails
  closed on restart and never adopts, reconstructs, or deletes inconsistent
  workspace state automatically.
- [ ] The coordinator retains asynchronous Git sequencing but no longer knows
  provisional-attempt deletion, dispatch-claim representation, workspace/start
  commit ordering, or run-start persistence mechanics.
- [ ] Characterization covers pause after claim and workspace preparation but
  before start, including no runtime dispatch, restored continuation data, no
  retained attempt-start activity, and a correctly queued activation.
- [ ] Startup continues to validate database records, physical directories, and
  Git registrations before host-stop attempt recovery or process mutation.
- [ ] Replace superseded scheduling and dispatch-preparation methods rather than
  layering a pass-through facade; stop if the interface leaks transaction
  choreography or requires runtime promises and cancellation state.
- [ ] Run typechecking, focused scheduling/workspace/recovery tests, the full
  non-browser suite, production build, affected browser suites, and the required
  two-axis code review, reporting unrelated pre-existing failures separately.
- [ ] Inspect architecture documentation after implementation and update it only
  if an authoritative flow, owner, runtime integration, startup invariant, or
  crash contract materially changes.

