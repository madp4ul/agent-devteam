# Integration lifecycle redesign — discussion handoff

Updated 5 November 2026. Temporary working document for continuing the discussion
after context turnover. This is a record of user decisions and design proposals,
not an approved specification or an implemented process revision.

## Read this first

**Latest discussion addition:** read [Product-owned main and integration work
structure](discussion-addendum-product-main.md) before continuing. The user
proposes Product Lead owning main, likes checkpoint integration branches, and
wants to consider specialized integration roles/flows and parallelism. Completed
task participants may be consulted for answers, not assigned new implementation
work there. These points refine the options below; they have not been applied.

New directly observed recurrence: [21:45 correction-return stall](stall-20261105T205427Z/incident.md).
The original feature was already merged. Integration activated its implementer
for a failed combined-check fixture; the finished correction returned as a plain
comment without a recipient activation while the task stayed in Ready. This
adds a concrete requirement: integration correction work also needs a finite
completion-based return, not just the original feature handoff. No recovery was
performed during the investigation.

The user rejected the earlier recommendation to wake waiting parents merely
because their children occupy unwatched columns. Do not resume implementation of
that proposal from the older assessment or tickets. Unwatched columns represent
user-owned waits in the intended framework philosophy; the process has been
misusing them for unfinished agent-owned work.

The emerging solution is to make task lifecycles finite and completion callbacks
useful: reviewed features complete as handoffs; integration owns incorporation
and combined checks; Product waits for an integration task that actually completes.
The user suggested one integration task per checkpoint and possibly a separate
Integration board. Those are design directions to work through, not source changes
already made or authorization to restart/migrate the running project.

## User intent and accepted principles

- The user is tired of repeatedly discovering that work has silently stopped.
  Agents should not have to remember their way out of an incoherent process.
- An agent-owned task should have work that can proceed, or wait on another task
  whose Completion resumes it. User-input waits belong in unwatched columns.
- Ready reviewed branches should be integrated promptly. Independent features
  should not wait for every sibling or human checkpoint acceptance before merging.
- A feature may complete when its reviewed branch is ready for the integration
  consumer. Completion means fulfilling that task's defined handoff, not claiming
  the integrated product has passed every check.
- Combined checks belong to Integration. It may do them itself or delegate finite
  verification/correction tasks with completion callbacks.
- An Integration board is available if these responsibilities need a different
  structure from ordinary feature delivery. The user explicitly welcomed that
  possibility; do not assume today's boards must constrain the solution.
- Product waiting on Completion of one permanently open shared Integration task
  is another broken promise. An explicit comment can work around it, but the user
  wants the dependency mechanism itself to have a sensible endpoint.
- Repository files can preserve shared decisions and checkpoint context across
  fresh agents. Descriptions/pins should point to them rather than requiring one
  enormous continuing conversation.
- Worktrees survive task Completion. Git's restriction on checking out the same
  branch in multiple worktrees was an original reason for centralizing integration.
  A redesign must address that constraint, not assume completion removes a worktree.

## What happened before this discussion

The November 2 process revision added explicit continuation, reusable design rules,
acceptance distinctions and redundant stewardship coverage. It validated as
`bda9f4291399f339be2a315799f485cf95690d093fa367cbb52a99b02f1c9d4e`.
The November 5 read-only inspection confirmed that version was active; repeated
stalls therefore cannot be dismissed as failure to load those instructions.

The earlier recovery design deliberately suppresses watched-task recovery whenever
any outgoing relationship targets unfinished work. It does not recursively judge
that target's progress. See [ADR 0023](../../docs/adr/0023-recover-tasks-without-continuation-paths.md).

The problematic process created this circular responsibility even without a cycle
in the stored relationship graph:

1. Integration waits for feature Completion.
2. Feature sits in unwatched Ready for Integration.
3. Feature cannot complete until Integration incorporates it and performs checks.
4. Neither required next action follows from the other's Completion.

The user's model resolves that circle by completing the feature handoff first.
The subsequent Product -> permanently open Integration relationship still needs
the same correction: a finite integration outcome.

### Concrete combined-check example

One feature changed menu panels/layout/input; another implemented the physical
trash-pile background. Integration needed to check the pile behind the new panels,
small-window layout, and Settings/Load transitions. A UI fixture bypassed the
menu-world update, so passing UI tests showed a plain background and did not prove
the combined experience. Keeping both reviewed source tasks unfinished was not
necessary. Integration owned that missing check and any resulting correction.
The original retained attempt is [stalled-transcript.json](../local-evidence/autonomous-process-assessment/stalled-transcript.json).

### Latest inspected state is historical, not current UI

At approximately 21:15 Berlin on November 5:

- Product T1 waited on shared Integration T2 and side research T288.
- T2 was running again following the user's reminder and waited on T279.
- T279 was in unwatched Backlog awaiting a serial validation allocation from T2.
- T288's offline report was already integrated; remaining remote work lacked
  service access. Its Ready column did not describe that actual blocker, and the
  referenced handoff addressed Product rather than creating user attention.
- T3/T4 were dormant assessments outside that unfinished dependency chain.

See [snapshot assessment](2026-11-05-waits/assessment.md). Its proposed recursive
parent recovery is now rejected; its factual evidence remains useful. Reinspect
read-only if exact present board state is needed. Do not treat this snapshot as
proof the process is still stopped: agents had already resumed and closed tasks.

## Candidate dependency model

Arrows here mean **waits for target Completion**, not chronological execution:

```text
Product P
  -> Checkpoint Integration I26   [resume Product Lead on P]
       -> Feature A              [resume Integrator on I26]
       -> Feature B              [resume Integrator on I26]
       -> Correction C           [created if needed; resume Integrator on I26]
       -> Combined-check V       [optional delegation; resume Integrator on I26]
```

Proposed lifecycle:

1. Product agrees checkpoint scope and creates finite Integration I26, recording
   its expected outcome, baseline, publication target and required feature set.
2. Attach the integration-owned wait relationships before starting feature work,
   so Completion can actually generate the intended callback. Decide who creates
   features and links; do not rely on linking a task after it already completed
   to synthesize an event the framework may not produce.
3. Feature A completes when its reviewed commit/branch and handoff are ready.
   I26 receives its completion activation, merges it promptly and performs useful
   checks even while Feature B is still running. Existing framework semantics
   permit callbacks while other dependencies remain unresolved.
4. Combined defects produce a finite correction on the integrated baseline when
   appropriate. Do not reopen completed feature handoffs solely to hold them
   hostage to integration's remaining work. Reopening can still be valid when
   the claimed handoff itself was defective; define which case is which.
5. I26 completes when the agreed integrated candidate, required combined checks,
   publication obligation and handoff evidence are delivered. It does not wait
   for the human to like the checkpoint; that is Product's subsequent review.
6. Completion of I26 wakes Product. Product presents the result and requests user
   review. A next agreed checkpoint gets I27 with its own bounded scope.

Product should distinguish checkpoint-blocking work from independent side work.
T288 explicitly was not a game checkpoint gate. An ongoing Product task may own
both, but one unfinished side project must not be interpreted as forbidding a
checkpoint presentation. The finite integration task provides a clear checkpoint
readiness signal even while unrelated Product obligations remain.

## Could an Integration board help?

Yes, if its stages express meaningful integration responsibilities. A provisional
minimal arrangement is a board with agent-watched Incorporation and Verification
stages followed by framework Completion. A separate Publication stage is useful
only if it has distinct work/ownership; it must be watched while agent work is
possible. Any actual user decision is an explicit human handoff.

The task represents one checkpoint candidate, not a permanent repository service.
It can incorporate children incrementally; reaching Verification must not imply
that all merging was postponed until the batch was ready. A small checkpoint
could use one watched Integration stage without losing the finite lifecycle.
Do not create a stage for every activity merely because a new board is possible.

Delegated check/correction tasks can use Delivery when its reviewed-handoff
semantics fit, or specialized integration stages when they do not. Choose by
the consumed result and ownership, not by forcing evidence-only work through
the entire coding pipeline. This board choice remains open.

## Branch ownership and surviving worktrees

Separate **who may publish main** from **which branch is checked out**.

Verified local framework contracts:

- Each task is initially provisioned with a detached worktree, from a configured
  or task-specific starting ref. The process chooses its subsequent branch.
- Existing Integrator guidance already says to use a uniquely named integration
  branch and explicitly states publication need not take over a local main checkout.
- Task Completion does not perform archival/worktree removal.

Sources: [architecture](../../docs/architecture.md#git-task-workspaces),
[agent tool reference](../../docs/agent-mcp-reference.md), and current
[Integrator instructions](D:/Daten/Projekte/Software/Codex/agent-devteam-processes/Autonomous/agents/integrator.md).

### Preferred candidate: unique branch per finite integration task

I26 owns a uniquely named branch such as `integration/T-XXXX-checkpoint-26`;
I27 owns another. Old worktrees can retain their old branches without blocking
the new one. The current authorized integration task publishes its verified
branch to the main destination through the repository's normal non-force/PR
path; publication does not require checking out the local branch named main.
This is a design option, not a Git operation performed by this investigation.

Give only one task active publication authority at a time. A completed old task
must not retain implied authority to publish main on a later stale activation.
An overlap, reopen or correction needs explicit ownership resolution. A process
convention may suffice initially; enforced publication ownership would be a
separate framework feature. A file declaring an owner is not an atomic lock.

The next checkpoint must start from the actual accepted/published commit, not
assume that local main moved because a remote branch was updated. Existing task
starting-ref overrides can identify a concrete commit. Distinguish branch backup,
main publication and refreshing a running game: existing user holds on replacing
the live candidate are not automatically lifted by adopting a new task model.

This allows serial checkpoints without needing to archive old integration tasks
first. Concurrent checkpoint publication is unnecessary complexity unless the
user needs it; if introduced, define ordering and reconciliation explicitly.

### Alternative: retained publisher workspace, finite publication requests

If ownership of an actual local main checkout must remain centralized, keep that
workspace/service, but make each checkpoint's publication a finite request with
an explicit result. Product depends on the finite checkpoint result, never on
the permanent service's eventual Completion. This adds handoffs and may require
framework support for servicing a request from another task's workspace; current
agents normally operate only in their own task worktree. Do not assume a new task
can freely commandeer the permanent publisher's workspace.

Prefer unique checkpoint branches unless a concrete local-main requirement
justifies this extra structure. This recommendation is not yet a user decision.

## Durable knowledge and synchronization

Use versioned repository files for project principles, current architecture,
shared UI/art rules, and per-checkpoint acceptance/integration records. A fresh
integration task should be able to recover its remit from a concise description
plus those pointers. Retain exact commits for feature handoffs and checkpoint
baselines; branch names alone can move.

Assign an owner to each shared record and carry the knowledge changes with the
relevant reviewed work. Agents can fetch and incorporate published changes into
their own branches. Push/pull capability alone does not establish adoption:
the consumer must use the relevant revision, and concurrent document edits still
need ordinary conflict handling. Avoid inventing a mandatory read-receipt cascade.

Git stores durable shared knowledge; framework events establish execution.
Pushing a document does not activate an agent. The task Completion callback or
another explicit supported request still carries the handoff.

## Open decisions for the next discussion

1. Adopt one finite integration task per checkpoint? Decide whether to introduce
   the Integration board or first use a finite task in the existing watched column.
2. Define the feature handoff and integration completion contracts, including what
   publication means when the user is preserving an older running candidate.
3. Decide creation/link ownership so feature Completion wakes the correct finite
   integration task and that task's Completion wakes Product.
4. Choose unique integration branches and serial main-publishing authority, or
   identify a concrete reason a permanent publisher workspace is required.
5. Decide how new correction tasks and late scope changes attach to the checkpoint
   without letting it become an indefinite improvement project.
6. Remove/redefine agent parking uses of Ready, Waiting and Backlog. Determine how
   recurring assessment responsibilities are represented without treating their
   dormancy as an unattended unfinished delivery task.
7. Plan migration from existing T2 and its relationships without rewriting old
   completion meanings, duplicating integrations, losing queued work, or taking
   over its worktree. Removing a process column leaves existing tasks requiring
   explicit reconciliation; do not silently apply a structural change live.

## Next actions and authorization boundary

Current request: preserve the discussion and think through these options. Done
in this note; no process/source/runtime/Git changes beyond scratch documentation
were made in this turn. Earlier user authorization produced the November 2 source
revision, but this evolving redesign is not presented as already agreed/applied.

Next: settle the small set of open lifecycle/ownership decisions, then write a
coherent process revision and migration plan. Re-evaluate framework changes only
against the corrected process. The existing detector may already handle normal
post-feature integration stalls once dependencies genuinely resolve; do not claim
it covers every future ownership or notification failure without testing.

Keep the useful earlier findings on reusable decisions, outcome-based review and
steward efficacy. Rejecting recursive recovery does not invalidate those findings.
Keep all changes unstaged; the user owns staging, commits and pushes in these
repositories. Never restart the live project just to validate a proposed process.
