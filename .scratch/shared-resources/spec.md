# Shared resources — issue 106

**Status:** implemented and reviewed — awaiting user review
**Parent:** [106](../agent-coordination-framework/issues/106-represent-shared-resource-ownership-and-waits.md)
**Approved:** 2026-11-10, grilling conversation; implementation and routine decisions authorized without further confirmations.

## Problem Statement

Unrelated tasks need exclusive use of a native game window or similar project
resource. A participant awaiting access has no durable continuation, so stall
recovery repeatedly activates it or escalates to the user. Reservation tasks and
manual allocator messages add coordination overhead and cannot atomically claim.

## Solution

Represent project-local shared resources directly. Users and agents can create
resources with a required title and optional description, identified by sequential R-0001-style IDs.
Tasks own claims; each claim remembers the requesting participant. Requesting an
available resource grants ownership immediately. Otherwise the durable FIFO queue
records a legitimate wait. Release assigns ownership to the next task and appends
exactly one activation for its requesting agent in the same transaction. Resource
utilization is secondary to predictable, durable continuation.

## User Stories

1. As a user, I can create a named resource with a description so agents can coordinate access.
2. As an agent, I can discover, inspect, and create resources without creating artificial tasks.
3. As an agent, I can claim a resource for my current task and learn whether it is held or pending.
4. As an agent, I can immediately use a free resource without a redundant activation.
5. As an agent, I can end my turn while queued without triggering stall recovery.
6. As a participant, I can continue unrelated work and receive normal activations while my task waits.
7. As a requesting participant, I receive a grant activation when my queued claim becomes held.
8. As a participant, I receive that activation in normal task order even if another agent is running.
9. As an agent on the owning task, I can release a held claim or cancel a pending claim through one command.
10. As a waiter, I receive access in FIFO order without newcomers overtaking me.
11. As an agent, duplicate active claims for my task and resource fail with the existing claim identified.
12. As an agent, completion fails while any held or pending claims remain and tells me how to resolve them.
13. As a user, moving a task to Completion implicitly releases held claims and cancels pending ones.
14. As a user, I can see a quiet Shared resources row on the overview with resource cards, owner and queue count.
15. As a user, I can open a resource detail page showing title, description, owner and ordered waiters linked to tasks.
16. As a user, I can see held and pending claims with requesting agents in the task sidebar, hidden when empty.
17. As an inspecting agent, I can see those same ownership, queue and participant facts.
18. As a user or agent, I can retire an unused resource through archival; any held or pending claim prevents it.
19. As a user, I find resource archival only on resource detail, with no user claim/release buttons.
20. As a participant, I can follow claim requests, grants, cancellations and releases in the task timeline.
21. As a grant recipient, my activation context tells me whether its exact claim is still held or has been released.
22. As an agent, an operation creating a combined dependency/resource cycle fails with an actionable blocking chain.
23. As a user, pauses, failed attempts and restarts preserve ownership and waiting without guessing whether external use stopped.

## Implementation Decisions

- CoordinationApplication remains the only command/query authority. A focused resource module participates in existing SQLite transactions; adapters never allocate independently. Add a released migration using the existing migration ledger and snapshot conventions.
- Resource definitions are live project data, not process YAML or machine-wide locks. Titles/descriptions use normal validation and editing conventions. Archived resources remain inspectable but cannot be claimed; no deletion or unarchive feature required.
- Claims retain a unique immutable identity, resource, owning task, requesting agent and ordered lifecycle facts. At most one active (pending/held) claim per task/resource and one holder per resource. Completed/archived tasks cannot request claims. A normal duplicate request fails; transport retries follow existing idempotency semantics.
- Agent claim/release scope comes from authenticated task/participant context. Any participant on that task may release, but cross-task and human direct claim/release operations are not exposed. Users and agents can create/edit/archive resource definitions.
- Release pending means cancellation; release held means FIFO handoff. Releasing a closed claim must not affect a later claim. No timeout, pause, failure, restart, or task movement other than explicit human Completion automatically releases ownership.
- Grant and continuation persist atomically, even for busy, paused or suspended recipient tasks. Preserve existing activation ordering and eligibility, rather than skipping queue heads. Initial immediate grant produces no activation.
- Pending claims suppress/reset stall recovery like unresolved relationships, without blocking normal activations. Held ownership alone does not exempt a task from recovery. Project views must reflect resource waiting, not just existing relationship waiting.
- Agent Completion fails for either held or pending claims. Human Completion clears all of that task's active claims and performs successor handoffs transactionally. Task archival cannot orphan active claims, even if requested before Completion.
- Resource archival fails for either held or pending claims. Only detail has its browser archive control.
- All claim lifecycle changes are attributable immutable task activity. Grant activations remain independent of subsequent release/cancellation and retain their specific claim identity. Activation context supplies that claim's current status; an agent need not issue a separate verification query. Current status must be refreshed for retries/continuations too, not frozen forever in an earlier payload. Historical grant facts remain historical.
- Combined cycle rejection covers task dependency and parent-child relationships plus resource ordering (waiter to holder/earlier waiter). Check both resource requests and relationship creation, atomically. Preserve existing rejection of cycles across retained task relationships, including satisfied ones. Explain involved tasks/resources and suggest inspecting/consulting participants to release resources or remove unnecessary dependencies. Rejected operations create no claim, activity, activation or special recovery exemption.
- Process changes must not silently lose the responsible agent or orphan future grants; use existing process-impact validation conventions for live pending claims. Do not introduce automatic retargeting.
- Browser UI uses a supporting Shared resources row distinct from boards, horizontal cards, small detail page, and held/pending task sidebar. Reuse accessible components, shared SVG icons if needed, polling and existing navigation. Design dark first, verify light mode. No user claim/release controls.

## Testing Decisions

Use red/green behavior slices through CoordinationApplication with real ephemeral
or file-backed state, authenticated agent HTTP/MCP integration, and browser flows.
Reuse relationship resume-owner, stall recovery, command idempotency, migration,
task timeline and task sidebar tests as prior art. Test observations through public
queries rather than private module mocks. Verify FIFO exclusivity, duplicate and
retry behavior, durable restart, grant ordering/current context, completion actor
distinction, archival, scope enforcement, cycle chains including queued predecessors,
and rollback with no side effects. Browser tests cover catalog/detail navigation,
creation/edit/archive, owner/waiter/task links, conditional sidebar, and readability
in both themes. Any new icon-only pattern needs geometry/accessibility coverage.
Run typechecks during slices and the full suite at completion; review Standards and Spec separately.

## Out of Scope

Cross-project coordination; resource capacity/priorities; efficient utilization or
skipping busy waiters; external process enforcement; timeouts/leases; cross-task
release; user claim/release buttons; artificial reservation tasks; changes to the
running Idle Game process; new recovery exemptions for rejected cyclic requests.

## Further Notes

The user explicitly prioritizes reliable future activation over immediate use.
Human Completion is intentional authority to release coordination ownership; it is
not proof that an external native process has exited. Agent guidance must remind
participants to stop using resources and release claims before completing work.
Implementation tickets: [01](issues/01-resource-catalog.md),
[02](issues/02-claim-and-wake-lifecycle.md), [03](issues/03-combined-wait-cycles.md).


## Delivery validation — 2026-11-10

All three implementation tickets are complete. Changes remain unstaged against
baseline `f39d0af6d1e9f4654678089113f312535c104baa`. No running project process was
modified or restarted.

- Typechecking and production build pass. Focused application, real HTTP/MCP,
  migration, claim/cycle and dark/light browser checks pass.
- Full Node run: 510 tests, 499 passed, 6 skipped, 5 failed. Four failures exposed
  a plain-object response regression during provenance-helper extraction; that
  was fixed, and all four now pass in focused reruns (26 related tests plus all
  3 compact-command-result tests pass). The remaining self-authored activation
  test in agent-conversation also fails on the untouched baseline: it attempts
  a self-mention now rejected by issue 107. It is not changed by this feature.
- Earlier full-run migration/API inventory failures were fixed and verified in
  a 41-test related run. Two intermittent Git archival failures were investigated:
  one reproduced on the baseline, and both passed in the subsequent full run.
- Full browser run: 261 passed, one attachment-drop test failed; that unrelated
  test passed when rerun alone. All resource and cycle browser tests passed.
- Rendered resource detail and task sidebar were inspected in dark/light mode.

### Standards review

One actionable finding: resource commands initially omitted the existing running
attempt provenance check. Fixed by sharing the task validator, carrying catalog
attempt identity through authenticated routes, and testing valid/mismatched/settled
callers without side effects. One maintainability finding: resource readers leaked
SQL predicates. Fixed with focused active-task and exact-claim query functions.
The reviewer rechecked both fixes and reported no residual issues.

### Spec review

No substantive findings. Completion rejection was additionally improved to name
held/pending claims and explain coordination plus `resource.release` before retry.

Final review outcome: Standards 0 unresolved (1 correctness and 1 maintainability
finding resolved); Spec 0 substantive findings.


## UI refinement after user review

Resource details reuse the task detail top bar, ID/title hierarchy, description
panel with Edit and More actions / Archive, and a main-column claims panel styled
like Agent Activity. Claims list the current holder and FIFO waiting tasks with
requesting-agent context. Resource links preserve board navigation and scroll.

The board shows resources below all boards in a raised, column-like section,
with a shared plus icon and count. Project-wide labeling distinguishes resources
from workflow columns. The existing archived toggle includes resources too.

The task sidebar uses the same heading and relationship-row hierarchy as other
panels: prominent yellow Waiting on or green Claimed badge, bold resource title,
resource ID beneath, and explicit Requested by agent attribution. No claim or
release controls are added. Validate both themes, navigation restoration, and
icon geometry. Agent tools and coordination semantics remain unchanged.


UI refinement validation: typecheck/build and diff whitespace checks passed.
All 22 targeted resource, board-navigation, and sticky-header browser checks
passed, including both themes, narrow layouts, badge/header contrast, plus-icon
centering, shared archive filtering, and horizontal/vertical return positions.
Rendered board, resource detail, and task sidebar screenshots were inspected.
Standards and spec reviews reported no substantive findings. Full Node suite:
503 passed, 6 skipped, 1 failed (the previously reproduced baseline self-authored
activation-source test); this refinement changes no coordination semantics.


### Second UI review refinement

Align the resource row outer edges and header width with board rows; remove the
project-wide subtitle. Reuse task-card hover shadow/lift and title underline,
and show Held by as the existing green running chip. Resource details must
include the real Resume/Pause, Current runs and Settings controls. Remove the
waiting queue heading count and redundant waiting badges. Format claim metadata
as `T-ID · Requested by Agent` and sidebar metadata as `R-ID · Requested by Agent`.
Place sidebar status to the right of resource information, on the same row.
Check the actual browser rendering, geometry, interactions and both themes.

Second refinement validation: build/typecheck passed; 16 resource/navigation browser checks passed including real Resume/Pause UI refresh, both themes, hover/geometry, multi-resource rows, and mobile rendering. Rendered light/dark screenshots inspected. Standards and spec reviews found no actionable issues. Full Node suite: 503 passed, 6 skipped, same one baseline activation-source failure. Changes left unstaged.

Task cards now show a green Holding chip listing held resource IDs; pending resources remain yellow waiting signals. Held ownership also keeps collapsed columns discoverable. Overview projections expose heldResourceIds only when nonempty. Six lifecycle tests and both theme browser checks passed, along with typecheck/build.
