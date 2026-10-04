# Bounded task stall recovery

Agreed with the user on 2026-10-03. Source: framework improvement
[27](../framework-improvements-2026-09/issues/27-recover-stalled-work-without-user-attention.md).
Delivery: [map.md](map.md). Decision: [ADR 0023](../../docs/adr/0023-recover-tasks-without-continuation-paths.md).
Design is resolved; product implementation remains open.

## Purpose and eligibility

Ensure agent-owned tasks retain a continuation path without repeatedly activating
agents that are intentionally waiting. A stall is structural, not elapsed idle
time or a framework judgment about the usefulness of an agent's work.

A task is recoverable only when all of these hold:

- It is active, mapped, and in a column watched by an applied agent.
- It has no unfinished activation: queued, running, retry-delayed, stale,
  interrupted, or failed work awaiting its existing resolution flow.
- It has no unresolved outgoing dependency or parent-child relationship.
- It has no unresolved user-attention reason or task automation suspension.
- Its user-interaction grace deadline has expired or does not exist.
- Process automation allows execution under existing startup/process rules.

Completion, archival, unmapped state, retired boards, and unwatched columns do
not receive recovery. An unwatched column remains user-owned without creating
formal attention merely because it is unwatched. Every unresolved waiting
relationship suppresses recovery regardless of its target's state. Do not
recursively judge target progress. Ordinary activations retain their existing
eligibility while relationships or attention exist; only recovery is suppressed.

## Detection, scheduling, and ownership

Check immediately after a run settles and committed coordination changes become
visible, on automation resume, and after commands that can leave tasks eligible,
including relationship removal, attention resolution, activation dismissal, and
process/mapping changes. No general idle timeout is used.

The coordination core owns eligibility, durable recovery state, immutable source
events, enqueue, and escalation. Make detection/enqueue atomic with authoritative
facts; repeated checks and concurrent kicks must not duplicate unfinished recovery
or escalation. Resume/restart reconciliation must find eligible tasks without
requiring a new task command.

Recovery targets the current column watcher at creation, irrespective of the
last agent to work on the task. Reuse the task-local queue, ordinary conversation
selection, runtime, and provenance. Do not overlap runs, bypass stale-process
approval, or retarget an activation.

Recheck immediately before first dispatch, excluding the recovery activation itself
from the unfinished-work test. If another continuation path, user-owned state,
or grace window appeared, skip the obsolete recovery with durable explanatory
history and no consumed budget. Another ordinary activation counts even if
queued behind recovery. This is a narrow recovery exception; ordinary activation
order/cancellation stays unchanged. Pause/suspension holds execution under
existing rules. A watcher-changing move normally creates ordinary work or enters
a user-owned state, superseding the old recovery; never silently change its owner.

## Budget and reset

Allow three recovery activations per stall episode. Count once at first actual
dispatch, not enqueue, skipped dispatch, or technical retry. Recheck after each
normally finished recovery. If still eligible after recovery three, create
framework user attention instead of recovery four.

Reset the count when a regular activation is created, an unresolved waiting
relationship is established (including a target reopening), or user attention
is created. Entering an unwatched column or Completion also ends the episode.
Regular activations include mentions, user follow-ups, watched-column entries,
and relationship satisfaction. A reset during recovery must survive its settlement.

Recovery itself, comments/description edits alone, and unrelated changes do not
reset count. Process pause and task interruption preserve count; interruption's
attention presentation must not accidentally override this explicit rule.
Moves between watched columns reset through ordinary activation. A responsibility
claim that creates no activation is not itself a new continuation promise.

This bounds consecutive recovery, not all ordinary work. Regular agent handoffs
can continue indefinitely outside this feature's scope. Technical retries repeat
the same activation under existing policy; exhausted retries, startup failure,
and permission blocks use existing failure-attention flows.

## User interaction and persistence

Set a 60-second grace deadline when the last unresolved attention reason is
addressed or an activation is explicitly dismissed, including dismissal that
clears interruption. Unresolved interruption independently suppresses recovery
through suspension/attention; Continue provides unfinished work.

At expiry, recheck eligibility rather than blindly activate. Further qualifying
actions get a deadline 60 seconds from that action. Ordinary user mutations do
not get a general debounce window. Deadline expiry must wake scheduling without
another command; paused processes do not dispatch at expiry.

Engineering default where the user expressed no preference: persist count and
grace deadline across restart. Startup remains paused; resume checks an expired
deadline immediately or schedules its remaining interval. Use a new released
migration and current-schema verification, not edits to released migrations.
History retains recovery provenance/numbers even after the current count resets.

## Agent activation context and guidance

Add a distinct typed stall-recovery reason with exact source-event provenance,
ordinary task/workspace and role context, and recovery number out of three.
The user reviewed this wording:

> **Stall recovery — activation 2 of 3**
>
> When this activation was created, this task remained in your watched column
> with no unfinished activation, unresolved waiting relationship, or unresolved
> user attention. The framework activated you because no continuation path remained.
>
> Reassess the current task and workspace, then continue the work or establish
> how it will continue: activate another agent, create an appropriate waiting
> relationship, move the task to the appropriate column, or complete it.
>
> If you cannot proceed, mention the user and explain what is needed. Before
> finishing, ensure a continuation path exists or responsibility has explicitly
> passed to the user. A comment describing next steps alone does not establish
> continuation.

On recovery three add:

> This is the final automatic recovery activation for this stall episode. If
> you finish without establishing continuation, the framework will request
> user attention.

Detection facts are historical; current state remains authoritative. Stale process
versions still require existing approval. Strengthen general framework guidance
about establishing continuation before finishing without imposing process-specific
work/Git policies. This targeted wording was reviewed in this session; intake
12's wider user instruction audit remains separate.

## Framework escalation

Escalation is formal, attributable, independently addressable user attention,
not a fabricated mention or model-authored diagnosis. Explain that three recovery
activations failed to establish continuation and link their evidence. Do not
claim to know why the agent could not proceed. Reuse ordinary attention inspection,
resolution, browser presentation, and applicable notification policy. Resolving
the last reason grants grace and permits a fresh budget; preserve earlier evidence.
Agent-authored attention is preferable because it can explain the obstacle.

## Relationship cycle prevention

Before inserting A -> B, reject if B already has a directed path to A. Combine
dependency and parent-child edges in one project-wide source-waits-on-target graph.
Include all retained relationships, even satisfied ones whose targets are
completed, so reopening cannot introduce a previously accepted cycle.

Validate within the authoritative creation transaction for browser/MCP/cross-task
and child-creation paths. Preserve self/duplicate checks, atomicity, and exact
idempotent replays. Rejection must leave no partial tasks, relationships, activity,
or activations. Expose a structured circular-relationship rejection and clear
text such as "This relationship would create a circular wait." Reporting the
whole cycle is optional; no new graph UI is required.

Do not silently rewrite/remove existing relationships. The agreed scope is new
relationship validation, not automatic legacy-cycle repair or a new startup hold.

## Acceptance scenarios

1. Ordinary run finishes in its watched column without continuation: its watcher
   receives recovery 1 immediately, with detection event and current context.
2. Three normally finished recoveries establish nothing: attention appears once,
   with no fourth run or false diagnosis.
3. Recovery creates a mention/watched-column handoff: reset count and run ordinary
   work. A later stall begins at recovery 1.
4. Any unresolved outgoing relationship suppresses recovery even if its target
   needs attention. Removal of the last allows immediate checking; target
   Completion instead creates its ordinary resume-owner activation.
5. A satisfied retained relationship alone does not suppress recovery. Target
   reopening establishes waiting again and resets source count.
6. Address last attention reason, then move within 60 seconds: recovery does not
   jump between the actions. If nothing establishes continuation, expiry checks
   automatically without another command.
7. Dismissal grants the same grace, including interruption dismissal. Unresolved
   interruption blocks recovery; Continue provides ordinary unfinished work.
8. Pause/restart cannot reset budget or bypass suspension, mapping, process
   approval, or startup pause. Persisted grace retains its deadline.
9. Ordinary activation/waiting/attention/grace appears before dispatch: skip
   obsolete recovery with evidence and no consumed slot.
10. Technical retries retain one recovery slot; exhausted retries/permission
    blocks use existing failure-attention behavior.
11. Prose-only changes do not reset count; concurrent/repeated checks cannot
    duplicate recovery/attention. Resets during recovery survive settlement.
12. Reject two-task, longer, mixed-type, cross-board, and satisfied-edge cycles;
    accept acyclic/shared-target graphs. Browser/MCP rejections are atomic and
    do not disturb exact successful replays.

Verify public application seams with a controllable clock, migration/restart,
prompt composition, HTTP/MCP error contracts, and browser attention/history in
both themes. Update architecture/glossary when implementation changes authoritative
behavior; this design does not claim those changes are already delivered.
