# 93 — Deepen the Active Attempt Lifecycle

**Type:** task

**What to build:** Preserve every started-attempt outcome and recovery workflow
while placing thread association, normal and interrupted settlement, technical
retry and exhaustion, permission failure, host-stop recovery, attention,
activity, conversation state, and interruption idempotency behind one cohesive
active-attempt module, then remove the superseded broad automation store.

**Blocked by:** 91 — Extract Retained Attempt Evidence; 92 — Localize Activation
Dispatch Preparation.

**Status:** resolved

## Go/no-go checkpoint

**Decision: Go.** The post-92 `AutomationStateStore` has been reduced to six
operations that all concern one started attempt: host-stop recovery, current and
active inspection, durable interruption replay and finalization, runtime-thread
association, and normal settlement. These operations share the attempt's
activation, conversation, activity, attention, evidence, and retry/exhaustion
invariants rather than merely sharing a class name.

One lifecycle-level interface can cover those operations without exposing SQL
rows or transaction sequencing. It can also improve the current boundary by
deriving the matching `attempt.started` activity inside thread association,
instead of requiring the coordinator to pass its identifier. Removing that
module would push retry arithmetic, evidence-write ordering, attention and
notification creation, conversation continuity, interruption idempotency, and
settlement choreography into the coordinator and application. Conversely,
moving these methods into task projections or another generic store would make
those callers learn more durable mechanics. Proceed with a focused active-attempt
module and remove `AutomationStateStore`.

## Decision source

Complete the lifecycle decomposition recommended by
[issue 89](./89-reassess-automation-persistence-lifecycles.md) and its
[research note](../research/automation-persistence-lifecycles.md). The result
must retain one `CoordinationDatabase`, workflow-owned transactions,
application authority, and coordinator-owned asynchronous runtime and
cancellation state.

## Required go/no-go checkpoint

Do not assume that removing `AutomationStateStore` remains valuable merely
because issues 91 and 92 planned that final shape. Before changing production
code, inspect the implementation left by those tickets and record the result in
this ticket. Proceed only when all of the following remain true:

- the remaining persistence behavior forms one started-attempt lifecycle rather
  than several unrelated methods that would only share a new class name;
- one small interface can cover host-stop recovery, active and current-attempt
  inspection, thread association, interruption replay/finalization, and
  settlement without exposing table rows, transaction ordering, activity IDs,
  retry arithmetic, or evidence-write choreography;
- deleting the proposed module would force retry, attention, activity,
  conversation-continuity, interruption, and settlement policy back across its
  callers, rather than merely removing a delegating facade; and
- the coordinator and application learn fewer durable mechanics overall, with
  no catch-all persistence module introduced for methods that do not fit.

If any condition fails, resolve this ticket with a documented no-change answer
and keep the cohesive post-92 implementation. That is a successful maintenance
outcome. Do not create an active-attempt module solely to retire the old class
or complete the research recommendation.

## Acceptance criteria

- [x] Record the go/no-go result against the actual post-92 implementation
  before production edits. A justified no-change result supersedes the
  implementation criteria below.
- [x] One active-attempt module owns thread-start correlation, completed and
  failed settlement, permission blocks, user interruption, host-stop recovery,
  active-run projections, conversation activity, immutable activity, failure
  attention and notifications, and durable interruption idempotency.
- [x] The same module owns current running-attempt scope used by authoritative
  operating-context queries and durable interruption-command replay; those
  capabilities are not moved into an unrelated task projection or catch-all
  store merely to make the module map compile.
- [x] Normal technical settlement and host-stop recovery share one private
  retry/exhaustion policy, preserving the current three-attempt cycle, capped
  backoff, queue-head blocking, and explicit attention after exhaustion.
- [x] Settlement invokes the private retained-evidence collaborator inside the
  same transaction as attempt and activation status, retry timing, conversation
  state, activity, attention, notification, task suspension, and idempotent
  response where applicable.
- [x] Recording a runtime thread ID atomically updates the attempt, matching
  start activity, and conversation continuity without exposing a run-start
  activity identifier or write ordering to the coordinator.
- [x] User interruption remains coordinator-signaled and confirms only after
  durable evidence, interrupted outcome, preserved queued activation, task
  suspension, activity, and idempotent response commit successfully.
- [x] Permission blocks never retry automatically; missing transcript or usage
  remains truthful absence; successful completion has no implicit workflow
  effect.
- [x] The coordinator retains pause/drain/kick behavior, retry-clock waiting,
  cross-task concurrency, abort controllers, interruption confirmation,
  attachment projection lifetime, and Codex invocation while depending only on
  lifecycle-level persistence operations.
- [x] `AutomationStateStore` and all replaced methods are removed rather than
  retained as a facade. Do not split further by activation, attempt, workspace,
  transcript, attention, activity, or conversation table. If removing it would
  require a facade or miscellaneous-method holder, take the documented
  no-change outcome instead.
- [x] Public-seam coverage proves strict task ordering, cross-task concurrency,
  competing claims, workspace reuse and startup consistency, completion,
  retries and exhaustion, permission continuation, interruption and replay,
  host-stop recovery, conversation continuity, transcripts, usage isolation,
  pricing, context fill, and settlement rollback.
- [x] Run typechecking, all focused lifecycle suites, the full non-browser
  suite, production build, affected automation/conversation browser suites, and
  the required two-axis code review, reporting unrelated pre-existing failures
  separately.
- [x] Inspect architecture documentation after implementation. Update it and
  add an ADR only if authority, startup ordering, runtime ownership, Git/SQLite
  recovery, crash semantics, or durable schema actually changes.

## Answer

The go/no-go checkpoint passed against the post-92 implementation. Replaced
`AutomationStateStore` with one `ActiveAttemptModule` whose lifecycle-level
interface owns host-stop recovery, active and current-attempt inspection,
durable interruption replay and finalization, runtime-thread association, and
normal settlement. `CoordinationPersistence` exposes that module as
`activeAttempts`; the private `AttemptEvidenceModule` remains available only to
the settlement owner.

Normal technical failure and host-stop recovery now call the same private
retry/exhaustion policy. Thread association derives the matching
`attempt.started` activity from the attempt ID inside its transaction, so the
coordinator no longer receives or forwards a run-start activity identifier.
Settlement and interruption use named inputs and retain evidence, status,
conversation continuity, activity, attention, notification, suspension, and
idempotent response changes in their existing atomic workflows. The coordinator
continues to own asynchronous runtime, cancellation, concurrency, pause/drain,
retry-clock, attachment, and interruption-confirmation state.

Verification:

- TypeScript typechecking passed.
- All 88 focused lifecycle, recovery, workspace, conversation, evidence, cost,
  and MCP tests passed.
- The full Node suite ran 265 tests: 260 passed and 3 were skipped. The same two
  unrelated prompt assertions documented by issues 88, 91, and 92 remain red
  because they expect text absent from the unchanged runtime prompt.
- The production Vite build passed.
- All 57 affected automation, conversation, transcript, token-cost, and
  workspace browser scenarios passed. One separate process-evolution browser
  scenario remains red because task navigation returns `not found`; it
  reproduced in isolation and does not traverse the changed lifecycle code.
- The final independent two-axis review found no Spec issues. Standards found
  no hard violation after confirming the architecture-update criterion, and
  noted one minor judgment-call duplication in evidence-object construction.

`docs/architecture.md` remains accurate: application authority, startup order,
coordinator runtime ownership, Git/SQLite recovery, crash semantics, and the
durable schema did not change. Its source-level module map is intentionally out
of scope, so no architecture or ADR update was required.
