# Automation persistence lifecycle boundaries

Date: 2026-08-30

## Verdict

Replace `AutomationStateStore` with three lifecycle-focused internal modules:

1. `ActivationSchedulingModule` owns deterministic runnable selection, durable
   dispatch claims, task-workspace registration, dispatch release, and
   pre-runtime startup failure.
2. `ActiveAttemptModule` owns started-attempt recovery, thread association,
   interruption, settlement, retry/exhaustion policy, active-run projections,
   conversation activity, activity evidence, attention, notifications, and the
   durable half of interruption idempotency.
3. `AttemptEvidenceModule` is a settlement-only collaborator of
   `ActiveAttemptModule`; it owns transcript upsert, cumulative-usage isolation,
   snapshotted pricing, and attempt-cost evidence while participating in the
   caller's transaction.

This is a behavioral decomposition over the existing single
`CoordinationDatabase`. It must not create table repositories, independent
connections, nested transactions, or a persistence facade that forwards every
method. `CoordinationApplication` remains the public authority, and
`AutomationCoordinator` remains the asynchronous runtime owner.

The current store is cohesive at the database-owner level but no longer at the
change-axis level. Queue eligibility and dispatch claiming, active-attempt
state transitions, and retained usage/cost evidence have separate invariants
and test suites. The coordinator currently calls twelve distinct store
operations directly, while application startup and interruption scope add more
store capabilities, and it sequences several storage mechanics itself
([coordinator construction and dependencies](../../../src/application/internal/automation-coordinator.ts#L36-L109),
[dispatch protocol](../../../src/application/internal/automation-coordinator.ts#L279-L472)).
The proposed map reduces that knowledge without moving async runtime control or
filesystem ownership into persistence.

## Evidence and scope

This note uses repository source, public application tests, the implemented
architecture map, and prior issue outcomes as primary evidence. No prototype
was necessary: the transaction owner and every transition are explicit in the
current synchronous SQLite implementation. `CoordinationDatabase` exclusively
owns `BEGIN IMMEDIATE`, commit, and rollback
([transaction primitive](../../../src/application/internal/coordination-database.ts#L18-L30));
the composition root gives every focused module the same owner and connection
([persistence composition](../../../src/application/internal/coordination-persistence.ts#L34-L91)).

The architectural constraints are already explicit: application workflows own
atomic changes, internal modules share one connection, and adapters do not
become authorities
([architecture: Coordination core](../../../docs/architecture.md#coordination-core),
[architecture: principles](../../../docs/architecture.md#architectural-principles)).
Issue 29 deliberately left automation selection, workspace registration,
attempt state, startup failures, and activity in one module after removing the
old all-purpose store
([issue 29 outcome](../issues/29-decompose-coordination-persistence.md#answer)).
Issue 88 has since removed user-driven activation resolution from that store
and proved that a behavior-complete internal command module can deepen the
interface without changing authority
([issue 88 outcome](../issues/88-localize-activation-resolution-commands.md#answer)).

## Authoritative state model

### Durable states

An activation has persisted states `queued`, `running`, `completed`, and
`failed`; dismissal is represented by `status = 'completed'` plus
`resolution = 'dismissed'`. An attempt has `running`, `completed`, or `failed`;
the public projection derives user interruption and permission block from the
persisted outcome fields. A dispatch claim is a short-lived durable marker tied
one-to-one to the provisional attempt and activation. The schema also enforces
one running activation per task and rejects an out-of-order transition to
`running`
([activation, attempt, and claim schema](../../../src/application/internal/coordination-database.ts#L111-L250),
[order index and trigger](../../../src/application/internal/coordination-database.ts#L333-L358)).

The practical state machine is:

```text
activation queued
  -> claimed: activation running + provisional running attempt + dispatch claim
     -> preparation released: provisional attempt/claim deleted; activation queued
     -> preparation failed: provisional attempt/claim deleted; activation failed
     -> attempt started: claim deleted; attempt.started activity retained
        -> completed: attempt completed; activation completed
        -> technical failure, cycle < 3: attempt failed; activation queued + retry_due_at
        -> technical failure, cycle exhausted: attempt failed; activation failed + attention
        -> permission block: attempt failed; activation failed + attention
        -> user interruption: attempt failed/interrupted; activation queued; task suspended
        -> host stop: attempt failed; then queued retry or exhausted failure

queued interrupted activation + Continue
  -> continuation message stored; task suspension cleared; same activation remains queued

failed activation + explicit Retry/Continue
  -> attention resolved; retry cycle reset; same activation queued

failed/queued activation + Dismiss
  -> activation completed with dismissal resolution; no attempt is invented
```

### Transition and transaction inventory

| Transition | Atomic durable facts | Current owner and evidence |
| --- | --- | --- |
| Activation creation | Activation snapshot, conversation selection/creation, activation-to-conversation link, `activation.created` activity, conversation activity cursor | The task or conversation command's transaction invokes `ActivationCreationModule`; ordinary creation retains immutable target/profile/process version and current task-agent lineage ([ordinary creation](../../../src/application/internal/activation-creation-module.ts#L21-L106)); follow-up creation addresses the selected conversation ([follow-up creation](../../../src/application/internal/activation-creation-module.ts#L108-L154)). This stays outside the proposed modules. |
| Runnable selection | Queued, non-stale, mapped activation; task not suspended or blocked; applied agent; retry due; no incomplete earlier activation; oldest sequence first | One query in `readNextRunnableActivation` owns all eligibility and provenance hydration ([selection](../../../src/application/internal/automation-state-store.ts#L146-L258)). Public tests prove same-task order and cross-task concurrency ([scheduling test](../../../test/application/automation-scheduling.test.ts#L145-L226)). |
| Claim | Activation `queued -> running`, continuation cleared, provisional running attempt inserted with workspace path and snapshotted execution profile, dispatch claim inserted | One transaction in `tryClaimActivation` ([claim](../../../src/application/internal/automation-state-store.ts#L320-L360)). Competing application instances dispatch exactly once ([claim race test](../../../test/application/automation-scheduling.test.ts#L282-L338)). |
| Workspace preparation and registration | Git directory and worktree registration are external; the database stores exact path, starting ref, and commit before runtime dispatch | The coordinator provisions after the durable claim and separately inserts `task_workspaces` ([dispatch](../../../src/application/internal/automation-coordinator.ts#L285-L320)); startup validates database, directory, and Git registration together before recovering attempts ([startup ordering](../../../src/application/coordination-application.ts#L206-L254)). Tests reject both a missing registration and a registration without a database row ([restart consistency tests](../../../test/application/restart-recovery.test.ts#L293-L349)). No SQLite transaction can include Git; this remains an explicit fail-closed protocol. |
| Dispatch release before start | Provisional attempt (and cascading claim) deleted; activation restored to queued; consumed continuation restored | One transaction in `releaseDispatchClaim` ([release](../../../src/application/internal/automation-state-store.ts#L362-L379)). This is required when process pause wins after workspace preparation. |
| Pre-runtime startup failure | Activation failed with technical evidence; only the still-claimed provisional attempt is deleted; startup-failure row, failed-run attention, activity, and notification retained | One transaction in `recordActivationStartupFailure` ([startup failure](../../../src/application/internal/automation-state-store.ts#L588-L635)). Tests require durable correlated failure, no attempt, attention, notification, and restart visibility ([startup-failure test](../../../test/application/activation-recovery.test.ts#L113-L184)); reused-workspace validation likewise requires `attempts: []` ([workspace-registration test](../../../test/application/task-workspace-lifecycle.test.ts#L322-L389)). |
| Attempt start | Start timestamp refreshed, `attempt.started` activity appended with process version, conversation activity advanced, dispatch claim deleted | One transaction in `startAttempt` ([start](../../../src/application/internal/automation-state-store.ts#L553-L585)). The runtime is called only afterward ([runtime dispatch](../../../src/application/internal/automation-coordinator.ts#L329-L418)). |
| Thread start | Attempt thread ID, the matching run-start activity, and conversation current-thread/activity cursor change together | One transaction in `recordAttemptThreadId` ([thread association](../../../src/application/internal/automation-state-store.ts#L637-L658)); the coordinator invokes it from the runtime lifecycle callback ([callback](../../../src/application/internal/automation-coordinator.ts#L406-L415)). |
| Normal settlement | Optional transcript/isolated usage; attempt status, outcome, thread continuity, price and context-window snapshots; activation completion/retry/failure; attention/notification when actionable; `attempt.completed` activity; conversation thread/activity | One transaction in `completeAttempt` ([settlement](../../../src/application/internal/automation-state-store.ts#L661-L791)). Completed transcript, usage, price-derived cost, conversation checkpoint, and restart survival are verified through `CoordinationApplication` ([retained transcript test](../../../test/application/agent-conversation.test.ts#L845-L978)). |
| Technical retry | Failed attempt retained; same activation returns to queued with 5s/10s capped exponential schedule while cycle attempt is below three; later activations remain blocked | Settlement owns count, `retry_cycle_start`, failure evidence, and due time ([retry branch](../../../src/application/internal/automation-state-store.ts#L744-L777), [backoff](../../../src/application/internal/automation-state-store.ts#L923-L925)). Public coverage proves the same activation/thread/workspace retries at the queue head ([retry test](../../../test/application/attempt-recovery.test.ts#L74-L153)). |
| Exhausted technical failure | Third failed attempt retained; activation failed; one failed-run attention, activity, and eligible notification retained | Same settlement transaction; public recovery offers only Retry/Dismiss, starts a fresh cycle on Retry, and preserves later queue order ([exhaustion test](../../../test/application/attempt-recovery.test.ts#L155-L230)). Explicit recovery is now wholly owned by `ActivationResolutionModule` and remains outside this recommendation ([recovery transaction](../../../src/application/internal/activation-resolution-module.ts#L247-L342)). |
| Permission block | Attempt evidence retained; activation failed without retry due; failed-run attention created | Permission is a settlement branch, not retry policy ([permission branch](../../../src/application/internal/automation-state-store.ts#L734-L743)). Tests prove no time-based retry, mandatory user text, durable continuation across restart, same thread/workspace, and repeated independent attention ([permission test](../../../test/application/attempt-recovery.test.ts#L284-L442)). |
| User interruption | Transcript/usage retained; attempt marked failed with `outcome_kind = interrupted`; activation requeued with no retry failure; task suspended against that activation; completion and suspension activity appended; idempotent command response retained | One transaction in `interruptAttempt` ([interruption](../../../src/application/internal/automation-state-store.ts#L381-L474)). The coordinator owns abort/confirmation promises, but confirms only after the durable transaction ([in-memory interrupt](../../../src/application/internal/automation-coordinator.ts#L182-L196), [finalization](../../../src/application/internal/automation-coordinator.ts#L442-L477)). Tests prove queue-head preservation, transcript retention, idempotent replay, suspension, continuation, thread/workspace reuse, and failure of confirmation when persistence cannot finish ([interruption tests](../../../test/application/task-interruption-and-process-pause.test.ts#L22-L197), [durability failure](../../../test/application/task-interruption-and-process-pause.test.ts#L449-L475)). |
| Continue interrupted | Continuation message set on the suspended activation; task suspension cleared; `automation.resumed` activity and idempotent response retained | One idempotent transaction in `ActivationResolutionModule` ([continue interrupted](../../../src/application/internal/activation-resolution-module.ts#L202-L245)). The application only kicks automation after acceptance ([application seam](../../../src/application/coordination-application.ts#L436-L441)). This stays outside the proposed modules. |
| Startup recovery | Every running attempt paired with a running activation is failed as host-stopped; dispatch claim removed; same retry-cycle rule chooses scheduled retry or failed attention; completion activity retained | One transaction in `recoverInterruptedAttempts` ([recovery](../../../src/application/internal/automation-state-store.ts#L71-L144)), invoked only after workspace consistency succeeds and before process definition application ([startup](../../../src/application/coordination-application.ts#L226-L255)). Tests prove paused startup, same activation/thread/workspace retry, unavailable transcript truthfulness, queue order, and shared exhaustion budget ([restart tests](../../../test/application/restart-recovery.test.ts#L21-L192)). |

## Invariants that constrain a seam

### One authority and workflow-owned transactions

Every transition above must continue to use the one `CoordinationDatabase`.
`IdempotentCommandExecutor` already starts the owning transaction around replay,
domain mutation, activity, and response retention
([idempotent execution](../../../src/application/internal/idempotent-command-executor.ts#L54-L69)).
`AttentionRecorder` deliberately does not start a transaction: attention,
activity, and notification occurrence participate in the caller's transaction
([attention recorder](../../../src/application/internal/attention-recorder.ts#L23-L58)).
The proposed evidence module must follow the same pattern.

No proposed interface may expose `begin`, `commit`, table rows, attempt counts,
retry-cycle arithmetic, or “call A then B inside your transaction.” Each public
module operation owns a complete transition. The only cross-module transaction
is `ActiveAttemptModule -> AttemptEvidenceModule`, an internal collaboration
that is never visible to the coordinator.

### Deterministic queue and recovery safety

Activation sequence, status of every earlier same-task activation, blocker
state, mapping, stale state, task suspension, and retry time are one selection
policy. Splitting those predicates into repositories would make order a caller
assembly concern. Claiming must remain atomic with the provisional attempt and
unique claim; reading a candidate and claiming it as two coordinator-visible
operations preserves today's retry loop but leaks the race protocol.

Recovery must run only after the database/filesystem/Git workspace identity has
been validated. Otherwise a host restart could resume work in an untrusted or
wrong checkout. The application currently enforces this ordering before
calling attempt recovery
([startup consistency gate](../../../src/application/coordination-application.ts#L206-L254)).

### Conversation continuity and truthful evidence

An attempt settles with more than an outcome. Its thread identity updates the
conversation resume target; a replacement thread remains explicit; activity
cursors advance; transcript evidence stays attempt-scoped. Cumulative Codex
usage is attributable only when the preceding trustworthy snapshot for the
same thread exists. A missing baseline produces unknown attempt usage rather
than a false zero, and negative deltas are rejected
([usage isolation](../../../src/application/internal/automation-state-store.ts#L809-L887)).
The permission-continuation test proves first-attempt usage, a valid resumed
delta, a missing-evidence gap, and a later attempt that remains unpriced rather
than subtracting from the wrong baseline
([usage isolation coverage](../../../test/application/attempt-recovery.test.ts#L293-L475)).

Pricing must be the process model price selected for that attempt and stored at
settlement, not recomputed from a later process definition. Context-window
usage is separate optional evidence. These facts change with transcript/runtime
semantics, not with queue eligibility, which is the strongest independent
change axis in the current store.

### Coordinator knowledge that should remain and should disappear

The coordinator should retain:

- process-wide paused/running/pausing state;
- retry-clock waiting and wakeups;
- async Git provisioning and runtime invocation;
- one `AbortController` and confirmation promise per live task;
- attachment projection lifetime and cleanup; and
- concurrent in-flight completion tracking.

Those are in-memory/asynchronous concerns and cannot be recovered merely by
moving SQL. The current map and pump are explicit
([coordinator state](../../../src/application/internal/automation-coordinator.ts#L80-L85),
[pump](../../../src/application/internal/automation-coordinator.ts#L218-L277)).

The coordinator should no longer know:

- that a claim is represented by a provisional `attempts` row plus a claim row;
- that release and startup failure delete that provisional attempt;
- when workspace registration and attempt-start activity commit relative to the
  claim;
- attempt-count and retry-cycle arithmetic;
- which outcomes create attention or notifications;
- that thread IDs are copied into both attempt/activity/conversation records;
- how transcript snapshots are isolated or priced; or
- that an interrupt idempotency response commits with task suspension.

Today these mechanics are visible through calls to `readTaskWorkspace`,
`tryClaimActivation`, `saveTaskWorkspace`, `recordActivationStartupFailure`,
`releaseDispatchClaim`, `startAttempt`, `recordAttemptThreadId`,
`interruptAttempt`, and `completeAttempt` in one dispatch method
([dispatch call sequence](../../../src/application/internal/automation-coordinator.ts#L279-L472)).

## Design comparison

| Design | Depth and leverage | Locality and coordinator knowledge | Interface/testability | Deletion test | Decision |
| --- | --- | --- | --- | --- | --- |
| **A. Retain `AutomationStateStore`** | One class hides all SQL and preserves one connection/transaction owner. It remains deep relative to the coordinator, but its reasons to change now span queue policy, Git registration protocol, active-run recovery, interruption, outcome policy, transcript semantics, and pricing. | A maintainer must navigate roughly the whole store for any lifecycle change. The coordinator still sequences nine persistence mechanics during dispatch. | Existing public tests are strong, but the class interface mixes reads, pre-run claims, user-command replay, runtime callbacks, settlement, and evidence. | Deleting the class removes substantial policy, so it is not shallow. However, replacing it requires at least three independent bodies of policy, showing that the class is now an aggregation rather than one lifecycle. | Valid no-change fallback, but reject as the recommendation because locality and coordinator knowledge have degraded since issue 29. |
| **B. Split queue/workspace dispatch from attempt settlement** | `ActivationDispatchModule` could own selection, workspace rows, claims, release/startup failure/start; `AttemptSettlementModule` could own recovery, interruption, settlement, evidence, retry, and attention. This gives a real pre-run/post-start boundary at deletion of the dispatch claim. | It removes most claim mechanics from the coordinator. Settlement remains broad: transcript/usage/pricing changes still require loading failure/retry/interruption and conversation-activity code. | Two domain interfaces are feasible. The settlement interface is deep, but its implementation retains two independent change axes and is still difficult to verify narrowly. | Deleting dispatch forces queue/order/claim/workspace protocol back into the coordinator. Deleting settlement forces all active outcomes and evidence back. Both pass, but settlement decomposes cleanly once more without leaking ordering. | Better than A; reject because it stops one cohesive boundary too early. |
| **C. Scheduling, active attempts, retained evidence** | Queue/dispatch, active state transitions, and evidence each hide a complete policy. Evidence is not a table store: it owns cumulative-thread attribution and price snapshots, not `attempt_transcripts` CRUD. | The coordinator sees domain phases—claim, Git preparation, start/fail/release, runtime callback, settle—while retry, deletion, activity, attention, and evidence mechanics stay internal. `ActiveAttemptModule` is the only caller of evidence. | Small capability interfaces; public application tests remain the behavioral seam. Focused transaction-failure characterization can target the few newly combined operations. | Deleting scheduling recreates deterministic queue/claim/workspace policy in the coordinator. Deleting active attempts recreates recovery, interruption, settlement, retry, attention, and activity. Deleting evidence recreates cumulative-baseline and cost truthfulness inside active settlement. Each module has behavior worth preserving and no module exists merely to forward another. | **Recommend.** Best locality without another authority or transaction choreography leak. |

Table-based alternatives are rejected outright. `ActivationRepository`,
`AttemptRepository`, `TranscriptRepository`, or `WorkspaceRepository` would
split transactions by storage shape, duplicate status predicates, and force the
coordinator or a service facade to reconstruct ordering. A facade that retains
the old store and delegates to new classes also fails the deletion test because
removing it changes no policy; replace the old class rather than wrap it.

## Recommended module map and interfaces

The following TypeScript sketches are capability shapes, not a required naming
or type-level implementation. Returned claim/start tokens should be opaque
internal domain values; they must not expose SQL rows.

```ts
interface ActivationSchedulingModule {
  claimNextRunnable(
    now: Date,
    pathForUnprovisionedTask: (taskId: string) => string,
  ): ClaimedActivation | undefined;

  readNextRetryDueAt(now: Date): Date | undefined;

  startPreparedAttempt(
    claim: ClaimedActivation,
    workspace: TaskWorkspaceView,
  ): StartedAttempt;

  releaseUnstartedClaim(claim: ClaimedActivation): void;

  failUnstartedClaim(
    claim: ClaimedActivation,
    boundary: RuntimeStartupBoundary,
    diagnostic: string,
  ): RuntimeStartupDiagnostic;

  readTaskWorkspace(taskId: string): TaskWorkspaceView | undefined;
  readTaskWorkspaces(): ReadonlyArray<TaskWorkspaceRegistration>;
}

interface ActiveAttemptModule {
  recoverInterruptedAttempts(now: Date): number;
  readActiveRuns(): ActiveRunView[];
  readInterruptedCommand(idempotencyKey: string): { taskId: string } | undefined;

  recordThreadStarted(attemptId: string, threadId: string): void;

  settle(input: SettleAttempt): void;
  interrupt(input: InterruptAttempt): void;
}

// Constructed only for ActiveAttemptModule; never exposed through
// CoordinationPersistence or AutomationCoordinator.
interface AttemptEvidenceModule {
  recordWithinSettlement(input: RetainAttemptEvidence): void;
}
```

`claimNextRunnable` should combine today's candidate read and conditional claim
inside one transaction. Hydration of the task, immutable activation source,
agent snapshot, current conversation thread, prior attempt, and workspace
registration belongs in the returned domain object. The pure path callback is
needed only when no registration exists; it does not perform I/O or own state.
This removes the coordinator-visible read/claim race without moving Git into
SQLite.

`startPreparedAttempt` should own one transaction that inserts the workspace
registration when first provisioned, refreshes the attempt start time, appends
`attempt.started`, advances conversation activity, and deletes the dispatch
claim. Today workspace insertion and attempt start are separate calls and
transactions. Combining them is a local strengthening: after Git succeeds,
the database either recognizes the workspace and started attempt together or
recognizes neither. A failed commit can still leave an externally provisioned
worktree; startup consistency must continue to fail closed rather than adopt it.

`failUnstartedClaim` must delete only an attempt still identified by its
dispatch claim. That deletion is intentional: no runtime attempt began, and
the acceptance tests require an empty attempt list. `releaseUnstartedClaim`
has the same deletion rule but restores the activation and its consumed
continuation. These are lifecycle operations, not generic `deleteAttempt`.

`ActiveAttemptModule.settle` owns every branch from a started attempt. It calls
`AttemptEvidenceModule.recordWithinSettlement` before final status changes in
the same database transaction, then writes attempt/activation/conversation
facts, activity, attention, and notification. `interrupt` additionally writes
task suspension and the idempotent response in that transaction.
`recoverInterruptedAttempts` uses the same private retry/exhaustion policy as
normal technical settlement so backoff and attempt budgets cannot diverge.

`AttemptEvidenceModule` receives the attempt ID, transcript, reported cumulative
usage, resumed/completed thread IDs, and selected price. It owns lookup of the
archived checkpoint and prior trustworthy same-thread report, delta validation,
transcript upsert, and cost serialization. It must not expose `saveTranscript`,
`findPriorUsage`, or `calculateDelta` as coordinator capabilities. Pricing and
context-window serialization may be internal helpers; context-window evidence
can remain written by `ActiveAttemptModule` because it is a direct attempt
snapshot rather than cumulative transcript attribution.

`CoordinationPersistence` should expose only `activationScheduling` and
`activeAttempts` to the composition root. It should construct and inject
`AttemptEvidenceModule` privately. This prevents the application or coordinator
from assembling partial evidence workflows.

## Transaction ownership after decomposition

| Operation | Transaction owner | Participants |
| --- | --- | --- |
| Claim next runnable | `ActivationSchedulingModule` | activation, provisional attempt, dispatch claim; selection and claim on the same connection |
| Start prepared attempt | `ActivationSchedulingModule` | workspace registration, attempt start, activity, conversation cursor, claim deletion |
| Release or fail preparation | `ActivationSchedulingModule` | provisional-attempt deletion, activation transition, continuation restoration or startup failure, attention/activity/notification |
| Thread callback | `ActiveAttemptModule` | attempt thread, run-start activity, conversation current thread/activity |
| Complete/fail/permission settlement | `ActiveAttemptModule` | `AttemptEvidenceModule`, attempt, activation, conversation, activity, attention, notification |
| User interruption finalization | `ActiveAttemptModule` | evidence, attempt, activation, task suspension, activity, idempotent response |
| Host-stop recovery | `ActiveAttemptModule` | attempt, activation, claim cleanup, retry/exhaustion, activity, attention/notification |
| Explicit Retry/Dismiss/Continue | Existing `ActivationResolutionModule` | attention/startup failure, activation, retry cycle/continuation, task suspension where applicable, activity, idempotent response |

No transaction spans Git provisioning, runtime execution, transcript reading,
or attachment projection. The coordinator gathers external results first and
passes immutable values into one final transaction. This is the same
application-owned outbox-free model used today; failures before commit remain
observable as startup failure, runtime failure, or fail-closed startup
inconsistency rather than being silently repaired.

## Verification seams and deletion-focused tests

Keep `CoordinationApplication` as the primary verification seam. The existing
application tests already cover the complete outcomes rather than implementation
calls:

- deterministic task ordering, cross-task concurrency, and competing claims;
- workspace creation/reuse/identity and startup mismatch refusal;
- pre-attempt failure deleting provisional attempts while retaining startup
  evidence, attention, notification, and restart visibility;
- technical backoff, exhaustion, explicit retry/dismiss, and queue advancement;
- permission continuation without automatic retry;
- interruption confirmation, idempotent replay, suspension, continuation, and
  persistence failure;
- host-stop recovery and shared retry exhaustion; and
- transcript, usage delta, price, cost, thread replacement, and restart
  retention.

The extraction should add only missing characterization needed for newly
combined boundaries:

1. A public-seam test where automation pauses after claim and workspace
   preparation but before start: the provisional attempt and claim disappear,
   continuation text is restored, and no `attempt.started` activity exists.
2. A transaction-failure test for `startPreparedAttempt`: workspace row,
   started activity, conversation cursor, and claim consumption either all
   commit or all roll back. External Git residue must be diagnosed on restart,
   not adopted.
3. A settlement rollback test with an injected late failure after evidence
   upsert: transcript/usage, attempt/activation status, attention,
   notification, activity, and conversation cursor all remain at their prior
   state.
4. A host-stop test for a still-claimed provisional attempt, explicitly fixing
   whether it is truthful to retain it as a failed attempt or whether it should
   become startup-failure evidence. Current code treats every running attempt,
   including a claimed one, as an interrupted attempt because recovery does not
   exclude `activation_dispatch_claims`
   ([recovery query](../../../src/application/internal/automation-state-store.ts#L73-L90)).
   Preserve that behavior during extraction unless a separate product ticket
   deliberately changes the crash semantics.

The physical deletion assertions are important and narrow. A generic attempt
deletion API must not exist. Only an unstarted dispatch claim may delete its
provisional attempt; once `attempt.started` is retained, interruption, failure,
permission block, recovery, and completion must preserve the attempt and any
truthful evidence. Untouched activation dismissal likewise creates no attempt
([dismissal test](../../../test/application/attempt-recovery.test.ts#L23-L72)).

After each implementation ticket, run typechecking, the focused application
files named above, the full non-browser suite, the production build, and the
affected automation/conversation browser suites. Do not add direct SQL tests
for every method; add a module-level test only when failure injection cannot be
expressed through `CoordinationApplication`.

## Incremental fresh-context implementation tickets

This is a code-only migration. The recommended final state uses the existing
tables, foreign keys, indexes, and one database owner; no SQLite schema version
or retained-data migration is required. If hiding run-start activity
correlation appears to require a new column, first prefer an internal lookup or
opaque module-private value and stop for a separate schema decision rather
than smuggling a migration into this refactor.

### 89A — Extract retained attempt evidence

- Introduce `AttemptEvidenceModule` over the existing database connection.
- Move transcript upsert, cumulative-usage baseline lookup/delta validation,
  price-derived attempt cost, and serialization helpers out of
  `AutomationStateStore`.
- Keep it private to the settlement owner and preserve the existing transaction.
- Verify permission-continuation usage gaps, completed transcript/cost restart
  retention, archived conversation checkpoints, and thread replacement.
- Stop if the extraction becomes transcript-table CRUD or requires the
  coordinator to call more than one evidence operation.

### 89B — Extract activation scheduling and dispatch preparation

- Introduce `ActivationSchedulingModule` and replace candidate-read plus claim
  with `claimNextRunnable`.
- Move retry-due reads, workspace registrations, claim release, startup failure,
  and attempt-start transition into complete domain operations.
- Combine workspace registration and attempt start in one transaction, with the
  failure characterization above.
- Update only coordinator wiring and calls; preserve Git manager ownership and
  startup consistency ordering.
- Stop if the module needs runtime promises/controllers or exposes SQL ordering
  to the coordinator.

### 89C — Deepen the remaining active-attempt lifecycle

- Replace the remaining store with `ActiveAttemptModule` rather than wrapping
  or renaming a facade.
- Centralize normal and host-stop retry/exhaustion decisions behind one private
  policy.
- Hide run-start activity correlation inside `recordThreadStarted(attemptId,
  threadId)` so the coordinator does not carry a persistence activity ID.
- Retain complete interruption and settlement transactions, using the private
  evidence collaborator.
- Remove `AutomationStateStore` and update composition types.
- Verify all focused public seams plus settlement rollback.

Each ticket can end green and leaves one authoritative database owner. 89A is
independent preparation; 89B can follow it without changing settlement; 89C
finishes the replacement after both collaborators exist.

## Documentation and ADR impact

A behavior-preserving implementation of this recommendation does **not** need
an architecture-document update or ADR. The architecture already says that
focused internal modules share one database connection, workflow operations
own their transactions, SQLite remains the durable owner, and the coordinator
owns automation/runtime integration
([architecture](../../../docs/architecture.md#coordination-core)). The module
names are source-level structure, which the document explicitly excludes
([keeping the overview current](../../../docs/architecture.md#keeping-this-overview-current)).

Inspect the documentation after implementation as issue 88 did. Update
`docs/architecture.md` only if implementation changes an authoritative flow,
state owner, startup ordering, or the external Git/SQLite recovery protocol.
Create an ADR only if the work deliberately changes crash semantics—for
example, reclassifying a host stop while a dispatch claim still exists—or
introduces a new durable schema/protocol that future maintainers must preserve.
Simple extraction, the combined workspace-registration/start transaction, and
private evidence collaboration fit the current architectural decision and do
not warrant an ADR.

## Stopping condition

Stop after 89C when all of the following are true:

- `AutomationStateStore` is gone rather than retained behind a facade;
- the coordinator expresses only asynchronous phases and calls one complete
  persistence operation at each phase boundary;
- runnable order/eligibility and claim are localized once;
- normal settlement and host-stop recovery share one retry/exhaustion policy;
- evidence has one settlement-only entry point and no table-oriented public
  methods;
- no module opens a second connection or exposes transaction controls;
- public application and affected browser behavior remains green; and
- architecture/ADR inspection finds no changed authoritative fact.

Do not split further by task workspace, activation, attempt, attention,
activity, transcript, or conversation table. Also stop and retain the current
module if a proof-of-change cannot produce the capability interfaces above
without duplicating SQL policy, leaking call ordering, moving async runtime
state into persistence, or weakening the existing public-seam tests. Source
length alone is never a reason to continue.
