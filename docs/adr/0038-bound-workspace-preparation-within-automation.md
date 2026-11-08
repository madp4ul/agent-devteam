# 0038: Bound workspace preparation within automation

Status: Accepted

## Context

A large checkout blocked the automation loop while unrelated eligible tasks
waited. Claiming is durable and must precede asynchronous Git operations, but
that does not require the scheduler to await the checkout before selecting work
for another task. Existing workspaces still need verification before execution.

## Decision

Keep one coordinator and eligibility authority. The existing pump tracks each
dispatch from claim through preparation and attempt settlement, admitting other
tasks while those promises are pending. The scheduler transaction filters by
available preparation capacity before claiming, while retaining the existing
earliest-unfinished-activation, stale-process and suspension predicates.

Use two independent bounded lanes: two new-workspace creations and two existing
workspace verifications. This small fixed policy bounds filesystem/Git pressure
without letting long checkouts occupy the verification capacity needed by ready
tasks. These are preparation limits, not model concurrency limits. Completion
releases its lane and wakes the same pump before waiting for the model outcome.
Repeated Resume while running reuses that pump rather than creating another.

The coordinator owns ephemeral preparation views with task, activation, agent,
creation/verification stage and start time. Durable dispatch claims remain the
ownership/recovery authority; no schema change or second scheduler is needed.
Active-run queries include only runtime controls actually started by this host,
including provisional runtime retry probes, and exclude preparation claims.
Git progress transport and browser presentation are the follow-on ticket 12.

Pause forbids new claims and runtime starts, but drains already-owned preparation
and agent execution. Successful preparation retains its workspace atomically
with start or claim release, as in ADR 0036. Failed preparation records its
task-local startup diagnostic and requires explicit recovery; other tasks keep
dispatching. If an initial Resume produces no run and only preparation failures,
its existing failure response and paused state remain. Unexpected persistence
failures remain fatal rather than being classified as ordinary Git failures.

Graceful host shutdown pauses and awaits automation idle before closing storage.
An immediate close prevents further persistence and runtime starts after Git
returns. It does not cancel a destructive Git operation or adopt an unrecorded
checkout: retained claims and filesystem evidence remain subject to fail-closed
startup consistency checks and explicit recovery.

## Verification

Application regressions hold real provisioning at a controlled boundary, observe
ready-work bypass under saturated creation capacity, simultaneous completion,
claim uniqueness and per-task ordering, failure isolation, preparation lifecycle,
pause/restart reuse and immediate-close refusal to adopt unknown checkout state.
Existing transient-probe, interruption, startup failure and recovery tests remain
part of the compatibility suite.
