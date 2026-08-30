# 93 — Deepen the Active Attempt Lifecycle

**Type:** task

**What to build:** Preserve every started-attempt outcome and recovery workflow
while placing thread association, normal and interrupted settlement, technical
retry and exhaustion, permission failure, host-stop recovery, attention,
activity, conversation state, and interruption idempotency behind one cohesive
active-attempt module, then remove the superseded broad automation store.

**Blocked by:** 91 — Extract Retained Attempt Evidence; 92 — Localize Activation
Dispatch Preparation.

**Status:** ready-for-agent

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

- [ ] Record the go/no-go result against the actual post-92 implementation
  before production edits. A justified no-change result supersedes the
  implementation criteria below.
- [ ] One active-attempt module owns thread-start correlation, completed and
  failed settlement, permission blocks, user interruption, host-stop recovery,
  active-run projections, conversation activity, immutable activity, failure
  attention and notifications, and durable interruption idempotency.
- [ ] The same module owns current running-attempt scope used by authoritative
  operating-context queries and durable interruption-command replay; those
  capabilities are not moved into an unrelated task projection or catch-all
  store merely to make the module map compile.
- [ ] Normal technical settlement and host-stop recovery share one private
  retry/exhaustion policy, preserving the current three-attempt cycle, capped
  backoff, queue-head blocking, and explicit attention after exhaustion.
- [ ] Settlement invokes the private retained-evidence collaborator inside the
  same transaction as attempt and activation status, retry timing, conversation
  state, activity, attention, notification, task suspension, and idempotent
  response where applicable.
- [ ] Recording a runtime thread ID atomically updates the attempt, matching
  start activity, and conversation continuity without exposing a run-start
  activity identifier or write ordering to the coordinator.
- [ ] User interruption remains coordinator-signaled and confirms only after
  durable evidence, interrupted outcome, preserved queued activation, task
  suspension, activity, and idempotent response commit successfully.
- [ ] Permission blocks never retry automatically; missing transcript or usage
  remains truthful absence; successful completion has no implicit workflow
  effect.
- [ ] The coordinator retains pause/drain/kick behavior, retry-clock waiting,
  cross-task concurrency, abort controllers, interruption confirmation,
  attachment projection lifetime, and Codex invocation while depending only on
  lifecycle-level persistence operations.
- [ ] `AutomationStateStore` and all replaced methods are removed rather than
  retained as a facade. Do not split further by activation, attempt, workspace,
  transcript, attention, activity, or conversation table. If removing it would
  require a facade or miscellaneous-method holder, take the documented
  no-change outcome instead.
- [ ] Public-seam coverage proves strict task ordering, cross-task concurrency,
  competing claims, workspace reuse and startup consistency, completion,
  retries and exhaustion, permission continuation, interruption and replay,
  host-stop recovery, conversation continuity, transcripts, usage isolation,
  pricing, context fill, and settlement rollback.
- [ ] Run typechecking, all focused lifecycle suites, the full non-browser
  suite, production build, affected automation/conversation browser suites, and
  the required two-axis code review, reporting unrelated pre-existing failures
  separately.
- [ ] Inspect architecture documentation after implementation. Update it and
  add an ADR only if authority, startup ordering, runtime ownership, Git/SQLite
  recovery, crash semantics, or durable schema actually changes.
