# Define verifiable continuation and reproduce the known stops

**Scope revision required:** the user rejected recovering parents merely because
their children occupy unwatched columns. Read the
[discussion handoff](../discussion-handoff-2026-11-05.md) before pursuing this
ticket. Correct the process lifecycle and user-column semantics first; earlier
graph-recovery proposals below are historical, not an accepted direction.

Type: research
Status: open
Blocked by: none

## Problem

The watched Integration task can finish a turn with outstanding work while its children wait for its checks. Existing recovery treats any unresolved relationship as continuation. A Ready handoff can also omit the request because a recipient was busy. See assessment sections 1–2 and the exact retained November 2 transcript.

## Outcome

Define the smallest contract that distinguishes running/queued ownership, independently progressing dependency work, a legitimate user decision, an explicit pause, and an orphaned next action. Decide which guarantees belong to process conventions and which need framework support. Evaluate finite integration units without assuming that new tasks alone solve liveness. Include coexistence with retries, stale definitions, attention, suspension, and retirement.

Build isolated fixtures at the actual command/settlement/reconciliation boundary for: missed incoming request; received request followed by incomplete successful run; integrated/checks-passed feature whose status was not reconciled; and legitimate human wait. No live replay or runtime instrumentation.

## Acceptance

- A command exercises the real framework behavior and detects the known failure, rather than asserting a duplicate toy implementation.
- Contract names responsible owner, next action, wake/acknowledgment evidence, and completion meaning without relying on ongoing T2 reaching Completion.
- Compare alternatives: diagnostic only, typed handoff/continuation, graph-aware recovery, process-only change. Explain false positives and duplicate dispatch prevention.
- Record architecture/ADR implications as proposals. Update ticket 02 with the selected scope and publish further delivery slices if needed.

## Comments

2026-11-02: Proposed by assessment; no implementation choice or live rollout approved here.

2026-11-05: [Current live-chain assessment](../2026-11-05-waits/assessment.md)
confirms the revised process is active but the framework coverage gap remains.
Concrete cases now include T2 -> T279 parked in scheduling Backlog and T1 -> T288
already integrated but externally blocked without user attention. Include
branch-local recovery despite unrelated active work, parent-owned resource
allocation without cyclic Completion dependencies, and explicit dormant versus
active intent when designing the contract. Preserve actual human waits and
distinguish side research from checkpoint delivery scope.
