# Current unwatched waits and proposed framework correction

**Subsequent decision:** the user rejected this document's proposal to recover
parents based on unwatched children. The factual snapshot remains evidence;
the proposed remedy is superseded by the
[integration lifecycle discussion](../discussion-handoff-2026-11-05.md).

Observed 5 November 2026, approximately 21:15 Berlin. Short query-only reads,
zero lock wait, 150 ms SQL progress bound. Separate reads, not an atomic snapshot.
No live changes, agent requests, test launches, or process edits were made.

## Finding

The revised definition `bda9f4291399f339be2a315799f485cf95690d093fa367cbb52a99b02f1c9d4e`
is active and automation is running. The process edits have not supplied a reliable
framework guarantee. The existing detector explicitly excludes unwatched tasks
and treats any outgoing unresolved relationship as sufficient continuation.
ADR 0023 intentionally says not to recursively assess target progress. The
reported failures therefore fall outside its coverage; this is not evidence that
an eligible recovery activation was dropped.

## Current required chain

`T1 Product -> T2 Integration -> T279 Backlog`

`T1 Product -> T288 Ready for Integration`

Only unfinished targets were traversed; completed and archived history was not
treated as outstanding work. At capture, T1 had no pending activation, attention,
or suspension. T2 had a running Integrator and one queued activation, following
the user's 21:09 wake-up. T279 and T288 had no pending activation, outgoing
unfinished dependency, unresolved attention, or suspension.

### T279: legitimate resource coordination, unrepresented wake condition

T279 is required checkpoint work, parked in Backlog to await T2's inspection and
allocation of a serial native validation slot. Comments 11149/11153 give the
prepared source and remaining allocation. T2 comments 11148/11152 receive it.
There is useful work T2 can do; at capture T2 was running. That means this
particular instant is not an entirely quiescent execution chain.

However, Backlog is being used as a scheduling queue rather than optional work.
No durable event on T279 promises a wake-up when T2 becomes available. If T2 ends
without dispatching it, T2's wait on T279 suppresses recovery, and T279 has no
watcher. Adding T279 -> T2 as an ordinary Completion dependency would create a
cycle with T2 -> T279 and is not the solution. Parent-owned scheduling is a
different obligation from waiting for the parent to complete.

### T288: legitimate external blocker, misleading stage and missing attention

The offline asset-provenance report is already integrated. Comment 10919 says
the remaining remote research needs supported service access and has performed
zero uploads. It explicitly uses Ready to retain the historical offline handoff,
not because another merge remains. This is reported task evidence; this audit
did not independently test the external service or credential availability.

The references described as an access request/continuation (10816 and 10873)
are mentions of Product Lead, not user attention or an executable later trigger.
No unresolved attention exists on T1 or T288. The most recent retained T1
attention was created November 2, before this request. Product must either
arrange an available authorized route or expose the actual user action needed.
Repeatedly waking the research implementer cannot manufacture external access.

Its brief explicitly says it is independent of the r26 checkpoint. The retained
T1 relationship therefore should not automatically mean this research blocks
presentation of the game checkpoint. Product contains both ongoing obligations
and checkpoint scope; a detector should find the orphaned obligation without
silently turning every descendant into a release gate.

### Other unwatched tasks

T3 Maintainability and T4 Process Steward are in Waiting, outside the unfinished
Product dependency closure. Dormancy between assessments can be legitimate;
continuous execution is not required. T4 last ran November 5; T3 last activation
was October 31. Assessment cadence is a separate concern, not evidence that every
dormant assessor needs an immediate recovery run.

T38/T51/T166 are optional Backlog outside the closure. T266 is a retained older
User Review task outside the closure. None is currently a recorded prerequisite
of Product's outstanding work. Blanket recovery of all unwatched tasks would
activate optional/dormant work and could intrude on legitimate human review.

## Two reported stop classes

T4 comment 10688 and Product 10693 corroborate an earlier November 5 denial:
an action was rejected around 02:03 Berlin, and the concrete user handoff was
missing until 16:26. Product was also in Waiting. The steward reports no
attention on the relevant tasks during that interval. The denial itself needs
to remain respected; the failure to notify or continue independent work is a
separate coordination failure. Exact trusted-reviewer provenance remains unknown.

At 21:09 the user again requested progress (T1/11141). T2/11150 reports the failed
T279 fixture and the concrete source correction, and closes T280/T281 from
already executed evidence. This recovery was already happening when inspected;
the audit did not initiate it. No hardware/permission blocker was reported for
this later continuation. Do not assign both incidents the same immediate cause.

## Recommended framework behavior

Extend recovery to **unfinished required branches with no executable continuation**,
including unwatched targets. Use generic relationship and activation semantics,
not hardcoded column names or idle-game roles.

1. From an active agent-owned responsibility, inspect each unresolved dependency
   branch. A dependency by itself does not establish progress. Running or eligible
   queued work, a represented future retry/event, or an explicit legitimate
   user/external wait can explain the branch. A failed/stale activation is a
   recovery condition, not a claim that work will run.
2. Flag an unwatched required leaf with no such explanation. Unrelated running
   work elsewhere must not hide it. In the T279 case, its known consumer T2 can
   discharge the allocation while running, so defer duplicate recovery until
   settlement and reassess. T2 activity does not discharge T288's access problem.
3. Recover the recorded responsible participant, normally the incoming
   relationship's resume agent on the waiting source task, instead of inventing
   a watcher for the leaf. Present the exact blocked path and ask it to arrange
   work, record a concrete blocker, or correct obsolete relationships.
4. Deduplicate recovery, recheck at dispatch, preserve process pause, suspension,
   stale-version and attention authority, and bound unsuccessful recovery before
   creating actionable user attention. Ordinary column shuffling or recreating
   the same unresolved wait must not provide unlimited attempts for one incident.
5. Model human/external waits explicitly enough to identify the responsible
   party and return condition. A comment saying 'waiting' is not that state.
   Avoid making one unrelated human blocker suppress all other branches.

Start with the existing event-driven reconciliation points, not arbitrary
periodic agent polling. If a future wait has a real time condition, schedule that
specific wake/deadline. Do not auto-complete work, bypass permission refusals, or
create repeated upload/test attempts to make a detector green.

A first implementation can report and recover orphaned dependency branches using
existing resume ownership. Durable handoff/resource-wait representation can then
replace the ambiguous comment-only promises. Root tasks parked outside watched
columns also need an explicit active/dormant intent or recovery owner; inferring
all of that from generic column names would be unsafe. Capture this design
boundary rather than silently declaring unwatched means optional.

## Required regression cases

- Watched parent waiting on idle unwatched child: recover the responsible parent.
- Parent is running and arranging that child's next action: no competing wake;
  recheck after settlement and detect if the action was never arranged.
- Another branch is active while one required branch is orphaned: do not hide it.
- Child needs parent-owned integration/resource work: do not require a cyclic
  Completion relationship to express the handoff.
- Genuine surfaced human wait, pause, optional backlog and completed work remain
  quiet; an agent-only comment about missing human authorization is not sufficient.
- Shared targets/multiple parents, restarts, stale definitions and repeated
  reconciliation do not multiply recovery requests or erase the retry budget.

This is proposed framework work, not another deployed prose correction. Follow-up
tickets 01/02 in the parent assessment remain the implementation route. No claim
that these semantics have been implemented or tested against the runtime is made.
